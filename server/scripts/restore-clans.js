'use strict';

/**
 * restore-clans.js v4 — на встроенном node:sqlite (Node 22+)
 *
 * Восстанавливает FamilyClan из server/data/memory.db (sqlite) в Postgres.
 *
 * Особенность: sqlite tree_id это строка ("default"), а postgres treeId это UUID.
 * Поэтому ВСЕГДА определяем postgres treeId через postgres FamilyNode.treeId
 * (FamilyNode.id у нас сохранён без изменений при миграции).
 *
 * Идемпотентный. Поддерживает --dry-run.
 */

const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const prisma = require('../lib/prisma');

const SQLITE_PATH = path.resolve(__dirname, '..', 'data', 'memory.db');
const DRY_RUN = process.argv.includes('--dry-run');

function log(...args) {
	console.log('[restore-clans]', ...args);
}

async function main() {
	log(DRY_RUN ? '🔍 DRY-RUN режим' : '✍️  Реальные изменения');
	log('SQLite:', SQLITE_PATH);

	if (!fs.existsSync(SQLITE_PATH)) {
		log('❌ Файл sqlite не найден');
		process.exit(1);
	}

	// node:sqlite — DatabaseSync, API похож на better-sqlite3
	const db = new DatabaseSync(SQLITE_PATH, { open: true });

	// 1. Sqlite кланы → словарь
	const sqliteClanRows = db.prepare(`
		SELECT id, tree_id, name, color, icon, description
		FROM family_clans
	`).all();

	const sqliteClansById = new Map();
	for (const c of sqliteClanRows) {
		sqliteClansById.set(String(c.id), {
			id:          String(c.id),
			tree_id:     String(c.tree_id || ''),
			name:        String(c.name || '').trim(),
			color:       (c.color && String(c.color).startsWith('#')) ? String(c.color) : '#c8a84b',
			icon:        c.icon ? String(c.icon) : '✦',
			description: c.description ? String(c.description) : '',
		});
	}
	log(`Sqlite кланы: ${sqliteClansById.size}`);

	// 2. Sqlite узлы с clan_id
	const sqliteNodeRows = db.prepare(`
		SELECT id, tree_id, clan_id
		FROM family_nodes
		WHERE clan_id IS NOT NULL
	`).all();
	log(`Sqlite узлы с clan_id: ${sqliteNodeRows.length}`);

	db.close();

	// 3. Postgres — прелоад
	const pgNodes = await prisma.familyNode.findMany({
		select: { id: true, treeId: true, clanId: true },
	});
	const pgNodesById = new Map(pgNodes.map((n) => [n.id, n]));
	log(`Postgres FamilyNode: ${pgNodes.length}`);

	const pgTrees = await prisma.familyTree.findMany({ select: { id: true, name: true } });
	log(`Postgres FamilyTree: ${pgTrees.length} — ${pgTrees.map((t) => t.name).join(', ')}`);

	// 4. Upsert кланов + проставление FamilyNode.clanId
	const pgClanCache = new Map();

	let createdClans = 0;
	let reusedClans  = 0;
	let updatedNodes = 0;
	let skippedNoSqliteClan = 0;
	let skippedNoPgNode     = 0;
	let alreadySetNodes     = 0;

	for (const sn of sqliteNodeRows) {
		const sqliteNodeId = String(sn.id);
		const sqliteClanId = String(sn.clan_id);

		const sqliteClan = sqliteClansById.get(sqliteClanId);
		if (!sqliteClan || !sqliteClan.name) {
			skippedNoSqliteClan++;
			continue;
		}

		const pgNode = pgNodesById.get(sqliteNodeId);
		if (!pgNode) {
			skippedNoPgNode++;
			continue;
		}

		const pgTreeId = pgNode.treeId;
		const clanName = sqliteClan.name;
		const cacheKey = `${pgTreeId}::${clanName}`;

		let pgClanId = pgClanCache.get(cacheKey);

		if (!pgClanId) {
			const existing = await prisma.familyClan.findUnique({
				where: { treeId_name: { treeId: pgTreeId, name: clanName } },
				select: { id: true },
			});

			if (existing) {
				pgClanId = existing.id;
				reusedClans++;
			} else {
				if (DRY_RUN) {
					pgClanId = `__dry__${cacheKey}`;
					createdClans++;
				} else {
					const created = await prisma.familyClan.create({
						data: {
							treeId:      pgTreeId,
							name:        clanName,
							color:       sqliteClan.color,
							icon:        sqliteClan.icon,
							description: sqliteClan.description || null,
						},
						select: { id: true },
					});
					pgClanId = created.id;
					createdClans++;
				}
			}
			pgClanCache.set(cacheKey, pgClanId);
		}

		if (pgNode.clanId) {
			alreadySetNodes++;
			continue;
		}

		if (DRY_RUN) {
			updatedNodes++;
			continue;
		}

		await prisma.familyNode.update({
			where: { id: sqliteNodeId },
			data: { clanId: pgClanId },
		});
		pgNode.clanId = pgClanId;
		updatedNodes++;
	}

	log('───────────────────────────────────────');
	log(`Кланы:  создано ${createdClans}, переиспользовано ${reusedClans}`);
	log(`Узлы:   обновлено ${updatedNodes}, уже было ${alreadySetNodes}`);
	log(`Пропуски: нет sqlite-клана ${skippedNoSqliteClan}, нет pg-узла ${skippedNoPgNode}`);
	log(DRY_RUN ? '🔍 DRY-RUN завершён, БД не изменена' : '✅ Готово');
}

main()
	.catch((err) => {
		console.error('[restore-clans] ❌ Ошибка:', err);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});