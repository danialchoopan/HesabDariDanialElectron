/**
 * Restore Points repository — point-in-time backup snapshots with metadata.
 *
 * Restore points are full database copies with:
 *   - Custom name and description
 *   - SHA-256 hash verification
 *   - File size tracking
 *   - Table-level scope (all or selective)
 *   - Created timestamp for chronological ordering
 *
 * Stored in {userData}/restore_points/ directory.
 * Auto-cleanup configurable via settings (default: keep last 10).
 *
 * WAL safety: the app runs in WAL mode, so a restore point is only a raw copy
 * of pos.db. createRestorePoint therefore checkpoints the WAL first (the main
 * file is then fully consistent and self-contained), and restoreRestorePoint
 * clears the live WAL/SHM after replacing the main file.
 */

import { app } from 'electron'
import { join } from 'path'
import { copyFileSync, existsSync, unlinkSync, statSync, mkdirSync, readFileSync } from 'fs'
import { createHash } from 'crypto'
import { getDatabase, closeDatabase } from '../connection'
import { runMigrations, validateAfterMigration } from '../schemaMigration'
import { checkIntegrity, createBackup } from '../backup'

const RP_DIR = join(app.getPath('userData'), 'restore_points')
const DB_PATH = join(app.getPath('userData'), 'pos.db')
const WAL_PATH = join(app.getPath('userData'), 'pos.db-wal')
const SHM_PATH = join(app.getPath('userData'), 'pos.db-shm')

function ensureDir(): void {
  if (!existsSync(RP_DIR)) mkdirSync(RP_DIR, { recursive: true })
}

function checkpointWal(): void {
  try {
    getDatabase().pragma('wal_checkpoint(TRUNCATE)')
  } catch (e) {
    console.warn('[RestorePoints] WAL checkpoint failed:', e)
  }
}

function removeLiveWalShm(): void {
  for (const p of [WAL_PATH, SHM_PATH]) {
    try { if (existsSync(p)) unlinkSync(p) } catch (e) { console.warn('[RestorePoints] Failed to remove', p, e) }
  }
}

export interface RestorePoint {
  id: number
  name: string
  description: string
  dbPath: string
  dbHash: string
  dbSize: number
  tablesIncluded: string
  createdBy: string
  createdAt: string
}

/** Create a restore point — copies the current database with metadata. */
export function createRestorePoint(name: string, description: string = '', createdBy: string = 'admin'): RestorePoint {
  ensureDir()
  const db = getDatabase()

  // Generate filename
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const fileName = `rp-${timestamp}.db`
  const filePath = join(RP_DIR, fileName)

  // Copy database (checkpoint WAL first so the copy is fully consistent)
  checkpointWal()
  copyFileSync(DB_PATH, filePath)

  // Compute hash
  const fileData = readFileSync(filePath)
  const hash = createHash('sha256').update(fileData).digest('hex')
  const fileSize = statSync(filePath).size

  // Insert record
  const result = db.prepare(`
    INSERT INTO restore_points (name, description, dbPath, dbHash, dbSize, tablesIncluded, createdBy)
    VALUES (?, ?, ?, ?, ?, 'all', ?)
  `).run(name, description, filePath, hash, fileSize, createdBy)

  return db.prepare('SELECT * FROM restore_points WHERE id = ?').get(result.lastInsertRowid) as RestorePoint
}

/** List all restore points. */
export function listRestorePoints(): RestorePoint[] {
  const db = getDatabase()
  return db.prepare('SELECT * FROM restore_points ORDER BY createdAt DESC').all() as RestorePoint[]
}

/** Get restore point by ID. */
export function getRestorePointById(id: number): RestorePoint | undefined {
  const db = getDatabase()
  return db.prepare('SELECT * FROM restore_points WHERE id = ?').get(id) as RestorePoint | undefined
}

/** Delete a restore point and its file. */
export function deleteRestorePoint(id: number): boolean {
  const db = getDatabase()
  const rp = db.prepare('SELECT dbPath FROM restore_points WHERE id = ?').get(id) as { dbPath: string } | undefined
  if (rp && existsSync(rp.dbPath)) {
    try { unlinkSync(rp.dbPath) } catch {}
  }
  return db.prepare('DELETE FROM restore_points WHERE id = ?').run(id).changes > 0
}

/** Verify restore point integrity (hash check). */
export function verifyRestorePoint(id: number): { valid: boolean; error?: string } {
  const rp = getRestorePointById(id)
  if (!rp) return { valid: false, error: 'نقطه بازیابی یافت نشد' }
  if (!existsSync(rp.dbPath)) return { valid: false, error: 'فایل پایگاه داده یافت نشد' }
  const fileData = readFileSync(rp.dbPath)
  const currentHash = createHash('sha256').update(fileData).digest('hex')
  if (currentHash !== rp.dbHash) return { valid: false, error: 'هش تطابق ندارد — فایل تغییر کرده' }
  return { valid: true }
}

/**
 * Restore the database from a restore point.
 * Safety pipeline: hash verify → SQLite integrity → pre-restore backup →
 * close DB → replace file → clear stale WAL/SHM → reopen → migrate → validate.
 */
export function restoreRestorePoint(id: number): { success: boolean; error?: string; message?: string } {
  const rp = getRestorePointById(id)
  if (!rp) return { success: false, error: 'نقطه بازیابی یافت نشد' }
  if (!existsSync(rp.dbPath)) return { success: false, error: 'فایل نقطه بازیابی یافت نشد' }

  const verify = verifyRestorePoint(id)
  if (!verify.valid) return { success: false, error: verify.error }

  const integrity = checkIntegrity(rp.dbPath)
  if (!integrity.success) {
    return { success: false, error: `یکپارچگی فایل تأیید نشد: ${integrity.error || integrity.integrityCheck}` }
  }

  try {
    // Safety backup of the current state
    createBackup('pre-restore')

    closeDatabase()
    copyFileSync(rp.dbPath, DB_PATH)
    removeLiveWalShm()

    // Reopen (runs initializeDatabase + migrateSchema), then migrate + validate
    getDatabase()
    const mig = runMigrations()
    const validation = validateAfterMigration()

    if (!validation.valid) {
      return { success: false, error: `بازیابی انجام شد اما یکپارچگی داده تأیید نشد: ${validation.issues.join('; ')}` }
    }
    if (mig.errors.length > 0) {
      return { success: false, error: `بازیابی انجام شد اما مهاجرت دیتابیس خطا داشت: ${mig.errors.join('; ')}` }
    }
    return { success: true, message: 'بازیابی از نقطه بازیابی با موفقیت انجام شد' }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Auto-cleanup: keep only the most recent N restore points. */
export function cleanupRestorePoints(keepCount: number = 10): { deleted: number } {
  ensureDir()
  const db = getDatabase()
  const all = db.prepare('SELECT id, dbPath FROM restore_points ORDER BY createdAt DESC').all() as { id: number; dbPath: string }[]
  let deleted = 0
  if (all.length > keepCount) {
    const toDelete = all.slice(keepCount)
    for (const rp of toDelete) {
      if (existsSync(rp.dbPath)) { try { unlinkSync(rp.dbPath) } catch {} }
      db.prepare('DELETE FROM restore_points WHERE id = ?').run(rp.id)
      deleted++
    }
  }
  return { deleted }
}

/** Get restore point stats. */
export function getRestorePointStats(): { count: number; totalSize: number } {
  ensureDir()
  const db = getDatabase()
  const count = (db.prepare('SELECT COUNT(*) as c FROM restore_points').get() as { c: number }).c
  const rows = db.prepare('SELECT dbSize FROM restore_points').all() as { dbSize: number }[]
  const totalSize = rows.reduce((s, r) => s + (r.dbSize || 0), 0)
  return { count, totalSize }
}
