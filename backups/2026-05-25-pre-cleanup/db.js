/* ═══════════════════════════════════════════════
   DATABASE — node:sqlite (built-in Node 24)
   ═══════════════════════════════════════════════ */
'use strict';

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs   = require('node:fs');

const DB_DIR  = path.join(__dirname, 'data');
const DB_PATH = path.join(DB_DIR, 'memory.db');

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH, { open: true });

/* ── SCHEMA ── */
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA foreign_keys = ON;
  PRAGMA temp_store = MEMORY;
  PRAGMA cache_size = -10000;
  PRAGMA auto_vacuum = INCREMENTAL;

  CREATE TABLE IF NOT EXISTS users (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    email      TEXT UNIQUE NOT NULL,
    password   TEXT NOT NULL,
    role       TEXT NOT NULL DEFAULT 'member',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS people (
    id         TEXT PRIMARY KEY,
    user_id    TEXT,
    name       TEXT NOT NULL,
    born       TEXT NOT NULL,
    died       TEXT NOT NULL DEFAULT '',
    city       TEXT NOT NULL DEFAULT '',
    bio        TEXT NOT NULL DEFAULT '',
    photo      TEXT NOT NULL DEFAULT '',
    burial     TEXT NOT NULL DEFAULT '',
    burial_query TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id         TEXT PRIMARY KEY,
    person_id  TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    author     TEXT NOT NULL,
    text       TEXT NOT NULL,
    review_type TEXT NOT NULL DEFAULT 'text',
    photo_url   TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS candles (
    id    INTEGER PRIMARY KEY CHECK (id = 1),
    count INTEGER NOT NULL DEFAULT 0
  );

  INSERT OR IGNORE INTO candles (id, count) VALUES (1, 237);

  CREATE TABLE IF NOT EXISTS person_codes (
    person_id  TEXT PRIMARY KEY REFERENCES people(id) ON DELETE CASCADE,
    code       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS family_nodes (
    id                TEXT PRIMARY KEY,
    tree_id           TEXT NOT NULL DEFAULT 'default',
    full_name         TEXT NOT NULL DEFAULT '',
    years             TEXT NOT NULL DEFAULT '',
    clan_id           TEXT NOT NULL DEFAULT '',
    age_class         TEXT NOT NULL DEFAULT 'young',
    generation        INTEGER NOT NULL DEFAULT 0,
    gen_order         INTEGER NOT NULL DEFAULT 0,
    spouse_id         TEXT,
    parent_ids        TEXT NOT NULL DEFAULT '[]',
    linked_profile_id TEXT,
    photo_url         TEXT,
    description       TEXT NOT NULL DEFAULT '',
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS family_clans (
    id         TEXT PRIMARY KEY,
    tree_id    TEXT NOT NULL DEFAULT 'default',
    name       TEXT NOT NULL,
    color      TEXT NOT NULL DEFAULT '#c8a84b',
    icon       TEXT NOT NULL DEFAULT '✦',
    description TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS family_trees (
    id         TEXT PRIMARY KEY,
    user_id    TEXT,
    name       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS timeline_events (
    id          TEXT PRIMARY KEY,
    tree_id     TEXT NOT NULL DEFAULT 'default',
    year        INTEGER NOT NULL,
    month       INTEGER,
    day         INTEGER,
    type        TEXT NOT NULL,
    title       TEXT NOT NULL,
    subtitle    TEXT NOT NULL DEFAULT '',
    city        TEXT NOT NULL DEFAULT '',
    icon        TEXT NOT NULL DEFAULT '',
    node_id     TEXT,
    profile_id  TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS family_connections (
    id TEXT PRIMARY KEY,
    tree_id TEXT NOT NULL,
    node_a TEXT NOT NULL,
    node_b TEXT NOT NULL,
    type TEXT NOT NULL,
    color TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_timeline_tree_year ON timeline_events(tree_id, year);
  CREATE INDEX IF NOT EXISTS idx_timeline_node ON timeline_events(node_id);
  CREATE INDEX IF NOT EXISTS idx_timeline_profile ON timeline_events(profile_id);

  CREATE INDEX IF NOT EXISTS idx_family_nodes_tree ON family_nodes(tree_id);
  CREATE INDEX IF NOT EXISTS idx_family_clans_tree ON family_clans(tree_id);
  CREATE INDEX IF NOT EXISTS idx_reviews_person ON reviews(person_id);
  CREATE INDEX IF NOT EXISTS idx_family_connections_tree ON family_connections(tree_id);
  CREATE INDEX IF NOT EXISTS idx_family_connections_node_a ON family_connections(node_a);
  CREATE INDEX IF NOT EXISTS idx_family_connections_node_b ON family_connections(node_b);
  CREATE INDEX IF NOT EXISTS idx_family_nodes_spouse ON family_nodes(spouse_id);
  CREATE INDEX IF NOT EXISTS idx_family_nodes_linked_profile ON family_nodes(linked_profile_id);

  INSERT OR IGNORE INTO family_trees (id, name) VALUES ('default', 'Основное');
`);

// Run migrations safely
try {
  const columnsPeople = db.prepare('PRAGMA table_info(people)').all();
  const hasUserIdInPeople = columnsPeople.some(col => col.name === 'user_id');
  if (!hasUserIdInPeople) {
    db.exec('ALTER TABLE people ADD COLUMN user_id TEXT;');
    console.log('Migration: Added user_id column to people table.');
  }
} catch (e) {
  console.error('Migration error for people table:', e);
}

try {
  const columnsTrees = db.prepare('PRAGMA table_info(family_trees)').all();
  const hasUserIdInTrees = columnsTrees.some(col => col.name === 'user_id');
  if (!hasUserIdInTrees) {
    db.exec('ALTER TABLE family_trees ADD COLUMN user_id TEXT;');
    console.log('Migration: Added user_id column to family_trees table.');
  }
} catch (e) {
  console.error('Migration error for family_trees table:', e);
}

try {
  const columnsReviews = db.prepare('PRAGMA table_info(reviews)').all();
  const hasReviewType = columnsReviews.some(col => col.name === 'review_type');
  if (!hasReviewType) {
    db.exec("ALTER TABLE reviews ADD COLUMN review_type TEXT NOT NULL DEFAULT 'text';");
    console.log('Migration: Added review_type column to reviews table.');
  }
  const hasPhotoUrl = columnsReviews.some(col => col.name === 'photo_url');
  if (!hasPhotoUrl) {
    db.exec('ALTER TABLE reviews ADD COLUMN photo_url TEXT;');
    console.log('Migration: Added photo_url column to reviews table.');
  }
} catch (e) {
  console.error('Migration error for reviews table:', e);
}

// Create indices that depend on migrated columns
try {
  db.exec('CREATE INDEX IF NOT EXISTS idx_people_user ON people(user_id);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_family_trees_user ON family_trees(user_id);');
} catch (e) {
  console.error('Failed to create user indices:', e);
}

// Run query planner optimization based on current indices
try {
  db.exec('PRAGMA optimize;');
} catch (err) {
  console.error('Failed to run PRAGMA optimize:', err.message);
}

module.exports = db;
