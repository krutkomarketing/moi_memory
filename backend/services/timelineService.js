'use strict';

/**
 * timelineService.js — летопись (TimelineEvent)
 *
 * События могут быть привязаны:
 *  - к FamilyNode (события члена рода)
 *  - к Profile   (события на странице памяти)
 *  - ни к чему   (HISTORICAL — событие страны/мира)
 *
 * LIST:
 *  GET /api/timeline-events
 *    - ?scope=all|personal|historical (default: all)
 *    - ?treeId=... | ?profileId=...
 *    - ?includeHistorical=1|0 (legacy, optional)
 *    - ?includeAuto=1|0 (default: 1)
 *    - ?includeWitnesses=1 (only for historical/all; expensive)
 *
 * CRUD:
 *  POST   /api/timeline-events
 *  PUT    /api/timeline-events/:id
 *  DELETE /api/timeline-events/:id          (soft delete -> deletedAt)
 *
 * Admin-only historical shortcut:
 *  GET    /api/timeline/historical
 *  POST   /api/timeline/historical
 *  PUT    /api/timeline/historical/:id
 *  DELETE /api/timeline/historical/:id      (soft delete -> deletedAt)
 */

const prisma = require('../lib/prisma');
const { ApiError } = require('../middleware/errors');
const { parseDate, formatDate } = require('../lib/dates');
const { loadTreeOr404, assertTreeAccess } = require('./familyService');

const CATEGORIES = [
  'BIRTH',
  'DEATH',
  'MARRIAGE',
  'EDUCATION',
  'CAREER',
  'RELOCATION',
  'AWARD',
  'HISTORICAL',
  'CUSTOM',
];

function mapCategory(raw) {
  if (!raw) return 'CUSTOM';
  const upper = String(raw).toUpperCase();
  return CATEGORIES.includes(upper) ? upper : 'CUSTOM';
}

function serializeEvent(e, extra = {}) {
  if (!e) return null;
  return {
    id: e.id,
    iconKey: e.iconKey || null,
    witnesses: extra.witnesses || undefined,

    familyNodeId: e.familyNodeId,
    profileId: e.profileId,

    category: String(e.category).toLowerCase(),
    title: e.title,
    description: e.description || '',
    date: formatDate(e.date, e.dateAccuracy || 'day'),
    dateAccuracy: e.dateAccuracy || 'day',
    place: e.place || '',

    node: e.familyNode
      ? { id: e.familyNode.id, firstName: e.familyNode.firstName, lastName: e.familyNode.lastName }
      : null,

    profile: e.profile
      ? { id: e.profile.id, slug: e.profile.slug, fullName: e.profile.fullName }
      : null,

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

function normalizeScope(scopeRaw) {
  const s = String(scopeRaw || 'all').toLowerCase();
  if (s === 'historical' || s === 'personal' || s === 'all') return s;
  return 'all';
}

function scopeToIncludeFlags(scope) {
  if (scope === 'historical') return { includeHistorical: true, includePersonal: false };
  if (scope === 'personal') return { includeHistorical: false, includePersonal: true };
  return { includeHistorical: true, includePersonal: true };
}

/* ────────────────────────────────────────────────────────────── */
/* LIST */
/* ────────────────────────────────────────────────────────────── */

async function listEvents(query, actor) {
  const {
    treeId,
    profileId,

    // new
    scope: scopeRaw = 'all',
    includeWitnesses = false,

    // legacy flags (keep for backward compatibility)
    includeHistorical: includeHistoricalRaw,
    includeAuto: includeAutoRaw,
  } = query || {};

  const scope = normalizeScope(scopeRaw);
  const includeAuto = includeAutoRaw === undefined ? true : (includeAutoRaw === true || includeAutoRaw === '1' || includeAutoRaw === 'true');

  // If legacy includeHistorical explicitly provided -> override scope historical toggle only
  const flags = scopeToIncludeFlags(scope);
  const includeHistorical =
    includeHistoricalRaw === undefined
      ? flags.includeHistorical
      : (includeHistoricalRaw === true || includeHistoricalRaw === '1' || includeHistoricalRaw === 'true');

  const includePersonal = flags.includePersonal;

  // ── РЕЖИМ "ВСЕ" — нет ни treeId, ни profileId ──
  if (!treeId && !profileId) {
    return await listAllEvents(
      { includeHistorical, includePersonal, includeAuto, includeWitnesses: includeWitnesses === true || includeWitnesses === '1' || includeWitnesses === 'true' },
      actor,
    );
  }

  // ── РЕЖИМ ПО ДЕРЕВУ ──
  if (treeId) {
    const tree = await loadTreeOr404(treeId);
    assertTreeAccess(tree, actor, 'view');

    const treeNodeIds = await prisma.familyNode
      .findMany({ where: { treeId }, select: { id: true } })
      .then((rs) => rs.map((r) => r.id));

    const orClauses = [];
    if (includePersonal && treeNodeIds.length) orClauses.push({ familyNodeId: { in: treeNodeIds } });
    if (includeHistorical) orClauses.push({ category: 'HISTORICAL', familyNodeId: null, profileId: null });

    let dbEvents = [];
    if (orClauses.length) {
      dbEvents = await prisma.timelineEvent.findMany({
        where: { AND: [{ deletedAt: null }, { OR: orClauses }] },
        include: {
          familyNode: { select: { id: true, firstName: true, lastName: true } },
          profile: { select: { id: true, slug: true, fullName: true } },
        },
        orderBy: { date: 'asc' },
      });
    }

    let autoEvents = [];
    if (includeAuto && includePersonal) {
      const nodes = await prisma.familyNode.findMany({
        where: { treeId, OR: [{ birthDate: { not: null } }, { deathDate: { not: null } }] },
      });
      autoEvents = buildAutoEvents(nodes);
    }

    let witnessesByEventId = {};
    const shouldComputeWitnesses = includeWitnesses === true || includeWitnesses === '1' || includeWitnesses === 'true';
    if (shouldComputeWitnesses) {
      witnessesByEventId = await computeWitnesses(dbEvents.filter((e) => e.category === 'HISTORICAL'));
    }

    return [
      ...dbEvents.map((e) => serializeEvent(e, { witnesses: witnessesByEventId[e.id] })),
      ...autoEvents,
    ].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }

  // ── РЕЖИМ ПО ПРОФИЛЮ ──
  const profile = await prisma.profile.findUnique({
    where: { id: profileId },
    include: { familyNode: true },
  });
  if (!profile) throw ApiError.notFound('Профиль не найден');

  const orClauses = [];
  if (includePersonal) {
    orClauses.push({ profileId });
    if (profile.familyNodeId) orClauses.push({ familyNodeId: profile.familyNodeId });
  }
  if (includeHistorical) {
    orClauses.push({ category: 'HISTORICAL', familyNodeId: null, profileId: null });
  }

  const dbEvents = orClauses.length
    ? await prisma.timelineEvent.findMany({
        where: { AND: [{ deletedAt: null }, { OR: orClauses }] },
        include: {
          familyNode: { select: { id: true, firstName: true, lastName: true } },
          profile: { select: { id: true, slug: true, fullName: true } },
        },
        orderBy: { date: 'asc' },
      })
    : [];

  let autoEvents = [];
  if (includeAuto && includePersonal && profile.familyNode) {
    autoEvents = buildAutoEvents([profile.familyNode]);
  } else if (includeAuto && includePersonal && (profile.birthDate || profile.deathDate)) {
    autoEvents = buildAutoEvents([
      {
        id: null,
        firstName: profile.fullName,
        lastName: '',
        birthDate: profile.birthDate,
        deathDate: profile.deathDate,
      },
    ]);
  }

  let witnessesByEventId = {};
  const shouldComputeWitnesses = includeWitnesses === true || includeWitnesses === '1' || includeWitnesses === 'true';
  if (shouldComputeWitnesses) {
    witnessesByEventId = await computeWitnesses(dbEvents.filter((e) => e.category === 'HISTORICAL'));
  }

  return [
    ...dbEvents.map((e) => serializeEvent(e, { witnesses: witnessesByEventId[e.id] })),
    ...autoEvents,
  ].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

/* ── Режим "Вся летопись" — собираем все доступные actor'у события ── */
async function listAllEvents({ includeHistorical = true, includePersonal = true, includeAuto = true, includeWitnesses = false }, actor) {
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
  const treeIds = trees.map((t) => t.id);

  // 2. Узлы этих деревьев
  let nodeIds = [];
  let nodesWithDates = [];
  if (treeIds.length && includePersonal) {
    const nodes = await prisma.familyNode.findMany({
      where: { treeId: { in: treeIds } },
      select: { id: true, firstName: true, lastName: true, birthDate: true, deathDate: true },
    });
    nodeIds = nodes.map((n) => n.id);
    nodesWithDates = nodes.filter((n) => n.birthDate || n.deathDate);
  }

  // 3. Все события: исторические + по узлам
  const orClauses = [];
  if (includePersonal && nodeIds.length) orClauses.push({ familyNodeId: { in: nodeIds } });
  if (includeHistorical) orClauses.push({ category: 'HISTORICAL', familyNodeId: null, profileId: null });

  let dbEvents = [];
  if (orClauses.length) {
    dbEvents = await prisma.timelineEvent.findMany({
      where: { AND: [{ deletedAt: null }, { OR: orClauses }] },
      include: {
        familyNode: { select: { id: true, firstName: true, lastName: true } },
        profile: { select: { id: true, slug: true, fullName: true } },
      },
      orderBy: { date: 'asc' },
    });
  }

  // 4. Авто-события BIRTH/DEATH
  const autoEvents = includeAuto && includePersonal ? buildAutoEvents(nodesWithDates) : [];

  // 5. Witnesses для HISTORICAL — только по флагу
  let witnessesByEventId = {};
  if (includeWitnesses) {
    witnessesByEventId = await computeWitnesses(dbEvents.filter((e) => e.category === 'HISTORICAL'));
  }

  return [
    ...dbEvents.map((e) => serializeEvent(e, { witnesses: witnessesByEventId[e.id] })),
    ...autoEvents,
  ].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

/**
 * Помощник: для списка исторических событий вернуть {eventId: [{id, slug, fullName}, ...]}
 */
async function computeWitnesses(historicalEvents) {
  if (!historicalEvents || historicalEvents.length === 0) return {};

  const profiles = await prisma.profile.findMany({
    where: { visibility: 'PUBLIC', deletedAt: null, birthDate: { not: null } },
    select: { id: true, slug: true, fullName: true, birthDate: true, deathDate: true },
  });

  const result = {};
  for (const ev of historicalEvents) {
    const year = ev.date.getFullYear();
    result[ev.id] = profiles
      .filter((p) => {
        const born = p.birthDate.getFullYear();
        const died = p.deathDate ? p.deathDate.getFullYear() : 9999;
        return born <= year && year <= died;
      })
      .map((p) => ({ id: p.id, slug: p.slug, fullName: p.fullName }));
  }

  return result;
}

/* ────────────────────────────────────────────────────────────── */
/* CRUD */
/* ────────────────────────────────────────────────────────────── */

async function _checkEventAccess(input, actor, mode = 'edit') {
  // historical: only ADMIN
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
  const { familyNodeId, profileId, category, title, description, date, place, iconKey } = input || {};

  if (!title || !String(title).trim()) throw ApiError.badRequest('Укажите название события');
  if (!date) throw ApiError.badRequest('Укажите дату события');

  await _checkEventAccess(input, actor, 'edit');

  const parsed = parseDate(date);
  if (!parsed.date) throw ApiError.badRequest('Не удалось распознать дату');

  const event = await prisma.timelineEvent.create({
    data: {
      familyNodeId: familyNodeId || null,
      profileId: profileId || null,

      // historical invariant: if both null -> category must be HISTORICAL
      category: (!familyNodeId && !profileId) ? 'HISTORICAL' : mapCategory(category),

      title: String(title).trim(),
      description: description ? String(description).trim() : null,
      date: parsed.date,
      dateAccuracy: parsed.accuracy || 'day',
      place: place ? String(place).trim() : null,
      iconKey: iconKey ? String(iconKey).trim() : null,
      createdById: actor?.id || null,
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

  // HISTORICAL нельзя превратить в personal и наоборот через update: сохраняем существующую “привязку”.
  if (input.category !== undefined) {
    if (!event.familyNodeId && !event.profileId) {
      data.category = 'HISTORICAL';
    } else {
      data.category = mapCategory(input.category);
    }
  }

  if (input.place !== undefined) data.place = input.place ? String(input.place).trim() : null;
  if (input.iconKey !== undefined) data.iconKey = input.iconKey ? String(input.iconKey).trim() : null;

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

async function softDeleteEvent(eventId, actor) {
  if (String(eventId).startsWith('auto-')) {
    throw ApiError.badRequest('Авто-события нельзя удалить. Очистите дату узла в дереве.');
  }

  const event = await prisma.timelineEvent.findUnique({ where: { id: eventId } });
  if (!event) throw ApiError.notFound('Событие не найдено');

  await _checkEventAccess(event, actor, 'edit');

  await prisma.timelineEvent.update({
    where: { id: eventId },
    data: { deletedAt: new Date() },
  });

  return { id: eventId };
}

/* ────────────────────────────────────────────────────────────── */
/* Admin-only shortcuts (optional, but kept) */
/* ────────────────────────────────────────────────────────────── */

async function listHistoricalEvents(actor, { includeWitnesses = false } = {}) {
  // allow reading historical for everyone (optionalAuth in router), but still respect deletedAt
  const events = await prisma.timelineEvent.findMany({
    where: { category: 'HISTORICAL', familyNodeId: null, profileId: null, deletedAt: null },
    include: {
      familyNode: { select: { id: true, firstName: true, lastName: true } },
      profile: { select: { id: true, slug: true, fullName: true } },
    },
    orderBy: { date: 'asc' },
  });

  let witnessesByEventId = {};
  if (includeWitnesses) {
    witnessesByEventId = await computeWitnesses(events);
  }

  return events.map((e) => serializeEvent(e, { witnesses: witnessesByEventId[e.id] }));
}

async function createHistoricalEvent(input, actor) {
  await _checkEventAccess({ familyNodeId: null, profileId: null }, actor, 'edit');
  return await createEvent({ ...input, category: 'HISTORICAL', familyNodeId: null, profileId: null }, actor);
}

async function updateHistoricalEvent(eventId, input, actor) {
  const event = await prisma.timelineEvent.findUnique({ where: { id: eventId } });
  if (!event) throw ApiError.notFound('Событие не найдено');
  if (event.familyNodeId || event.profileId || event.category !== 'HISTORICAL') {
    throw ApiError.badRequest('Это не историческое событие');
  }
  await _checkEventAccess(event, actor, 'edit');
  return await updateEvent(eventId, input, actor);
}

async function softDeleteHistoricalEvent(eventId, actor) {
  const event = await prisma.timelineEvent.findUnique({ where: { id: eventId } });
  if (!event) throw ApiError.notFound('Событие не найдено');
  if (event.familyNodeId || event.profileId || event.category !== 'HISTORICAL') {
    throw ApiError.badRequest('Это не историческое событие');
  }
  await _checkEventAccess(event, actor, 'edit');
  return await softDeleteEvent(eventId, actor);
}

module.exports = {
  listEvents,
  createEvent,
  updateEvent,
  softDeleteEvent,

  // optional historical shortcuts (router uses them)
  listHistoricalEvents,
  createHistoricalEvent,
  updateHistoricalEvent,
  softDeleteHistoricalEvent,
};