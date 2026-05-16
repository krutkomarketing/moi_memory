/**
 * db.js — SQLite база данных для бота
 * Структура повторяет Prisma-схему (User, Profile, ContentBlock, GuestMemory)
 * Используется node:sqlite (Node 24+)
 */

'use strict';

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const DB_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DB_DIR, 'bot.db');

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH, { open: true });

/* ── SCHEMA ── */
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id TEXT UNIQUE NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS profiles (
    id             TEXT PRIMARY KEY,
    owner_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    full_name      TEXT NOT NULL,
    dates          TEXT NOT NULL,
    main_text      TEXT NOT NULL,
    main_photo_url TEXT,
    gender         TEXT NOT NULL DEFAULT '',
    is_public      INTEGER NOT NULL DEFAULT 1,
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS content_blocks (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    text       TEXT NOT NULL,
    image_url  TEXT,
    block_order INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS guest_memories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id  TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    author_name TEXT NOT NULL,
    memory_text TEXT NOT NULL,
    is_approved INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS quotes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id  TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    text        TEXT NOT NULL,
    after_block TEXT NOT NULL DEFAULT 'career',
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS gallery_photos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id  TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    image_url   TEXT NOT NULL,
    caption     TEXT NOT NULL DEFAULT '',
    photo_order INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_profiles_owner ON profiles(owner_id);
  CREATE INDEX IF NOT EXISTS idx_blocks_profile_order ON content_blocks(profile_id, block_order);
  CREATE INDEX IF NOT EXISTS idx_memories_profile ON guest_memories(profile_id, is_approved);
  CREATE INDEX IF NOT EXISTS idx_quotes_profile ON quotes(profile_id);
  CREATE INDEX IF NOT EXISTS idx_gallery_profile ON gallery_photos(profile_id, photo_order);
`);

/* ── MIGRATIONS ── */
try {
  db.exec("ALTER TABLE profiles ADD COLUMN gender TEXT NOT NULL DEFAULT ''");
} catch (_) { /* column already exists */ }
try {
  db.exec("ALTER TABLE profiles ADD COLUMN city TEXT NOT NULL DEFAULT ''");
} catch (_) { /* column already exists */ }

/* ── HELPERS ── */

function generateUUID() {
  return crypto.randomUUID();
}

/* ── USER ── */

function getOrCreateUser(telegramId) {
  const existing = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId);
  if (existing) return existing;

  db.prepare('INSERT INTO users (telegram_id) VALUES (?)').run(telegramId);
  return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId);
}

/* ── PROFILE ── */

function createProfile({ ownerId, fullName, dates, mainText, mainPhotoUrl, isPublic }) {
  const id = generateUUID();
  db.prepare(`
    INSERT INTO profiles (id, owner_id, full_name, dates, main_text, main_photo_url, is_public)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, ownerId, fullName, dates, mainText, mainPhotoUrl || null, isPublic ? 1 : 0);

  return db.prepare('SELECT * FROM profiles WHERE id = ?').get(id);
}

function getProfilesByOwner(ownerId) {
  return db.prepare('SELECT * FROM profiles WHERE owner_id = ? ORDER BY created_at DESC').all(ownerId);
}

function getProfileById(id) {
  return db.prepare('SELECT * FROM profiles WHERE id = ?').get(id);
}

function deleteProfile(id) {
  db.prepare('DELETE FROM profiles WHERE id = ?').run(id);
}

/* ── CONTENT BLOCKS ── */

function createContentBlock({ profileId, text, imageUrl, order }) {
  db.prepare(`
    INSERT INTO content_blocks (profile_id, text, image_url, block_order)
    VALUES (?, ?, ?, ?)
  `).run(profileId, text, imageUrl || null, order);
}

function createContentBlocks(profileId, blocks) {
  const stmt = db.prepare(`
    INSERT INTO content_blocks (profile_id, text, image_url, block_order)
    VALUES (?, ?, ?, ?)
  `);

  db.exec('BEGIN');
  try {
    blocks.forEach((block, i) => {
      if (block.text) {
        stmt.run(profileId, block.text, block.imageUrl || null, i + 1);
      }
    });
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

function getContentBlocks(profileId) {
  return db.prepare(
    'SELECT * FROM content_blocks WHERE profile_id = ? ORDER BY block_order ASC'
  ).all(profileId);
}

/* ── GUEST MEMORIES ── */

function createGuestMemory({ profileId, authorName, memoryText }) {
  db.prepare(`
    INSERT INTO guest_memories (profile_id, author_name, memory_text)
    VALUES (?, ?, ?)
  `).run(profileId, authorName, memoryText);
}

function getApprovedMemories(profileId) {
  return db.prepare(
    'SELECT * FROM guest_memories WHERE profile_id = ? AND is_approved = 1 ORDER BY created_at DESC'
  ).all(profileId);
}

/* ── QUOTES ── */

function createQuote({ profileId, text, afterBlock }) {
  db.prepare(`
    INSERT INTO quotes (profile_id, text, after_block)
    VALUES (?, ?, ?)
  `).run(profileId, text, afterBlock || 'career');
}

function createQuotes(profileId, quotes) {
  const stmt = db.prepare(`
    INSERT INTO quotes (profile_id, text, after_block)
    VALUES (?, ?, ?)
  `);

  db.exec('BEGIN');
  try {
    quotes.forEach(q => {
      if (q.text) {
        stmt.run(profileId, q.text, q.after || 'career');
      }
    });
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

function getQuotes(profileId) {
  return db.prepare(
    'SELECT * FROM quotes WHERE profile_id = ? ORDER BY id ASC'
  ).all(profileId);
}

/* ── FULL PROFILE (для API/фронтенда) ── */

function getFullProfile(id) {
  const profile = getProfileById(id);
  if (!profile) return null;

  const blocks = getContentBlocks(id);
  const memories = getApprovedMemories(id);
  const quotes = getQuotes(id);

  return { ...profile, contentBlocks: blocks, guestMemories: memories, quotes };
}

module.exports = {
  db,
  getOrCreateUser,
  createProfile,
  getProfilesByOwner,
  getProfileById,
  deleteProfile,
  createContentBlock,
  createContentBlocks,
  getContentBlocks,
  createGuestMemory,
  getApprovedMemories,
  createQuote,
  createQuotes,
  getQuotes,
  getFullProfile,
};
