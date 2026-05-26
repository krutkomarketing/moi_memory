/**
 * MIGRATION SCRIPT: SQLite (v1) → PostgreSQL + Prisma (v2)
 *
 * Запуск:
 *   cd server
 *   node scripts/migrate-from-sqlite.js
 *
 * Идемпотентен (upsert по id). Невалидные ссылки логируются и пропускаются.
 * Каждый этап в своём блоке try/catch — одна ошибка не валит остальные.
 */
"use strict";

require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});
const { hashAccessCode } = require('../auth.js');
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const SQLITE_PATH = path.join(__dirname, "..", "data", "memory.db");

/* ─────────────────────────── мапы ─────────────────────────── */

const TIMELINE_TYPE_MAP = {
  birth: "BIRTH",
  death: "DEATH",
  marriage: "MARRIAGE",
  education: "EDUCATION",
  career: "CAREER",
  relocation: "RELOCATION",
  award: "AWARD",
  historical: "HISTORICAL",
};

const RELATION_TYPE_MAP = {
  marriage: "SPOUSE",
  spouse: "SPOUSE",
  parent: "PARENT",
  adoptive: "ADOPTIVE",
  step: "STEP",
};

const ROLE_MAP = {
  admin: "ADMIN",
  editor: "EDITOR",
  member: "USER",
  user: "USER",
  owner: "OWNER",
};

/* ─────────────────────── helpers ─────────────────────── */

let warnings = 0;
function warn(msg) {
  warnings++;
  console.warn("⚠️ ", msg);
}

function parseRussianDate(str) {
  if (!str || typeof str !== "string") return null;
  const cleaned = str.replace(/,/g, ".").trim();
  if (!cleaned) return null;

  const full = cleaned.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (full) {
    const [, d, m, y] = full;
    const date = new Date(Date.UTC(+y, +m - 1, +d));
    return isNaN(date) ? null : date;
  }
  const year = cleaned.match(/^(\d{4})$/);
  if (year) return new Date(Date.UTC(+year[1], 0, 1));
  return null;
}

function parseJsonArray(str) {
  if (!str) return [];
  try {
    const v = JSON.parse(str);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function slugifyId(id, fallback) {
  if (typeof id === "string" && /^[a-z0-9-]+$/.test(id)) return id;
  return fallback;
}

function isDup(e) {
  return e?.code === "P2002";
}
function isFKMissing(e) {
  return e?.code === "P2003" || e?.code === "P2025";
}

function tableExists(sqlite, name) {
  const r = sqlite
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?")
    .get(name);
  return !!r;
}

function columnsOf(sqlite, table) {
  return sqlite
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((c) => c.name);
}

/* ─────────────────────── 1. USERS ─────────────────────── */

async function migrateUsers(sqlite, db) {
  const rows = sqlite.prepare("SELECT * FROM users").all();
  console.log(`\n👤 Users: ${rows.length}`);

  for (const u of rows) {
    // Старый формат "salt:hash" → новый "iter:salt:hash"
    const parts = (u.password || "").split(":");
    const passwordHash =
      parts.length === 2 ? `100000:${u.password}` : u.password;

    try {
      await db.user.upsert({
        where: { id: u.id },
        update: {},
        create: {
          id: u.id,
          email: u.email,
          passwordHash,
          displayName: u.name || null,
          role: ROLE_MAP[u.role] || "USER",
          createdAt: u.created_at ? new Date(u.created_at) : new Date(),
        },
      });
    } catch (e) {
      if (isDup(e)) continue;
      warn(`User ${u.id}: ${e.message}`);
    }
  }
}

/* ─────────────────────── 2. PEOPLE → Profile ─────────────────────── */

async function migrateProfiles(sqlite, db) {
  const cols = columnsOf(sqlite, "people");
  const hasUserId = cols.includes("user_id");
  const rows = sqlite.prepare("SELECT * FROM people").all();
  console.log(`\n📜 People → Profile: ${rows.length}`);

  const fallbackAdmin = await db.user.findFirst({
    where: { role: "ADMIN" },
    orderBy: { createdAt: "asc" },
  });
  if (!fallbackAdmin)
    throw new Error("Нет ни одного админа — миграция профилей невозможна");

  for (const p of rows) {
    const candidateOwner =
      hasUserId && p.user_id ? p.user_id : fallbackAdmin.id;
    const ownerExists = await db.user.findUnique({
      where: { id: candidateOwner },
      select: { id: true },
    });
    const ownerId = ownerExists ? candidateOwner : fallbackAdmin.id;
    if (!ownerExists && candidateOwner !== fallbackAdmin.id) {
      warn(`Profile ${p.id}: owner ${candidateOwner} не найден, ставим админа`);
    }

    try {
      await db.profile.upsert({
        where: { id: p.id },
        update: {},
        create: {
          id: p.id,
          slug: slugifyId(p.id, p.id),
          fullName: p.name,
          birthDate: parseRussianDate(p.born),
          deathDate: parseRussianDate(p.died),
          burialPlace: p.burial || null,
          bio: p.bio || null,
          gender: "UNKNOWN",
          visibility: "PUBLIC",
          ownerId,
          createdAt: p.created_at ? new Date(p.created_at) : new Date(),
          updatedAt: p.updated_at ? new Date(p.updated_at) : new Date(),
        },
      });
    } catch (e) {
      if (!isDup(e)) warn(`Profile ${p.id}: ${e.message}`);
      continue;
    }

    // Фото → Media + Profile.coverPhotoId
    if (p.photo && typeof p.photo === "string" && p.photo.startsWith("http")) {
      try {
        const media = await db.media.create({
          data: {
            kind: "IMAGE",
            url: p.photo,
            mimeType: "image/jpeg",
            sizeBytes: 0,
            uploadedById: ownerId,
          },
        });
        await db.profile.update({
          where: { id: p.id },
          data: { coverPhotoId: media.id },
        });
      } catch (e) {
        warn(`Profile ${p.id} photo: ${e.message}`);
      }
    }
  }
}

/* ─────────────────────── 3. REVIEWS → GuestMemory ─────────────────────── */

async function migrateReviews(sqlite, db) {
  if (!tableExists(sqlite, "reviews")) {
    console.log("\n💬 reviews отсутствует, пропускаем");
    return;
  }

  const cols = columnsOf(sqlite, "reviews");
  const hasType = cols.includes("review_type");
  const hasPhoto = cols.includes("photo_url");
  const rows = sqlite.prepare("SELECT * FROM reviews").all();
  console.log(`\n💬 Reviews → GuestMemory: ${rows.length}`);

  for (const r of rows) {
    const profile = await db.profile.findUnique({
      where: { id: r.person_id },
      select: { id: true },
    });
    if (!profile) {
      warn(`Review ${r.id}: profile ${r.person_id} не найден`);
      continue;
    }

    const rawType = hasType ? r.review_type || "text" : "text";
    const type = String(rawType).toUpperCase() === "PHOTO" ? "PHOTO" : "TEXT";

    let mediaId = null;
    if (hasPhoto && r.photo_url) {
      try {
        const m = await db.media.create({
          data: {
            kind: "IMAGE",
            url: r.photo_url,
            mimeType: "image/jpeg",
            sizeBytes: 0,
          },
        });
        mediaId = m.id;
      } catch (e) {
        warn(`Review ${r.id} photo: ${e.message}`);
      }
    }

    try {
      await db.guestMemory.upsert({
        where: { id: r.id },
        update: {},
        create: {
          id: r.id,
          profileId: r.person_id,
          authorName: r.author,
          type,
          text: r.text || null,
          mediaId,
          isApproved: true,
          approvedAt: r.created_at ? new Date(r.created_at) : new Date(),
          createdAt: r.created_at ? new Date(r.created_at) : new Date(),
          updatedAt: r.created_at ? new Date(r.created_at) : new Date(),
        },
      });
    } catch (e) {
      if (!isDup(e)) warn(`Review ${r.id}: ${e.message}`);
    }
  }
}

/* ─────────────────────── 4. PERSON_CODES → ProfileAccessCode ─────────────────────── */

async function migratePersonCodes(sqlite, db) {
  if (!tableExists(sqlite, "person_codes")) {
    console.log("\n🔐 person_codes отсутствует, пропускаем");
    return;
  }
  const rows = sqlite.prepare("SELECT * FROM person_codes").all();
  console.log(`\n🔐 Person codes: ${rows.length}`);
  if (rows.length === 0) return;

  const { hashAccessCode } = require("../auth.js");

  for (const c of rows) {
    const profile = await db.profile.findUnique({
      where: { id: c.person_id },
      select: { id: true },
    });
    if (!profile) {
      warn(`Person code: profile ${c.person_id} не найден`);
      continue;
    }

    try {
      const codeHash = hashAccessCode(c.code);
      await db.profileAccessCode.create({
        data: {
          profileId: c.person_id,
          codeHash,
          createdAt: c.created_at ? new Date(c.created_at) : new Date(),
        },
      });
      await db.profile.update({
        where: { id: c.person_id },
        data: {
          visibility: "PASSWORD",
          accessHash: codeHash, 
        },
      });
    } catch (e) {
      if (!isDup(e)) warn(`Person code for ${c.person_id}: ${e.message}`);
    }
  }
}

/* ─────────────────────── 5. CANDLES ─────────────────────── */

async function migrateCandles(sqlite, db) {
  if (!tableExists(sqlite, "candles")) {
    console.log("\n🕯️  candles отсутствует, пропускаем");
    return;
  }
  const row = sqlite.prepare("SELECT count FROM candles WHERE id = 1").get();
  const count = Math.min(row?.count || 0, 10_000); // защита от мегасчётчиков
  console.log(`\n🕯️  Candles (global): ${count}`);
  if (count <= 0) return;

  const BATCH = 1000;
  for (let offset = 0; offset < count; offset += BATCH) {
    const slice = Math.min(BATCH, count - offset);
    const data = Array.from({ length: slice }, (_, i) => ({
      profileId: null,
      fingerprint: `legacy-${offset + i}`,
    }));
    try {
      await db.candleLight.createMany({ data, skipDuplicates: true });
    } catch (e) {
      warn(`Candles batch ${offset}: ${e.message}`);
    }
  }
}

/* ─────────────────────── 6. FAMILY_TREES ─────────────────────── */

async function migrateFamilyTrees(sqlite, db) {
  const cols = columnsOf(sqlite, "family_trees");
  const hasUserId = cols.includes("user_id");
  const rows = sqlite.prepare("SELECT * FROM family_trees").all();
  console.log(`\n🌳 Family trees: ${rows.length}`);

  const admin = await db.user.findFirst({
    where: { role: "ADMIN" },
    orderBy: { createdAt: "asc" },
  });

  for (const t of rows) {
    let ownerId = admin.id;
    if (hasUserId && t.user_id) {
      const u = await db.user.findUnique({
        where: { id: t.user_id },
        select: { id: true },
      });
      if (u) ownerId = u.id;
    }
    try {
      await db.familyTree.upsert({
        where: { id: t.id },
        update: {},
        create: {
          id: t.id,
          name: t.name,
          ownerId,
          createdAt: t.created_at ? new Date(t.created_at) : new Date(),
        },
      });
    } catch (e) {
      if (!isDup(e)) warn(`FamilyTree ${t.id}: ${e.message}`);
    }
  }
}

/* ─────────────────────── 7. FAMILY_NODES ─────────────────────── */

async function migrateFamilyNodes(sqlite, db) {
  const rows = sqlite.prepare("SELECT * FROM family_nodes").all();
  console.log(`\n🌿 Family nodes: ${rows.length}`);

  const existingTrees = new Set(
    (await db.familyTree.findMany({ select: { id: true } })).map((t) => t.id),
  );
  const admin = await db.user.findFirst({ where: { role: "ADMIN" } });

  for (const n of rows) {
    // auto-create отсутствующее дерево
    if (!existingTrees.has(n.tree_id)) {
      try {
        await db.familyTree.create({
          data: {
            id: n.tree_id,
            name: `Дерево ${n.tree_id}`,
            ownerId: admin.id,
          },
        });
        existingTrees.add(n.tree_id);
      } catch (e) {
        if (!isDup(e)) {
          warn(`Auto-create tree ${n.tree_id}: ${e.message}`);
          continue;
        }
        existingTrees.add(n.tree_id);
      }
    }

    const parts = (n.full_name || "").trim().split(/\s+/);
    const lastName = parts[0] || null;
    const firstName = parts.slice(1).join(" ") || parts[0] || "—";

    const yearsMatch = (n.years || "").match(/(\d{4})\s*[–-]\s*(\d{4})?/);
    const birthYear = yearsMatch?.[1] ? parseInt(yearsMatch[1], 10) : null;
    const deathYear = yearsMatch?.[2] ? parseInt(yearsMatch[2], 10) : null;

    let photoId = null;
    if (n.photo_url) {
      try {
        const m = await db.media.create({
          data: {
            kind: "IMAGE",
            url: n.photo_url,
            mimeType: "image/jpeg",
            sizeBytes: 0,
          },
        });
        photoId = m.id;
      } catch (e) {
        warn(`Node ${n.id} photo: ${e.message}`);
      }
    }

    try {
      await db.familyNode.upsert({
        where: { id: n.id },
        update: {},
        create: {
          id: n.id,
          treeId: n.tree_id,
          firstName,
          lastName,
          birthDate: birthYear ? new Date(Date.UTC(birthYear, 0, 1)) : null,
          deathDate: deathYear ? new Date(Date.UTC(deathYear, 0, 1)) : null,
          gender: "UNKNOWN",
          clan: n.clan_id || null,
          notes: n.description || null,
          photoId,
          generation: n.generation ?? null,
          createdAt: n.created_at ? new Date(n.created_at) : new Date(),
          updatedAt: n.updated_at ? new Date(n.updated_at) : new Date(),
        },
      });
    } catch (e) {
      if (!isDup(e)) warn(`Node ${n.id}: ${e.message}`);
    }
  }
}

/* ─────────────────── 8. Link Profile ↔ FamilyNode ─────────────────── */

async function linkProfilesToNodes(sqlite, db) {
  const cols = columnsOf(sqlite, "family_nodes");
  if (!cols.includes("linked_profile_id")) {
    console.log("\n🔗 linked_profile_id отсутствует, пропускаем");
    return;
  }

  const rows = sqlite
    .prepare(
      `
    SELECT id, linked_profile_id FROM family_nodes WHERE linked_profile_id IS NOT NULL
  `,
    )
    .all();
  console.log(`\n🔗 Link Profile ↔ Node: ${rows.length}`);

  for (const r of rows) {
    const profile = await db.profile.findUnique({
      where: { id: r.linked_profile_id },
      select: { id: true, familyNodeId: true },
    });
    if (!profile) {
      warn(`Linked profile ${r.linked_profile_id} не найден для узла ${r.id}`);
      continue;
    }
    if (profile.familyNodeId) continue; // уже привязан

    try {
      await db.profile.update({
        where: { id: r.linked_profile_id },
        data: { familyNodeId: r.id },
      });
    } catch (e) {
      warn(`Link profile ${r.linked_profile_id} → node ${r.id}: ${e.message}`);
    }
  }
}

/* ─────────────────── 9. parent_ids JSON → FamilyConnection(PARENT) ─────────────────── */

async function migrateParentConnections(sqlite, db) {
  const rows = sqlite
    .prepare("SELECT id, tree_id, parent_ids FROM family_nodes")
    .all();

  // префильтруем по существующим узлам
  const existingNodes = new Set(
    (await db.familyNode.findMany({ select: { id: true } })).map((n) => n.id),
  );

  let created = 0,
    skipped = 0;
  for (const child of rows) {
    if (!existingNodes.has(child.id)) {
      skipped++;
      continue;
    }
    const parentIds = parseJsonArray(child.parent_ids);
    for (const parentId of parentIds) {
      if (!existingNodes.has(parentId)) {
        warn(
          `PARENT skip: родитель ${parentId} → ребёнок ${child.id} — родителя нет`,
        );
        skipped++;
        continue;
      }
      try {
        await db.familyConnection.create({
          data: { fromNodeId: parentId, toNodeId: child.id, type: "PARENT" },
        });
        created++;
      } catch (e) {
        if (isDup(e)) {
          skipped++;
          continue;
        }
        warn(`PARENT ${parentId} → ${child.id}: ${e.message}`);
      }
    }
  }
  console.log(`\n👪 PARENT-связи: создано ${created}, пропущено ${skipped}`);
}

/* ─────────────────── 10. family_connections (marriage и пр.) ─────────────────── */

async function migrateFamilyConnections(sqlite, db) {
  if (!tableExists(sqlite, "family_connections")) {
    console.log("\n🔗 family_connections отсутствует, пропускаем");
    return;
  }

  const cols = columnsOf(sqlite, "family_connections");
  // поддержка разных названий колонок в старых дампах
  const COL_A = ["node_a", "from_node_id", "node1", "a_id"].find((c) =>
    cols.includes(c),
  );
  const COL_B = ["node_b", "to_node_id", "node2", "b_id"].find((c) =>
    cols.includes(c),
  );
  if (!COL_A || !COL_B) {
    warn(`family_connections: не нашёл колонки узлов (${cols.join(", ")})`);
    return;
  }
  const COL_TYPE =
    ["type", "relation_type", "kind"].find((c) => cols.includes(c)) || "type";

  const rows = sqlite.prepare("SELECT * FROM family_connections").all();
  console.log(
    `\n🔗 Family connections: ${rows.length} (cols: ${COL_A}, ${COL_B}, ${COL_TYPE})`,
  );

  const existingNodes = new Set(
    (await db.familyNode.findMany({ select: { id: true } })).map((n) => n.id),
  );

  let created = 0,
    skipped = 0;
  for (const c of rows) {
    const rawType = String(c[COL_TYPE] || "").toLowerCase();
    const type = RELATION_TYPE_MAP[rawType];
    if (!type) {
      warn(`Unknown connection type: ${c[COL_TYPE]}`);
      skipped++;
      continue;
    }

    const aId = c[COL_A];
    const bId = c[COL_B];
    if (!existingNodes.has(aId) || !existingNodes.has(bId)) {
      warn(`Connection ${c.id}: узел не найден (${aId} ↔ ${bId})`);
      skipped++;
      continue;
    }

    // SPOUSE: нормализуем порядок
    const [from, to] = type === "SPOUSE" && aId > bId ? [bId, aId] : [aId, bId];

    try {
      await db.familyConnection.create({
        data: {
          id: c.id || undefined,
          fromNodeId: from,
          toNodeId: to,
          type,
          createdAt: c.created_at ? new Date(c.created_at) : new Date(),
        },
      });
      created++;
    } catch (e) {
      if (isDup(e)) {
        skipped++;
        continue;
      }
      warn(`Connection ${c.id}: ${e.message}`);
    }
  }
  console.log(`   создано ${created}, пропущено ${skipped}`);
}

/* ─────────────────────── 11. TIMELINE_EVENTS ─────────────────────── */

async function migrateTimelineEvents(sqlite, db) {
  if (!tableExists(sqlite, "timeline_events")) {
    console.log("\n📆 timeline_events отсутствует, пропускаем");
    return;
  }
  const rows = sqlite.prepare("SELECT * FROM timeline_events").all();
  console.log(`\n📆 Timeline events: ${rows.length}`);

  for (const e of rows) {
    const category =
      TIMELINE_TYPE_MAP[String(e.type || "").toLowerCase()] || "CUSTOM";

    let nodeId = e.node_id || null;
    let profileId = e.profile_id || null;

    if (nodeId) {
      const x = await db.familyNode.findUnique({
        where: { id: nodeId },
        select: { id: true },
      });
      if (!x) {
        warn(`Event ${e.id}: node ${nodeId} не найден`);
        nodeId = null;
      }
    }
    if (profileId) {
      const x = await db.profile.findUnique({
        where: { id: profileId },
        select: { id: true },
      });
      if (!x) {
        warn(`Event ${e.id}: profile ${profileId} не найден`);
        profileId = null;
      }
    }

    const y = e.year || 1900;
    const m = e.month || 1;
    const d = e.day || 1;
    const date = new Date(Date.UTC(y, m - 1, d));
    const dateAccuracy = e.day ? "day" : e.month ? "month" : "year";

    try {
      await db.timelineEvent.upsert({
        where: { id: e.id },
        update: {},
        create: {
          id: e.id,
          familyNodeId: nodeId,
          profileId,
          category,
          title: e.title || "Без названия",
          description: e.subtitle || null,
          date,
          dateAccuracy,
          place: e.city || null,
          createdAt: e.created_at ? new Date(e.created_at) : new Date(),
        },
      });
    } catch (err) {
      if (!isDup(err)) warn(`Event ${e.id}: ${err.message}`);
    }
  }
}

/* ─────────────────────── main ─────────────────────── */

async function main() {
  console.log("🚀 Старт миграции SQLite → PostgreSQL");
  console.log(`📂 SQLite: ${SQLITE_PATH}`);

  const sqlite = new DatabaseSync(SQLITE_PATH, { readOnly: true });

  const steps = [
    ["Users", migrateUsers],
    ["Profiles", migrateProfiles],
    ["Reviews", migrateReviews],
    ["PersonCodes", migratePersonCodes],
    ["Candles", migrateCandles],
    ["FamilyTrees", migrateFamilyTrees],
    ["FamilyNodes", migrateFamilyNodes],
    ["LinkProfileToNode", linkProfilesToNodes],
    ["ParentConnections", migrateParentConnections],
    ["FamilyConnections", migrateFamilyConnections],
    ["TimelineEvents", migrateTimelineEvents],
  ];

  const errors = [];
  for (const [name, fn] of steps) {
    try {
      await fn(sqlite, prisma);
    } catch (e) {
      console.error(`\n❌ Этап "${name}" упал:`);
      console.error(e);
      errors.push({ name, error: e.message });
    }
  }

  sqlite.close();
  await prisma.$disconnect();

  console.log(`\n✅ Готово. Предупреждений: ${warnings}`);
  if (errors.length) {
    console.log("\n📋 Сводка ошибок по этапам:");
    for (const e of errors) console.log(`   - ${e.name}: ${e.error}`);
    process.exit(1);
  } else {
    console.log("✅ Все этапы прошли успешно");
  }
}

main().catch(async (e) => {
  console.error("\n❌ Фатально:", e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
