'use strict';

/**
 * timelineService.js — летопись (TimelineEvent)
 *
 * События могут быть привязаны:
 *   - к FamilyNode (события члена рода)
 *   - к Profile   (события на странице памяти)
 *   - ни к чему   (HISTORICAL — событие страны/мира)
 *
 * Контракт фронта (timeline.html):
 *   GET    /api/timeline-events                       → все доступные события (для общей летописи)
 *   GET    /api/timeline-events?treeId=...            → события дерева + исторические
 *   GET    /api/timeline-events?profileId=...         → события профиля
 *   POST   /api/timeline-events
 *   PUT    /api/timeline-events/:id
 *   DELETE /api/timeline-events/:id
 */

const prisma = require('../lib/prisma');
const { ApiError } = require('../middleware/errors');
const { parseDate, formatDate } = require('../lib/dates');
const { loadTreeOr404, assertTreeAccess } = require('./familyService');

const CATEGORIES = [
  'BIRTH', 'DEATH', 'MARRIAGE', 'EDUCATION',
  'CAREER', 'RELOCATION', 'AWARD', 'HISTORICAL', 'CUSTOM',
];

function mapCategory(raw) {
  if (!raw) return 'CUSTOM';
  const upper = String(raw).toUpperCase();
  return CATEGORIES.includes(upper) ? upper : 'CUSTOM';
}

function serializeEvent(e) {
  if (!e) return null;
  return {
    id: e.id,
    familyNodeId: e.familyNodeId,
    profileId: e.profileId,
    category: String(e.category).toLowerCase(),
    title: e.title,
    description: e.description || '',
    date: formatDate(e.date, e.dateAccuracy || 'day'),
    dateAccuracy: e.dateAccuracy || 'day',
    place: e.place || '',
    node: e.familyNode ? {
      id: e.familyNode.id,
      firstName: e.familyNode.firstName,
      lastName: e.familyNode.lastName,
    } : null,
    profile: e.profile ? {
      id: e.profile.id,
      slug: e.profile.slug,
      fullName: e.profile.fullName,
    } : null,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

function buildAutoEvents(nodes) {
  const events = [];
  for (const n of nodes) {
    const fullName = [n.firstName, n.lastName].filter(Boolean).join(' ');
    if (n.birthDate) {
      events.push({
        id: `auto-${n.id || 'profile'}-birth`,
        familyNodeId: n.id || null,
        profileId: null,
        category: 'birth',
        title: `Рождение: ${fullName}`,
        description: '',
        date: formatDate(n.birthDate, 'day'),
        dateAccuracy: 'day',
        place: '',
        node: n.id ? { id: n.id, firstName: n.firstName, lastName: n.lastName } : null,
        profile: null,
        auto: true,
      });
    }
    if (n.deathDate) {
      events.push({
        id: `auto-${n.id || 'profile'}-death`,
        familyNodeId: n.id || null,
        profileId: null,
        category: 'death',
        title: `Смерть: ${fullName}`,
        description: '',
        date: formatDate(n.deathDate, 'day'),
        dateAccuracy: 'day',
        place: '',
        node: n.id ? { id: n.id, firstName: n.firstName, lastName: n.lastName } : null,
        profile: null,
        auto: true,
      });
    }
  }
  return events;
}

/* ── LIST ── */

async function listEvents(query, actor) {
  const { treeId, profileId, includeHistorical = true, includeAuto = true } = query || {};

  // ── РЕЖИМ "ВСЕ" — нет ни treeId, ни profileId ──
  if (!treeId && !profileId) {
    return await listAllEvents({ includeHistorical, includeAuto }, actor);
  }

  // ── РЕЖИМ ПО ДЕРЕВУ ──
  if (treeId) {
    const tree = await loadTreeOr404(treeId);
    assertTreeAccess(tree, actor, 'view');

    const treeNodeIds = await prisma.familyNode.findMany({
      where: { treeId },
      select: { id: true },
    }).then(rs => rs.map(r => r.id));

    const orClauses = [];
    if (treeNodeIds.length) orClauses.push({ familyNodeId: { in: treeNodeIds } });
    if (includeHistorical) orClauses.push({ category: 'HISTORICAL', familyNodeId: null, profileId: null });

    let dbEvents = [];
    if (orClauses.length) {
      dbEvents = await prisma.timelineEvent.findMany({
        where: { OR: orClauses },
        include: {
          familyNode: { select: { id: true, firstName: true, lastName: true } },
          profile: { select: { id: true, slug: true, fullName: true } },
        },
        orderBy: { date: 'asc' },
      });
    }

    let autoEvents = [];
    if (includeAuto) {
      const nodes = await prisma.familyNode.findMany({
        where: { treeId, OR: [{ birthDate: { not: null } }, { deathDate: { not: null } }] },
      });
      autoEvents = buildAutoEvents(nodes);
    }

    return [
      ...dbEvents.map(serializeEvent),
      ...autoEvents,
    ].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }

  // ── РЕЖИМ ПО ПРОФИЛЮ ──
  const profile = await prisma.profile.findUnique({
    where: { id: profileId },
    include: { familyNode: true },
  });
  if (!profile) throw ApiError.notFound('Профиль не найден');

  const orClauses = [{ profileId }];
  if (profile.familyNodeId) orClauses.push({ familyNodeId: profile.familyNodeId });

  const dbEvents = await prisma.timelineEvent.findMany({
    where: { OR: orClauses },
    include: {
      familyNode: { select: { id: true, firstName: true, lastName: true } },
      profile: { select: { id: true, slug: true, fullName: true } },
    },
    orderBy: { date: 'asc' },
  });

  let autoEvents = [];
  if (includeAuto && profile.familyNode) {
    autoEvents = buildAutoEvents([profile.familyNode]);
  } else if (includeAuto && (profile.birthDate || profile.deathDate)) {
    autoEvents = buildAutoEvents([{
      id: null,
      firstName: profile.fullName,
      lastName: '',
      birthDate: profile.birthDate,
      deathDate: profile.deathDate,
    }]);
  }

  return [
    ...dbEvents.map(serializeEvent),
    ...autoEvents,
  ].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

/* ── Режим "Вся летопись" — собираем все доступные actor'у события ── */
async function listAllEvents({ includeHistorical = true, includeAuto = true }, actor) {
  // 1. Какие деревья доступны актору?
  let treeWhere;
  if (actor && actor.role === 'ADMIN') {
    treeWhere = {};
  } else if (actor) {
    treeWhere = { OR: [{ visibility: 'PUBLIC' }, { ownerId: actor.id }] };
  } else {
    treeWhere = { visibility: 'PUBLIC' };
  }

  const trees = await prisma.familyTree.findMany({
    where: treeWhere,
    select: { id: true },
  });
  const treeIds = trees.map(t => t.id);

  // 2. Узлы этих деревьев
  let nodeIds = [];
  let nodesWithDates = [];
  if (treeIds.length) {
    const nodes = await prisma.familyNode.findMany({
      where: { treeId: { in: treeIds } },
      select: {
        id: true, firstName: true, lastName: true, birthDate: true, deathDate: true,
      },
    });
    nodeIds = nodes.map(n => n.id);
    nodesWithDates = nodes.filter(n => n.birthDate || n.deathDate);
  }

  // 3. Все события: исторические + по узлам
  const orClauses = [];
  if (nodeIds.length) orClauses.push({ familyNodeId: { in: nodeIds } });
  if (includeHistorical) orClauses.push({ category: 'HISTORICAL', familyNodeId: null, profileId: null });

  let dbEvents = [];
  if (orClauses.length) {
    dbEvents = await prisma.timelineEvent.findMany({
      where: { OR: orClauses },
      include: {
        familyNode: { select: { id: true, firstName: true, lastName: true } },
        profile: { select: { id: true, slug: true, fullName: true } },
      },
      orderBy: { date: 'asc' },
    });
  }

  // 4. Авто-события BIRTH/DEATH
  const autoEvents = includeAuto ? buildAutoEvents(nodesWithDates) : [];

  return [
    ...dbEvents.map(serializeEvent),
    ...autoEvents,
  ].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

/* ── CRUD ── */

async function _checkEventAccess(input, actor, mode = 'edit') {
  if (!input.familyNodeId && !input.profileId) {
    if (!actor || actor.role !== 'ADMIN') {
      throw ApiError.forbidden('Исторические события создаёт только администратор');
    }
    return;
  }

  if (input.familyNodeId) {
    const node = await prisma.familyNode.findUnique({ where: { id: input.familyNodeId } });
    if (!node) throw ApiError.notFound('Узел не найден');
    const tree = await loadTreeOr404(node.treeId);
    assertTreeAccess(tree, actor, mode);
  }

  if (input.profileId) {
    const profile = await prisma.profile.findUnique({ where: { id: input.profileId } });
    if (!profile) throw ApiError.notFound('Профиль не найден');
    if (!actor) throw ApiError.unauthorized();
    if (actor.role !== 'ADMIN' && profile.ownerId !== actor.id) {
      const access = await prisma.profileAccess.findUnique({
        where: { profileId_userId: { profileId: profile.id, userId: actor.id } },
      });
      if (!access || !access.canEdit) throw ApiError.forbidden('Нет прав на редактирование профиля');
    }
  }
}

async function createEvent(input, actor) {
  const { familyNodeId, profileId, category, title, description, date, place } = input || {};
  if (!title || !String(title).trim()) throw ApiError.badRequest('Укажите название события');
  if (!date) throw ApiError.badRequest('Укажите дату события');

  await _checkEventAccess(input, actor, 'edit');

  const parsed = parseDate(date);
  if (!parsed.date) throw ApiError.badRequest('Не удалось распознать дату');

  const event = await prisma.timelineEvent.create({
    data: {
      familyNodeId: familyNodeId || null,
      profileId: profileId || null,
      category: mapCategory(category),
      title: String(title).trim(),
      description: description ? String(description).trim() : null,
      date: parsed.date,
      dateAccuracy: parsed.accuracy || 'day',
      place: place ? String(place).trim() : null,
    },
    include: {
      familyNode: { select: { id: true, firstName: true, lastName: true } },
      profile: { select: { id: true, slug: true, fullName: true } },
    },
  });

  return serializeEvent(event);
}

async function updateEvent(eventId, input, actor) {
  if (String(eventId).startsWith('auto-')) {
    throw ApiError.badRequest('Авто-события нельзя редактировать. Измените дату узла в дереве.');
  }
  const event = await prisma.timelineEvent.findUnique({ where: { id: eventId } });
  if (!event) throw ApiError.notFound('Событие не найдено');

  await _checkEventAccess(event, actor, 'edit');

  const data = {};
  if (input.title !== undefined) data.title = String(input.title).trim();
  if (input.description !== undefined) data.description = input.description ? String(input.description).trim() : null;
  if (input.category !== undefined) data.category = mapCategory(input.category);
  if (input.place !== undefined) data.place = input.place ? String(input.place).trim() : null;
  if (input.date !== undefined) {
    const parsed = parseDate(input.date);
    if (!parsed.date) throw ApiError.badRequest('Не удалось распознать дату');
    data.date = parsed.date;
    data.dateAccuracy = parsed.accuracy || 'day';
  }

  const updated = await prisma.timelineEvent.update({
    where: { id: eventId },
    data,
    include: {
      familyNode: { select: { id: true, firstName: true, lastName: true } },
      profile: { select: { id: true, slug: true, fullName: true } },
    },
  });

  return serializeEvent(updated);
}

async function deleteEvent(eventId, actor) {
  if (String(eventId).startsWith('auto-')) {
    throw ApiError.badRequest('Авто-события нельзя удалить. Очистите дату узла в дереве.');
  }
  const event = await prisma.timelineEvent.findUnique({ where: { id: eventId } });
  if (!event) throw ApiError.notFound('Событие не найдено');
  await _checkEventAccess(event, actor, 'edit');
  await prisma.timelineEvent.delete({ where: { id: eventId } });
  return { id: eventId };
}

module.exports = {
  listEvents,
  createEvent,
  updateEvent,
  deleteEvent,
};