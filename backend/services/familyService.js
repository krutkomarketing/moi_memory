'use strict';

/**
 * familyService.js — деревья, кланы, узлы, связи
 *
 * Контракт фронта (family-tree.html, js/family-tree.js):
 *   GET    /api/family-trees                      → список моих деревьев
 *   POST   /api/family-trees                      → { name, description?, visibility? }
 *   GET    /api/family-trees/:id                  → дерево + nodes + clans + connections
 *   PUT    /api/family-trees/:id
 *   DELETE /api/family-trees/:id
 *
 *   POST   /api/family-clans                      → { treeId, name, color?, icon?, description? }
 *   PUT    /api/family-clans/:id
 *   DELETE /api/family-clans/:id
 *
 *   POST   /api/family-nodes                      → { treeId, firstName, lastName?, birth?, death?, gender?, clanId?, ... }
 *   PUT    /api/family-nodes/:id
 *   DELETE /api/family-nodes/:id
 *
 *   POST   /api/family-connections                → { fromNodeId, toNodeId, type, startDate?, endDate? }
 *                                                   фронт шлёт type='marriage' → SPOUSE
 *   DELETE /api/family-connections/:id
 *
 * Все Service-функции:
 *   - принимают actorUser (из JWT) для проверок прав
 *   - кидают ApiError (403/404/400) — ловится в errors.js
 */

const prisma = require('../lib/prisma');
const { ApiError } = require('../middleware/errors');
const { parseDate, parseRange, formatDate } = require('../lib/dates');

/* ───────────────────────────────────────────
   ENUM MAPPING (фронт ↔ Prisma)
─────────────────────────────────────────── */

const RELATION_MAP = {
    parent: 'PARENT',
    child: 'PARENT',
    marriage: 'SPOUSE',
    spouse: 'SPOUSE',
    adoptive: 'ADOPTIVE',
    step: 'STEP',
};

const GENDER_MAP = {
    male: 'MALE', m: 'MALE', 'м': 'MALE',
    female: 'FEMALE', f: 'FEMALE', 'ж': 'FEMALE',
    unknown: 'UNKNOWN', '': 'UNKNOWN',
};

function mapGender(raw) {
    if (!raw) return 'UNKNOWN';
    const key = String(raw).toLowerCase().trim();
    return GENDER_MAP[key] || 'UNKNOWN';
}

function mapRelation(raw) {
    if (!raw) throw ApiError.badRequest('Не указан тип связи');
    const key = String(raw).toLowerCase().trim();
    const mapped = RELATION_MAP[key];
    if (!mapped) throw ApiError.badRequest(`Неизвестный тип связи: ${raw}`);
    return mapped;
}

/* ───────────────────────────────────────────
   SERIALIZATION (Prisma → фронт)
─────────────────────────────────────────── */

function serializeNode(n) {
    if (!n) return null;
    return {
        id: n.id,
        treeId: n.treeId,
        firstName: n.firstName,
        lastName: n.lastName || '',
        maidenName: n.maidenName || '',
        fullName: [n.firstName, n.lastName].filter(Boolean).join(' '),
        birth: n.birthDate ? formatDate(n.birthDate, 'day') : '',
        death: n.deathDate ? formatDate(n.deathDate, 'day') : '',
        gender: String(n.gender || 'UNKNOWN').toLowerCase(),
        photoId: n.photoId,
        photo: n.photo ? n.photo.url : null,
        clanId: n.clanId,
        clan: n.clan ? serializeClan(n.clan) : null,
        notes: n.notes || '',
        posX: n.posX,
        posY: n.posY,
        generation: n.generation,
        profileId: n.profile ? n.profile.id : null,
        profileSlug: n.profile ? n.profile.slug : null,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
    };
}

function serializeClan(c) {
    if (!c) return null;
    return {
        id: c.id,
        treeId: c.treeId,
        name: c.name,
        color: c.color,
        icon: c.icon,
        description: c.description || '',
    };
}

function serializeConnection(c) {
    if (!c) return null;
    return {
        id: c.id,
        fromNodeId: c.fromNodeId,
        toNodeId: c.toNodeId,
        type: String(c.type).toLowerCase(),
        startDate: c.startDate ? formatDate(c.startDate, 'day') : '',
        endDate: c.endDate ? formatDate(c.endDate, 'day') : '',
        notes: c.notes || '',
    };
}

function serializeTree(t) {
    if (!t) return null;
    return {
        id: t.id,
        name: t.name,
        description: t.description || '',
        ownerId: t.ownerId,
        visibility: t.visibility,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        nodes: (t.nodes || []).map(serializeNode),
        clans: (t.clans || []).map(serializeClan),
        connections: (t.connections || []).map(serializeConnection),
    };
}

/* ───────────────────────────────────────────
   ACCESS CONTROL
─────────────────────────────────────────── */

async function loadTreeOr404(treeId, { includeNodes = false } = {}) {
    const tree = await prisma.familyTree.findUnique({
        where: { id: treeId },
        include: includeNodes
            ? {
                nodes: {
                    include: { photo: true, clan: true, profile: { select: { id: true, slug: true } } },
                    orderBy: [{ generation: 'asc' }, { birthDate: 'asc' }],
                },
                clans: { orderBy: { name: 'asc' } },
            }
            : undefined,
    });
    if (!tree) throw ApiError.notFound('Дерево не найдено');
    return tree;
}

function assertTreeAccess(tree, actor, mode = 'view') {
    if (!actor) {
        if (mode === 'view' && tree.visibility === 'PUBLIC') return;
        throw ApiError.unauthorized();
    }
    if (actor.role === 'ADMIN') return;
    if (tree.ownerId === actor.id) return;
    if (mode === 'view' && tree.visibility === 'PUBLIC') return;
    if (mode === 'view' && tree.visibility === 'UNLISTED') return;
    throw ApiError.forbidden('Нет доступа к этому дереву');
}

/* ───────────────────────────────────────────
   TREES
─────────────────────────────────────────── */

async function listTrees(actor) {
    if (!actor) throw ApiError.unauthorized();
    const trees = await prisma.familyTree.findMany({
        where: actor.role === 'ADMIN' ? {} : { ownerId: actor.id },
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { nodes: true, clans: true } } },
    });
    return trees.map(t => ({
        ...serializeTree(t),
        nodesCount: t._count.nodes,
        clansCount: t._count.clans,
    }));
}

async function getTree(treeId, actor) {
    const tree = await loadTreeOr404(treeId, { includeNodes: true });
    assertTreeAccess(tree, actor, 'view');
    const connections = await prisma.familyConnection.findMany({
        where: { fromNode: { treeId } },
        orderBy: { createdAt: 'asc' },
    });
    return serializeTree({ ...tree, connections });
}

async function createTree(input, actor) {
    if (!actor) throw ApiError.unauthorized();
    const { name, description, visibility } = input || {};
    if (!name || String(name).trim().length < 2) {
        throw ApiError.badRequest('Укажите название дерева');
    }
    const tree = await prisma.familyTree.create({
        data: {
            name: String(name).trim(),
            description: description ? String(description).trim() : null,
            visibility: visibility && ['PUBLIC', 'UNLISTED', 'PASSWORD', 'PRIVATE'].includes(visibility)
                ? visibility
                : 'UNLISTED',
            ownerId: actor.id,
        },
    });
    return serializeTree(tree);
}

async function updateTree(treeId, input, actor) {
    const tree = await loadTreeOr404(treeId);
    assertTreeAccess(tree, actor, 'edit');
    const data = {};
    if (input.name !== undefined) data.name = String(input.name).trim();
    if (input.description !== undefined) data.description = input.description || null;
    if (input.visibility !== undefined && ['PUBLIC', 'UNLISTED', 'PASSWORD', 'PRIVATE'].includes(input.visibility)) {
        data.visibility = input.visibility;
    }
    const updated = await prisma.familyTree.update({ where: { id: treeId }, data });
    return serializeTree(updated);
}

async function deleteTree(treeId, actor) {
    const tree = await loadTreeOr404(treeId);
    assertTreeAccess(tree, actor, 'edit');
    await prisma.familyTree.delete({ where: { id: treeId } });
    return { id: treeId };
}

/* ───────────────────────────────────────────
   CLANS
─────────────────────────────────────────── */

async function listClans(treeId, actor) {
    const tree = await loadTreeOr404(treeId);
    assertTreeAccess(tree, actor, 'view');
    const clans = await prisma.familyClan.findMany({
        where: { treeId },
        orderBy: { name: 'asc' },
    });
    return clans.map(serializeClan);
}

async function createClan(input, actor) {
    const { treeId, name, color, icon, description } = input || {};
    if (!treeId) throw ApiError.badRequest('treeId обязателен');
    if (!name || !String(name).trim()) throw ApiError.badRequest('Укажите название рода');
    const tree = await loadTreeOr404(treeId);
    assertTreeAccess(tree, actor, 'edit');
    try {
        const clan = await prisma.familyClan.create({
            data: {
                treeId,
                name: String(name).trim(),
                color: color || '#c8a84b',
                icon: icon || '✦',
                description: description ? String(description).trim() : null,
            },
        });
        return serializeClan(clan);
    } catch (err) {
        if (err.code === 'P2002') throw ApiError.conflict('Род с таким названием уже есть в этом дереве');
        throw err;
    }
}

async function updateClan(clanId, input, actor) {
    const clan = await prisma.familyClan.findUnique({ where: { id: clanId } });
    if (!clan) throw ApiError.notFound('Род не найден');
    const tree = await loadTreeOr404(clan.treeId);
    assertTreeAccess(tree, actor, 'edit');
    const data = {};
    if (input.name !== undefined) data.name = String(input.name).trim();
    if (input.color !== undefined) data.color = input.color || '#c8a84b';
    if (input.icon !== undefined) data.icon = input.icon || '✦';
    if (input.description !== undefined) data.description = input.description || null;
    const updated = await prisma.familyClan.update({ where: { id: clanId }, data });
    return serializeClan(updated);
}

async function deleteClan(clanId, actor) {
    const clan = await prisma.familyClan.findUnique({ where: { id: clanId } });
    if (!clan) throw ApiError.notFound('Род не найден');
    const tree = await loadTreeOr404(clan.treeId);
    assertTreeAccess(tree, actor, 'edit');
    await prisma.familyClan.delete({ where: { id: clanId } });
    return { id: clanId };
}

/* ───────────────────────────────────────────
   NODES
─────────────────────────────────────────── */

async function createNode(input, actor) {
    const {
        treeId, firstName, lastName, maidenName,
        birth, death, gender, clanId, notes,
        posX, posY, generation, photoId,
    } = input || {};

    if (!treeId) throw ApiError.badRequest('treeId обязателен');
    if (!firstName || !String(firstName).trim()) throw ApiError.badRequest('Укажите имя');

    const tree = await loadTreeOr404(treeId);
    assertTreeAccess(tree, actor, 'edit');

    if (clanId) {
        const clan = await prisma.familyClan.findUnique({ where: { id: clanId } });
        if (!clan || clan.treeId !== treeId) {
            throw ApiError.badRequest('Род не принадлежит этому дереву');
        }
    }

    const birthParsed = parseDate(birth);
    const deathParsed = parseDate(death);

    const node = await prisma.familyNode.create({
        data: {
            treeId,
            firstName: String(firstName).trim(),
            lastName: lastName ? String(lastName).trim() : null,
            maidenName: maidenName ? String(maidenName).trim() : null,
            birthDate: birthParsed.date,
            deathDate: deathParsed.date,
            gender: mapGender(gender),
            clanId: clanId || null,
            photoId: photoId || null,
            notes: notes ? String(notes).trim() : null,
            posX: typeof posX === 'number' ? posX : null,
            posY: typeof posY === 'number' ? posY : null,
            generation: typeof generation === 'number' ? generation : null,
        },
        include: { photo: true, clan: true, profile: { select: { id: true, slug: true } } },
    });

    return serializeNode(node);
}

async function updateNode(nodeId, input, actor) {
    const node = await prisma.familyNode.findUnique({ where: { id: nodeId } });
    if (!node) throw ApiError.notFound('Узел не найден');
    const tree = await loadTreeOr404(node.treeId);
    assertTreeAccess(tree, actor, 'edit');

    const data = {};
    if (input.firstName !== undefined) data.firstName = String(input.firstName).trim();
    if (input.lastName !== undefined) data.lastName = input.lastName ? String(input.lastName).trim() : null;
    if (input.maidenName !== undefined) data.maidenName = input.maidenName ? String(input.maidenName).trim() : null;
    if (input.birth !== undefined) data.birthDate = parseDate(input.birth).date;
    if (input.death !== undefined) data.deathDate = parseDate(input.death).date;
    if (input.gender !== undefined) data.gender = mapGender(input.gender);
    if (input.notes !== undefined) data.notes = input.notes ? String(input.notes).trim() : null;
    if (input.photoId !== undefined) data.photoId = input.photoId || null;
    if (input.posX !== undefined) data.posX = typeof input.posX === 'number' ? input.posX : null;
    if (input.posY !== undefined) data.posY = typeof input.posY === 'number' ? input.posY : null;
    if (input.generation !== undefined) {
        data.generation = typeof input.generation === 'number' ? input.generation : null;
    }
    if (input.clanId !== undefined) {
        if (input.clanId) {
            const clan = await prisma.familyClan.findUnique({ where: { id: input.clanId } });
            if (!clan || clan.treeId !== node.treeId) {
                throw ApiError.badRequest('Род не принадлежит этому дереву');
            }
        }
        data.clanId = input.clanId || null;
    }

    const updated = await prisma.familyNode.update({
        where: { id: nodeId },
        data,
        include: { photo: true, clan: true, profile: { select: { id: true, slug: true } } },
    });

    return serializeNode(updated);
}

/**
 * Удаление узла: в транзакции unlink Profile (если есть), затем delete node.
 * Все FamilyConnection удалятся каскадом БД (schema: onDelete: Cascade).
 */
async function deleteNode(nodeId, actor) {
    const node = await prisma.familyNode.findUnique({
        where: { id: nodeId },
        include: { profile: { select: { id: true } } },
    });
    if (!node) throw ApiError.notFound('Узел не найден');
    const tree = await loadTreeOr404(node.treeId);
    assertTreeAccess(tree, actor, 'edit');

    const result = await prisma.$transaction(async (tx) => {
        let unlinkedProfileId = null;
        if (node.profile) {
            unlinkedProfileId = node.profile.id;
            await tx.profile.update({
                where: { id: node.profile.id },
                data: { familyNodeId: null },
            });
        }
        const edgesCount = await tx.familyConnection.count({
            where: { OR: [{ fromNodeId: nodeId }, { toNodeId: nodeId }] },
        });
        await tx.familyNode.delete({ where: { id: nodeId } });
        return { unlinkedProfileId, edgesCount };
    });

    return {
        id: nodeId,
        unlinkedProfileId: result.unlinkedProfileId,
        cascadeDeletedEdges: result.edgesCount,
    };
}

/* ───────────────────────────────────────────
   VALIDATION HELPERS (для CONNECTIONS)
─────────────────────────────────────────── */

const MAX_DIRECT_PARENTS = 2;

/**
 * Проверяет, создаст ли цикл связь PARENT (newParent → newChild).
 * Идём вверх от newParent по PARENT-edges; если встретим newChild — цикл.
 */
async function _willCreateCycle(tx, newParentId, newChildId) {
    if (newParentId === newChildId) return true;
    const MAX_DEPTH = 100;
    let frontier = [newParentId];
    const visited = new Set([newParentId]);
    let depth = 0;
    while (frontier.length && depth < MAX_DEPTH) {
        const ancestors = await tx.familyConnection.findMany({
            where: { toNodeId: { in: frontier }, type: 'PARENT' },
            select: { fromNodeId: true },
        });
        const next = [];
        for (const a of ancestors) {
            if (a.fromNodeId === newChildId) return true;
            if (!visited.has(a.fromNodeId)) {
                visited.add(a.fromNodeId);
                next.push(a.fromNodeId);
            }
        }
        frontier = next;
        depth++;
    }
    return false;
}

async function _countDirectParents(tx, childNodeId) {
    return tx.familyConnection.count({
        where: { toNodeId: childNodeId, type: 'PARENT' },
    });
}

async function _findSpouseMirror(tx, fromNodeId, toNodeId) {
    return tx.familyConnection.findUnique({
        where: {
            fromNodeId_toNodeId_type: {
                fromNodeId: toNodeId,
                toNodeId: fromNodeId,
                type: 'SPOUSE',
            },
        },
    });
}

/* ───────────────────────────────────────────
   CONNECTIONS
─────────────────────────────────────────── */

async function createConnection(input, actor) {
    const { fromNodeId, toNodeId, type, startDate, endDate, notes } = input || {};
    if (!fromNodeId || !toNodeId) throw ApiError.badRequest('fromNodeId и toNodeId обязательны');
    if (fromNodeId === toNodeId) throw ApiError.badRequest('Узел не может быть связан сам с собой');

    const mappedType = mapRelation(type);
    const rawTypeLower = String(type || '').toLowerCase();

    const [from, to] = await Promise.all([
        prisma.familyNode.findUnique({ where: { id: fromNodeId } }),
        prisma.familyNode.findUnique({ where: { id: toNodeId } }),
    ]);
    if (!from || !to) throw ApiError.notFound('Один из узлов не найден');
    if (from.treeId !== to.treeId) throw ApiError.badRequest('Узлы из разных деревьев');

    const tree = await loadTreeOr404(from.treeId);
    assertTreeAccess(tree, actor, 'edit');

    // type='child' — инверсия PARENT
    let actualFrom = fromNodeId, actualTo = toNodeId;
    if (rawTypeLower === 'child' && mappedType === 'PARENT') {
        [actualFrom, actualTo] = [toNodeId, fromNodeId];
    }

    const startD = startDate ? parseDate(startDate).date : null;
    const endD   = endDate   ? parseDate(endDate).date   : null;
    const notesT = notes ? String(notes).trim() : null;

    try {
        const result = await prisma.$transaction(async (tx) => {
            if (mappedType === 'PARENT') {
                if (await _willCreateCycle(tx, actualFrom, actualTo)) {
                    throw ApiError.unprocessable('Эта связь создаст цикл в родословной (предок не может быть потомком самого себя)');
                }
                const parentCount = await _countDirectParents(tx, actualTo);
                if (parentCount >= MAX_DIRECT_PARENTS) {
                    throw ApiError.unprocessable(`У ребёнка не может быть больше ${MAX_DIRECT_PARENTS} биологических родителей. Используйте ADOPTIVE/STEP для других`);
                }
            }

            const primary = await tx.familyConnection.create({
                data: {
                    fromNodeId: actualFrom,
                    toNodeId: actualTo,
                    type: mappedType,
                    startDate: startD,
                    endDate: endD,
                    notes: notesT,
                },
            });

            // SPOUSE auto-mirror
            if (mappedType === 'SPOUSE') {
                const existingMirror = await _findSpouseMirror(tx, actualFrom, actualTo);
                if (!existingMirror) {
                    await tx.familyConnection.create({
                        data: {
                            fromNodeId: actualTo,
                            toNodeId: actualFrom,
                            type: 'SPOUSE',
                            startDate: startD,
                            endDate: endD,
                            notes: notesT,
                        },
                    });
                }
            }

            return primary;
        });

        return serializeConnection(result);
    } catch (err) {
        if (err && err.isApiError) throw err;
        if (err.code === 'P2002') {
            throw ApiError.conflict('Такая связь между узлами уже существует');
        }
        throw err;
    }
}

/**
 * Удаление связи: для SPOUSE — удаляем обе записи (прямую и зеркальную).
 */
async function deleteConnection(connId, actor) {
    const conn = await prisma.familyConnection.findUnique({
        where: { id: connId },
        include: { fromNode: { select: { treeId: true } } },
    });
    if (!conn) throw ApiError.notFound('Связь не найдена');
    const tree = await loadTreeOr404(conn.fromNode.treeId);
    assertTreeAccess(tree, actor, 'edit');

    const deletedIds = await prisma.$transaction(async (tx) => {
        const ids = [conn.id];
        await tx.familyConnection.delete({ where: { id: conn.id } });

        if (conn.type === 'SPOUSE') {
            const mirror = await _findSpouseMirror(tx, conn.fromNodeId, conn.toNodeId);
            if (mirror) {
                ids.push(mirror.id);
                await tx.familyConnection.delete({ where: { id: mirror.id } });
            }
        }
        return ids;
    });

    return { id: connId, deletedIds };
}

module.exports = {
    // trees
    listTrees, getTree, createTree, updateTree, deleteTree,
    // clans
    listClans, createClan, updateClan, deleteClan,
    // nodes
    createNode, updateNode, deleteNode,
    // connections
    createConnection, deleteConnection,
    // helpers (для других сервисов)
    loadTreeOr404, assertTreeAccess,
    serializeNode, serializeClan, serializeConnection, serializeTree,
};
