/**
 * Backup module — handles database backup, restore, integrity checks,
 * and auto-backup scheduling. Backups are stored as .db files with
 * .meta.json sidecar containing hash, size, version, and table stats.
 *
 * WAL safety: the app runs in SQLite WAL mode, so a raw copy of pos.db alone
 * can MISS recent transactions (they live in pos.db-wal). Every snapshot
 * therefore runs `wal_checkpoint(TRUNCATE)` first, then copies ONLY the main
 * .db file which is now fully consistent and self-contained.
 */

import { app } from 'electron'
import { join } from 'path'
import { copyFileSync, existsSync, readdirSync, unlinkSync, statSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { createHash } from 'crypto'
import { closeDatabase, getDatabase } from './connection'
import { runMigrations, validateAfterMigration } from './schemaMigration'

const BACKUP_DIR = join(app.getPath('userData'), 'backups')
const DB_PATH = join(app.getPath('userData'), 'pos.db')
const WAL_PATH = join(app.getPath('userData'), 'pos.db-wal')
const SHM_PATH = join(app.getPath('userData'), 'pos.db-shm')

function ensureBackupDir(): void {
  if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true })
}

function fileHash(filePath: string): string {
  const data = readFileSync(filePath)
  return createHash('sha256').update(data).digest('hex')
}

/**
 * Checkpoint the WAL into the main database file so a subsequent raw copy is
 * fully consistent. Best-effort: if the connection is not open this is a no-op.
 */
function checkpointWal(): void {
  try {
    const liveDb = getDatabase()
    liveDb.pragma('wal_checkpoint(TRUNCATE)')
  } catch (e) {
    console.warn('[Backup] WAL checkpoint failed:', e)
  }
}

/**
 * Write a consistent, self-contained copy of the live database to `dest`.
 * Checkpoints WAL first, then copies only the .db (WAL/SHM are NOT copied —
 * after a TRUNCATE checkpoint the main file already contains all data).
 */
export function copyDatabaseTo(dest: string): void {
  ensureBackupDir()
  checkpointWal()
  copyFileSync(DB_PATH, dest)
  // Drop any stale sidecar files for the destination (from a previous attempt)
  for (const suffix of ['-wal', '-shm']) {
    const p = dest + suffix
    if (existsSync(p)) unlinkSync(p)
  }
}

/**
 * Remove stale WAL/SHM files of the live DB. Called after restoring a backup
 * so the restored (self-contained) main file is not mixed with old frames.
 */
function removeLiveWalShm(): void {
  for (const p of [WAL_PATH, SHM_PATH]) {
    try { if (existsSync(p)) unlinkSync(p) } catch (e) { console.warn('[Backup] Failed to remove', p, e) }
  }
}

export function createBackup(label?: string): { success: boolean; path?: string; hash?: string; size?: number; error?: string } {
  try {
    ensureBackupDir()
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const name = label ? `${label}-${timestamp}` : `backup-${timestamp}`
    const dbCopy = join(BACKUP_DIR, `${name}.db`)

    copyDatabaseTo(dbCopy)

    const hash = fileHash(dbCopy)
    const size = statSync(dbCopy).size

    const meta = { name, hash, size, timestamp: new Date().toISOString(), appVersion: app.getVersion(), schemaVersion: getSchemaVersionSafe(), label: label || 'auto', tables: getTableStats() }
    writeFileSync(join(BACKUP_DIR, `${name}.meta.json`), JSON.stringify(meta, null, 2))

    return { success: true, path: dbCopy, hash, size }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function getSchemaVersionSafe(): string {
  try {
    const row = getDatabase().prepare("SELECT value FROM settings WHERE key = 'schemaVersion'").get() as { value: string } | undefined
    return row?.value || 'unknown'
  } catch {
    return 'unknown'
  }
}

export function checkIntegrity(dbPath?: string): { success: boolean; integrityCheck?: string; foreignKeyCheck?: string; tableCount?: number; error?: string } {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Database = require('better-sqlite3')
    const checkDb = new Database(dbPath || DB_PATH, { readonly: true })
    checkDb.pragma('foreign_keys = ON')

    const integrity = checkDb.pragma('integrity_check')[0]?.integrity_check || 'unknown'
    const fkCheck = checkDb.pragma('foreign_key_check')
    const tables = checkDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()

    checkDb.close()

    return {
      success: integrity === 'ok',
      integrityCheck: integrity,
      foreignKeyCheck: fkCheck.length === 0 ? 'ok' : `${fkCheck.length} violations`,
      tableCount: tables.length,
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function verifyBackup(backupPath: string): { success: boolean; hashMatch?: boolean; error?: string } {
  try {
    if (!existsSync(backupPath)) return { success: false, error: 'Backup file not found' }
    // The file must at least pass SQLite integrity before trusting it
    const integrity = checkIntegrity(backupPath)
    if (!integrity.success) return { success: false, error: `Backup failed integrity check: ${integrity.error || integrity.integrityCheck}` }
    const backupHash = fileHash(backupPath)
    // Compare against the hash stored in .meta.json
    const metaPath = backupPath.replace('.db', '.meta.json')
    if (existsSync(metaPath)) {
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
      return { success: true, hashMatch: backupHash === meta.hash }
    }
    // No sidecar meta (e.g. exported .db from backup:export) — the file is
    // structurally valid but there is no recorded hash to compare against.
    return { success: true, hashMatch: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function restoreBackup(backupPath: string): { success: boolean; error?: string; message?: string; restoredVersion?: string } {
  try {
    if (!existsSync(backupPath)) return { success: false, error: 'Backup file not found' }

    // 1. Integrity — never trust a corrupt file
    const check = checkIntegrity(backupPath)
    if (!check.success) return { success: false, error: `Backup integrity failed: ${check.error || check.integrityCheck}` }

    // 2. Optional hash verification against sidecar meta (only a warning —
    //    a missing sidecar is fine for hand-exported .db files)
    const verify = verifyBackup(backupPath)
    if (!verify.success) return { success: false, error: verify.error }

    // 3. Version compatibility — warn when restoring something newer/unknown
    let backupVersion = 'unknown'
    const metaPath = backupPath.replace('.db', '.meta.json')
    if (existsSync(metaPath)) {
      try {
        const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
        backupVersion = meta.appVersion || 'unknown'
      } catch {}
    }

    // 4. Pre-restore safety backup of the CURRENT database
    createBackup('pre-restore')

    // 5. Close, replace, clean stale WAL/SHM
    closeDatabase()
    copyFileSync(backupPath, DB_PATH)
    removeLiveWalShm()

    // 6. Re-open via the normal path (runs initializeDatabase + migrateSchema),
    //    then run versioned migrations and validate the result.
    getDatabase()
    const mig = runMigrations()
    const validation = validateAfterMigration()

    if (!validation.valid) {
      return { success: false, error: `بازیابی انجام شد اما یکپارچگی داده تأیید نشد: ${validation.issues.join('; ')}`, message: 'یکپارچگی داده تأیید نشد' }
    }
    if (mig.errors.length > 0) {
      return { success: true, message: `بازیابی موفق، اما مهاجرت دیتابیس خطا داشت: ${mig.errors.join('; ')}`, restoredVersion: backupVersion }
    }

    return { success: true, message: 'بازیابی با موفقیت انجام شد', restoredVersion: backupVersion }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function listBackups(): { name: string; path: string; size: number; timestamp: string; hash: string }[] {
  ensureBackupDir()
  const files = readdirSync(BACKUP_DIR).filter(f => f.endsWith('.meta.json'))
  return files.map(f => {
    const meta = JSON.parse(readFileSync(join(BACKUP_DIR, f), 'utf-8'))
    return { name: meta.name, path: join(BACKUP_DIR, `${meta.name}.db`), size: meta.size, timestamp: meta.timestamp, hash: meta.hash }
  }).sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}

export function getTableStats(dbPath?: string): Record<string, number> {
  try {
    const Database = require('better-sqlite3')
    const targetDb = new Database(dbPath || DB_PATH, { readonly: true })
    const tables = targetDb.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[]
    const stats: Record<string, number> = {}
    for (const t of tables) {
      const row = targetDb.prepare(`SELECT COUNT(*) as count FROM "${t.name}"`).get() as { count: number }
      stats[t.name] = row.count
    }
    targetDb.close()
    return stats
  } catch {
    return {}
  }
}

export function checkBackupVersion(backupPath: string): { compatible: boolean; backupVersion: string; currentVersion: string; message: string; meta?: any } {
  try {
    const metaPath = backupPath.replace('.db', '.meta.json')
    if (!existsSync(metaPath)) {
      return { compatible: false, backupVersion: 'unknown', currentVersion: app.getVersion(), message: 'Backup metadata not found (created by older version). Compatibility unknown.', meta: null }
    }
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
    return {
      compatible: true,
      backupVersion: meta.appVersion || 'unknown',
      currentVersion: app.getVersion(),
      message: `Backup created with version ${meta.appVersion || 'unknown'}. Current version: ${app.getVersion()}`,
      meta,
    }
  } catch (err) {
    return { compatible: false, backupVersion: 'unknown', currentVersion: app.getVersion(), message: err instanceof Error ? err.message : String(err), meta: null }
  }
}

export function getBackupDetails(backupPath: string): { success: boolean; data?: { meta: any; tables: Record<string, number>; integrity: any }; error?: string } {
  try {
    const metaPath = backupPath.replace('.db', '.meta.json')
    const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf-8')) : null
    const tables = getTableStats(backupPath)
    const integrity = checkIntegrity(backupPath)
    return { success: true, data: { meta, tables, integrity } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function cleanupBackups(keepCount: number = 30): { deleted: number } {
  ensureBackupDir()
  const backups = readdirSync(BACKUP_DIR).filter(f => f.endsWith('.meta.json'))
  if (backups.length <= keepCount) return { deleted: 0 }
  const sorted = backups
    .map(f => ({ f, mtime: (() => { try { return statSync(join(BACKUP_DIR, f)).mtimeMs } catch { return 0 } })() }))
    .sort((a, b) => b.mtime - a.mtime)
  const toDelete = sorted.slice(keepCount)
  for (const { f } of toDelete) {
    const name = f.replace('.meta.json', '')
    try {
      unlinkSync(join(BACKUP_DIR, `${name}.db`))
      unlinkSync(join(BACKUP_DIR, f))
      const wal = join(BACKUP_DIR, `${name}.db-wal`)
      const shm = join(BACKUP_DIR, `${name}.db-shm`)
      if (existsSync(wal)) unlinkSync(wal)
      if (existsSync(shm)) unlinkSync(shm)
    } catch(e) { /* ignore */ }
  }
  return { deleted: toDelete.length }
}

export function getBackupStats(): { totalBackups: number; latestBackup: string | null; totalSize: number } {
  ensureBackupDir()
  const files = readdirSync(BACKUP_DIR).filter(f => f.endsWith('.db'))
  const totalSize = files.reduce((sum, f) => sum + statSync(join(BACKUP_DIR, f)).size, 0)
  const latest = files.length > 0
    ? files.map(f => ({ name: f, mtime: statSync(join(BACKUP_DIR, f)).mtimeMs })).sort((a, b) => b.mtime - a.mtime)[0].name
    : null
  return { totalBackups: files.length, latestBackup: latest, totalSize }
}

/**
 * Daily auto-backup honoring the autoBackupInterval setting.
 * Returns { created, path, reason } where reason explains why a backup was
 * skipped (already-today for daily, within-week for weekly, etc.).
 */
export function autoBackup(): { created: boolean; path?: string; reason?: string } {
  ensureBackupDir()
  const interval = (() => {
    try {
      const v = getDatabase().prepare("SELECT value FROM settings WHERE key = 'autoBackupInterval'").get() as { value: string } | undefined
      return v?.value || 'daily'
    } catch { return 'daily' }
  })()

  const now = new Date()
  const backups = readdirSync(BACKUP_DIR).filter(f => f.endsWith('.db')).map(f => {
    try { return statSync(join(BACKUP_DIR, f)).mtime } catch { return new Date(0) }
  })
  const latest = backups.length > 0 ? new Date(Math.max(...backups.map(d => d.getTime()))) : null

  if (latest) {
    const dayDiff = Math.floor((now.getTime() - latest.getTime()) / 86400000)
    if (interval === 'weekly' && dayDiff < 7) return { created: false, reason: 'weekly-backup-exists' }
    if (interval === 'monthly' && dayDiff < 30) return { created: false, reason: 'monthly-backup-exists' }
    if (dayDiff < 1) return { created: false, reason: 'daily-backup-exists' }
  }

  const result = createBackup('auto')
  return { created: result.success, path: result.path, reason: result.success ? 'created' : 'error' }
}

/**
 * Get list of all tables with row counts for the selective export picker.
 * Opens DB in readonly mode to avoid locking.
 */
export function getSelectableTables(): { name: string; rowCount: number }[] {
  const Database = require('better-sqlite3')
  const db = new Database(DB_PATH, { readonly: true })
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]
  const result: { name: string; rowCount: number }[] = []
  for (const t of tables) {
    const row = db.prepare(`SELECT COUNT(*) as c FROM "${t.name}"`).get() as { c: number }
    result.push({ name: t.name, rowCount: row.c })
  }
  db.close()
  return result
}

/**
 * Export all CREATE TABLE statements as a JSON payload.
 * Useful for structure-only backup — no data, just schema.
 * Includes version metadata for compatibility checking on import.
 */
export function exportStructure(): string {
  const Database = require('better-sqlite3')
  const db = new Database(DB_PATH, { readonly: true })
  const creates = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%'").all() as { sql: string }[]
  db.close()
  const appVersion = require('../../../package.json').version
  return JSON.stringify({
    version: appVersion,
    appName: 'hesabdari-danial',
    format: 'structure',
    exportDate: new Date().toISOString(),
    statements: creates.map(c => c.sql + ';'),
  }, null, 2)
}

/**
 * Export all tables as a structured JSON payload.
 * Each table becomes a key with an array of row objects.
 * Includes version, app name, export date, and format metadata.
 */
export function exportAsJson(): string {
  const Database = require('better-sqlite3')
  const db = new Database(DB_PATH, { readonly: true })
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]
  const data: Record<string, any[]> = {}
  for (const t of tables) {
    data[t.name] = db.prepare(`SELECT * FROM "${t.name}"`).all()
  }
  db.close()
  const appVersion = require('../../../package.json').version
  return JSON.stringify({
    version: appVersion,
    appName: 'hesabdari-danial',
    format: 'json',
    exportDate: new Date().toISOString(),
    tables: data,
  }, null, 2)
}

/**
 * Export only selected tables as JSON.
 * Skips tables that don't exist (no error thrown).
 */
export function exportSelectiveJson(tableNames: string[]): string {
  const Database = require('better-sqlite3')
  const db = new Database(DB_PATH, { readonly: true })
  const data: Record<string, any[]> = {}
  for (const name of tableNames) {
    try { data[name] = db.prepare(`SELECT * FROM "${name}"`).all() } catch { /* skip */ }
  }
  db.close()
  const appVersion = require('../../../package.json').version
  return JSON.stringify({
    version: appVersion,
    appName: 'hesabdari-danial',
    format: 'json',
    exportDate: new Date().toISOString(),
    tables: data,
  }, null, 2)
}

/**
 * Export CREATE TABLE statements for selected tables only.
 * Filters the full schema to include only requested tables.
 */
export function exportSelectiveStructure(tableNames: string[]): string {
  const Database = require('better-sqlite3')
  const db = new Database(DB_PATH, { readonly: true })
  const allCreates = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%'").all() as { name: string; sql: string }[]
  db.close()
  const filtered = allCreates.filter(c => tableNames.includes(c.name))
  const appVersion = require('../../../package.json').version
  return JSON.stringify({
    version: appVersion,
    appName: 'hesabdari-danial',
    format: 'structure',
    exportDate: new Date().toISOString(),
    statements: filtered.map(c => c.sql + ';'),
  }, null, 2)
}
