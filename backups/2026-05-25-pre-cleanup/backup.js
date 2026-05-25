/* ═══════════════════════════════════════════════
   DATABASE BACKUP SYSTEM
   Uses SQLite VACUUM INTO for hot online backups
   ═══════════════════════════════════════════════ */
'use strict';

const path = require('node:path');
const fs   = require('node:fs');
const db   = require('./db');

/**
 * Performs a hot online backup of the SQLite database using VACUUM INTO.
 * This is safe to run while the server is running and processing writes.
 * Retains only the last `maxBackups` backup files.
 */
function runBackup(maxBackups = 10) {
  const backupDir = path.join(__dirname, 'data', 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const pad3 = n => String(n).padStart(3, '0');
  const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_` +
                    `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}-${pad3(now.getMilliseconds())}`;
  
  const backupFile = path.join(backupDir, `memory-backup-${timestamp}.db`);
  // Convert Windows backslashes to forward slashes for SQLite compatibility
  const sqliteSafePath = backupFile.replace(/\\/g, '/');

  console.log(`[Backup] Starting hot backup to: ${sqliteSafePath}`);
  
  try {
    // Consolidate WAL journal logs into the main database before backing up
    try {
      db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    } catch (checkpointErr) {
      console.warn('[Backup] WAL checkpoint warning:', checkpointErr.message);
    }

    if (fs.existsSync(backupFile)) {
      fs.unlinkSync(backupFile);
    }
    db.exec(`VACUUM INTO '${sqliteSafePath}'`);
    console.log(`[Backup] Hot backup completed successfully.`);
    
    rotateBackups(backupDir, maxBackups);
    return backupFile;
  } catch (err) {
    console.error(`[Backup] Backup failed:`, err);
    throw err;
  }
}

/**
 * Deletes older backups to maintain only the latest `maxBackups` files.
 */
function rotateBackups(backupDir, maxBackups) {
  try {
    const files = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('memory-backup-') && f.endsWith('.db'))
      .map(f => {
        const fullPath = path.join(backupDir, f);
        return {
          name: f,
          path: fullPath,
          mtime: fs.statSync(fullPath).mtimeMs
        };
      })
      .sort((a, b) => b.mtime - a.mtime); // Newest first

    if (files.length > maxBackups) {
      const toDelete = files.slice(maxBackups);
      console.log(`[Backup] Found ${files.length} backups. Rotating (max ${maxBackups}). Deleting ${toDelete.length} oldest backups...`);
      for (const file of toDelete) {
        fs.unlinkSync(file.path);
        console.log(`[Backup] Deleted old backup: ${file.name}`);
      }
    }
  } catch (err) {
    console.error(`[Backup] Backup rotation failed:`, err);
  }
}

// Execute directly if run via CLI
if (require.main === module) {
  try {
    runBackup();
    process.exit(0);
  } catch (err) {
    process.exit(1);
  }
}

module.exports = { runBackup };
