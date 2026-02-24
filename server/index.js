import { createServer } from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { Translate } from 'translate'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const API_PORT = Number(process.env.API_PORT || 8787)
const API_HOST = String(process.env.API_HOST || '127.0.0.1')
const ACCESS_TOKEN_TTL_SEC = Math.max(60, Number(process.env.ACCESS_TOKEN_TTL_SEC || 900))
const REFRESH_TOKEN_TTL_SEC = Math.max(300, Number(process.env.REFRESH_TOKEN_TTL_SEC || 60 * 60 * 24 * 7))
const LOGIN_MAX_ATTEMPTS = Math.max(3, Number(process.env.LOGIN_MAX_ATTEMPTS || 5))
const LOGIN_LOCK_MINUTES = Math.max(1, Number(process.env.LOGIN_LOCK_MINUTES || 5))
const SCRIPTORIA_IMPORT_MAX_BYTES = Math.max(262144, Number(process.env.SCRIPTORIA_IMPORT_MAX_BYTES || 5 * 1024 * 1024))
const SCRIPTORIA_STORY_MAX_BYTES = Math.max(262144, Number(process.env.SCRIPTORIA_STORY_MAX_BYTES || 2 * 1024 * 1024))
const TRANSLATE_REQUEST_MAX_BYTES = Math.max(4096, Number(process.env.TRANSLATE_REQUEST_MAX_BYTES || 128 * 1024))
const TRANSLATE_MAX_CHARS = Math.max(300, Number(process.env.TRANSLATE_MAX_CHARS || 3000))
const TRANSLATE_GEMINI_MODEL = String(process.env.TRANSLATE_GEMINI_MODEL || 'gemini-2.0-flash-lite').trim()
const TRANSLATE_DEFAULT_ENGINE = String(process.env.TRANSLATE_DEFAULT_ENGINE || 'google')
  .trim()
  .toLowerCase()
const TRANSLATE_PROVIDER_KEY = String(process.env.TRANSLATE_PROVIDER_KEY || '').trim()
const TRANSLATE_DEEPL_KEY = String(process.env.TRANSLATE_DEEPL_KEY || process.env.DEEPL_API_KEY || '').trim()
const TRANSLATE_YANDEX_KEY = String(process.env.TRANSLATE_YANDEX_KEY || process.env.YANDEX_API_KEY || '').trim()
const TRANSLATE_LIBRE_KEY = String(process.env.TRANSLATE_LIBRE_KEY || process.env.LIBRE_TRANSLATE_API_KEY || '').trim()
const TRANSLATE_LIBRE_URL = String(process.env.TRANSLATE_LIBRE_URL || '').trim()
const TRANSLATE_FALLBACK_SOURCE = normalizeLanguageCode(process.env.TRANSLATE_FALLBACK_SOURCE || 'id', 'id')
const STORY_COVER_IMAGE_MAX_CHARS = Math.max(2048, Number(process.env.STORY_COVER_IMAGE_MAX_CHARS || 1500000))
const ADMIN_USERNAME = String(process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase()
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || 'Admin@12345')
const GEMINI_API_KEY = String(process.env.GEMINI_API_KEY || '').trim()

const allowedOrigins = String(
  process.env.CLIENT_ORIGIN || 'http://localhost:5173,http://localhost:4173,http://127.0.0.1:5173,http://127.0.0.1:4173'
)
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)

const dbPath = process.env.AUTH_DB_PATH
  ? path.resolve(process.cwd(), process.env.AUTH_DB_PATH)
  : path.join(__dirname, 'data', 'scriptoria-auth.db')
const legacyDbPath = path.join(__dirname, 'data', 'inventory-auth.db')

if (!process.env.AUTH_DB_PATH && !fs.existsSync(dbPath) && fs.existsSync(legacyDbPath)) {
  fs.copyFileSync(legacyDbPath, dbPath)
}

fs.mkdirSync(path.dirname(dbPath), { recursive: true })

const db = new DatabaseSync(dbPath)
db.exec('PRAGMA journal_mode=WAL;')
db.exec('PRAGMA foreign_keys=ON;')

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until INTEGER,
    last_login_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS access_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    revoked_at INTEGER,
    created_at INTEGER NOT NULL,
    created_ip TEXT,
    user_agent TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    revoked_at INTEGER,
    created_at INTEGER NOT NULL,
    created_ip TEXT,
    user_agent TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT NOT NULL,
    resource TEXT NOT NULL,
    resource_id TEXT,
    status TEXT NOT NULL,
    detail TEXT,
    ip TEXT,
    user_agent TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS scriptoria_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    code_format TEXT NOT NULL,
    year_prefix TEXT NOT NULL,
    category_prefixes_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS scriptoria_stories (
    id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL,
    sku TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    unit TEXT NOT NULL,
    source TEXT,
    supplier TEXT,
    cover_image TEXT,
    stock INTEGER NOT NULL,
    min_stock INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS scriptoria_activities (
    id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    type TEXT NOT NULL,
    item_id TEXT,
    item_name TEXT NOT NULL,
    qty INTEGER NOT NULL,
    before_stock INTEGER NOT NULL,
    after_stock INTEGER NOT NULL,
    note TEXT,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES scriptoria_stories(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS story_documents (
    item_id TEXT PRIMARY KEY,
    chapters_json TEXT NOT NULL DEFAULT '[]',
    published_at INTEGER,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (item_id) REFERENCES scriptoria_stories(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS story_document_revisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id TEXT NOT NULL,
    chapters_json TEXT NOT NULL DEFAULT '[]',
    chapter_count INTEGER NOT NULL DEFAULT 0,
    word_count INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER,
    note TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (item_id) REFERENCES scriptoria_stories(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_access_token_hash ON access_tokens(token_hash);
  CREATE INDEX IF NOT EXISTS idx_refresh_token_hash ON refresh_tokens(token_hash);
  CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_scriptoria_activity_created_at ON scriptoria_activities(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_story_document_revisions_item_created_at
    ON story_document_revisions(item_id, created_at DESC);
`)

const ROLES = ['admin', 'manager', 'staff', 'viewer']
const SCRIPTORIA_WRITE_ROLES = ['admin', 'manager', 'staff']
const SCRIPTORIA_SETTINGS_ROLES = ['admin', 'manager']
const SCRIPTORIA_IMPORT_ROLES = ['admin', 'manager']

const SCRIPTORIA_DEFAULT_SETTINGS = {
  codeFormat: 'yearly',
  yearPrefix: 'BRG',
  categoryPrefixes: {
    Elektronik: 'ELC',
    ATK: 'ATK',
  },
}

function parseJson(raw, fallback) {
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function nowIso() {
  return new Date().toISOString()
}

function parseDateToMs(raw, fallback = Date.now()) {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  const parsed = Date.parse(String(raw || ''))
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizePrefix(raw) {
  return String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6)
}

function guessCategoryPrefix(category) {
  const cleaned = String(category || '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()

  if (!cleaned) return 'ITM'
  return cleaned.slice(0, 3).padEnd(3, 'X')
}

function sanitizeScriptoriaSettings(raw) {
  const merged = {
    ...SCRIPTORIA_DEFAULT_SETTINGS,
    ...(raw && typeof raw === 'object' ? raw : {}),
  }

  const codeFormat = merged.codeFormat === 'category' ? 'category' : 'yearly'
  const yearPrefix = normalizePrefix(merged.yearPrefix) || SCRIPTORIA_DEFAULT_SETTINGS.yearPrefix
  const incomingMap = merged.categoryPrefixes && typeof merged.categoryPrefixes === 'object' ? merged.categoryPrefixes : {}
  const categoryPrefixes = {}

  Object.entries(incomingMap).forEach(([key, value]) => {
    const cleanKey = String(key || '').trim()
    const cleanValue = normalizePrefix(value)
    if (!cleanKey || !cleanValue) return
    categoryPrefixes[cleanKey] = cleanValue
  })

  return {
    codeFormat,
    yearPrefix,
    categoryPrefixes: {
      ...SCRIPTORIA_DEFAULT_SETTINGS.categoryPrefixes,
      ...categoryPrefixes,
    },
  }
}

function rowToScriptoriaSettings(row) {
  if (!row) return sanitizeScriptoriaSettings(SCRIPTORIA_DEFAULT_SETTINGS)
  return sanitizeScriptoriaSettings({
    codeFormat: row.code_format,
    yearPrefix: row.year_prefix,
    categoryPrefixes: parseJson(row.category_prefixes_json, SCRIPTORIA_DEFAULT_SETTINGS.categoryPrefixes),
  })
}

function rowToStory(row) {
  return {
    id: row.id,
    title: row.name,
    genre: row.category,
    status: row.unit,
    authorName: String(row.author_name || row.owner_username || '').trim(),
    summary: row.source || '',
    audience: row.supplier || '',
    coverImage: row.cover_image || '',
    words: Number(row.stock) || 0,
    targetWords: Number(row.min_stock) || 0,
    updatedAt: new Date(Number(row.updated_at) || Date.now()).toISOString(),
  }
}

function rowToPublicStory(row) {
  const story = rowToStory(row)
  return {
    ...story,
    publishedAt: row?.published_at ? new Date(Number(row.published_at)).toISOString() : null,
  }
}

function rowToActivity(row) {
  return {
    id: row.id,
    createdAt: new Date(Number(row.created_at) || Date.now()).toISOString(),
    type: row.type,
    storyId: row.item_id || null,
    storyTitle: row.item_name,
    wordsChanged: Number(row.qty) || 0,
    wordsBefore: Number(row.before_stock) || 0,
    wordsAfter: Number(row.after_stock) || 0,
    note: row.note || '',
  }
}

function sanitizeChapter(raw, index = 0) {
  if (!raw || typeof raw !== 'object') return null

  const title = String(raw.title || '').trim() || `Bab ${index + 1}`
  const content = String(raw.content || '').replace(/\r\n/g, '\n')
  const id = String(raw.id || '').trim() || crypto.randomUUID()

  return { id, title, content }
}

function sanitizeStoryDocument(raw) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const inputChapters = Array.isArray(source.chapters) ? source.chapters : []

  const chapters = inputChapters.map((entry, index) => sanitizeChapter(entry, index)).filter(Boolean)
  if (!chapters.length) {
    chapters.push({
      id: crypto.randomUUID(),
      title: 'Bab 1',
      content: '',
    })
  }

  return {
    chapters,
    publishedAt: source.publishedAt || null,
  }
}

function rowToStoryDocument(row) {
  const parsed = parseJson(row?.chapters_json, [])
  const normalized = sanitizeStoryDocument({
    chapters: Array.isArray(parsed) ? parsed : [],
    publishedAt: row?.published_at ? new Date(Number(row.published_at)).toISOString() : null,
  })

  return {
    ...normalized,
    updatedAt: row?.updated_at ? new Date(Number(row.updated_at)).toISOString() : nowIso(),
  }
}

function normalizeStoryInput(raw, { allowCustomId = false } = {}) {
  if (!raw || typeof raw !== 'object') return null

  const title = String(raw.title || raw.name || '').trim()
  const genre = String(raw.genre || raw.category || '').trim()
  if (!title || !genre) return null

  const words = Math.max(0, Number(raw.words ?? raw.stock) || 0)
  const targetWords = Math.max(0, Number(raw.targetWords ?? raw.minStock) || 0)
  const coverImage = sanitizeStoryCoverImage(raw.coverImage || raw.cover_image || raw.thumbnail || raw.image)

  return {
    id: allowCustomId && String(raw.id || '').trim() ? String(raw.id).trim() : crypto.randomUUID(),
    legacyCode: String(raw.code || raw.slug || raw.sku || '').trim(),
    title,
    genre,
    status: String(raw.status || raw.unit || 'Draft').trim() || 'Draft',
    summary: String(raw.summary || raw.source || raw.origin || '').trim(),
    audience: String(raw.audience || raw.supplier || raw.vendor || raw.pemasok || '').trim(),
    coverImage,
    words,
    targetWords,
    updatedAtMs: parseDateToMs(raw.updatedAt, Date.now()),
  }
}

function sanitizeStoryCoverImage(raw) {
  const next = String(raw || '').trim()
  if (!next) return ''
  if (next.length > STORY_COVER_IMAGE_MAX_CHARS) return ''

  const isDataImage = next.startsWith('data:image/') && next.includes(';base64,')
  const isWebUrl = /^https?:\/\//i.test(next)
  return isDataImage || isWebUrl ? next : ''
}

function requiresCoverForPublished(status, coverImage) {
  return ['published', 'completed'].includes(String(status || '').trim().toLowerCase()) && !String(coverImage || '').trim()
}

function normalizeStoryActivityInput(raw) {
  if (!raw || typeof raw !== 'object') return null

  const type = String(raw.type || '').trim()
  const storyTitle = String(raw.storyTitle || raw.itemName || '').trim()
  if (!type || !storyTitle) return null

  return {
    id: String(raw.id || '').trim() || crypto.randomUUID(),
    createdAtMs: parseDateToMs(raw.createdAt, Date.now()),
    type,
    storyId: raw.storyId || raw.itemId ? String(raw.storyId || raw.itemId) : null,
    storyTitle,
    wordsChanged: Number(raw.wordsChanged ?? raw.qty) || 0,
    wordsBefore: Number(raw.wordsBefore ?? raw.beforeStock) || 0,
    wordsAfter: Number(raw.wordsAfter ?? raw.afterStock) || 0,
    note: String(raw.note || '').trim(),
  }
}

function runInTransaction(work) {
  db.exec('BEGIN')
  try {
    const result = work()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

function hasTable(tableName) {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName)
  return Boolean(row?.name)
}

function hasColumn(tableName, columnName) {
  const safeTable = String(tableName || '').trim()
  const safeColumn = String(columnName || '').trim()
  if (!safeTable || !safeColumn) return false
  if (!hasTable(safeTable)) return false

  const columns = db.prepare(`PRAGMA table_info(${safeTable})`).all()
  return columns.some((entry) => String(entry.name || '').trim() === safeColumn)
}

function ensureStoryColumns() {
  if (!hasColumn('scriptoria_stories', 'cover_image')) {
    db.prepare('ALTER TABLE scriptoria_stories ADD COLUMN cover_image TEXT').run()
  }
}

function resolveFallbackOwnerId() {
  const admin = db.prepare('SELECT id FROM users WHERE username = ?').get(ADMIN_USERNAME)
  if (admin?.id) return Number(admin.id)

  const first = db.prepare('SELECT id FROM users ORDER BY id ASC LIMIT 1').get()
  if (first?.id) return Number(first.id)

  return 1
}

function ensureStoryOwnershipColumns() {
  if (!hasColumn('scriptoria_stories', 'owner_id')) {
    db.prepare('ALTER TABLE scriptoria_stories ADD COLUMN owner_id INTEGER').run()
  }

  if (!hasColumn('scriptoria_activities', 'owner_id')) {
    db.prepare('ALTER TABLE scriptoria_activities ADD COLUMN owner_id INTEGER').run()
  }

  const fallbackOwnerId = resolveFallbackOwnerId()
  db.prepare('UPDATE scriptoria_stories SET owner_id = ? WHERE owner_id IS NULL OR owner_id <= 0').run(fallbackOwnerId)
  db.prepare('UPDATE scriptoria_activities SET owner_id = ? WHERE owner_id IS NULL OR owner_id <= 0').run(fallbackOwnerId)

  db.prepare('CREATE INDEX IF NOT EXISTS idx_scriptoria_stories_owner_updated ON scriptoria_stories(owner_id, updated_at DESC)').run()
  db.prepare('CREATE INDEX IF NOT EXISTS idx_scriptoria_activities_owner_created ON scriptoria_activities(owner_id, created_at DESC)').run()
}

function migrateLegacyInventoryData() {
  if (!hasTable('inventory_items') && !hasTable('inventory_transactions') && !hasTable('inventory_settings')) {
    return
  }

  const currentStories = Number(db.prepare('SELECT COUNT(1) AS total FROM scriptoria_stories').get()?.total || 0)
  const currentActivities = Number(db.prepare('SELECT COUNT(1) AS total FROM scriptoria_activities').get()?.total || 0)
  const shouldMigrateStories = currentStories === 0 && hasTable('inventory_items')
  const shouldMigrateActivities = currentActivities === 0 && hasTable('inventory_transactions')

  if (!shouldMigrateStories && !shouldMigrateActivities && !hasTable('inventory_settings')) {
    return
  }

  runInTransaction(() => {
    const fallbackOwnerId = resolveFallbackOwnerId()

    if (hasTable('inventory_settings')) {
      db.prepare(`
        INSERT OR IGNORE INTO scriptoria_settings (id, code_format, year_prefix, category_prefixes_json, updated_at)
        SELECT id, code_format, year_prefix, category_prefixes_json, updated_at
        FROM inventory_settings
        WHERE id = 1
      `).run()
    }

    if (shouldMigrateStories) {
      db.prepare(`
        INSERT OR IGNORE INTO scriptoria_stories
          (id, owner_id, sku, name, category, unit, source, supplier, stock, min_stock, updated_at)
        SELECT id, ?, sku, name, category, unit, source, supplier, stock, min_stock, updated_at
        FROM inventory_items
      `).run(fallbackOwnerId)
    }

    if (shouldMigrateActivities) {
      db.prepare(`
        INSERT OR IGNORE INTO scriptoria_activities
          (id, owner_id, created_at, type, item_id, item_name, qty, before_stock, after_stock, note)
        SELECT id, ?, created_at, type, item_id, item_name, qty, before_stock, after_stock, note
        FROM inventory_transactions
      `).run(fallbackOwnerId)
    }
  })
}

function ensureScriptoriaSettingsRow() {
  const row = db.prepare('SELECT id FROM scriptoria_settings WHERE id = 1').get()
  if (row) return

  const defaults = sanitizeScriptoriaSettings(SCRIPTORIA_DEFAULT_SETTINGS)
  db.prepare(`
    INSERT INTO scriptoria_settings (id, code_format, year_prefix, category_prefixes_json, updated_at)
    VALUES (1, ?, ?, ?, ?)
  `).run(defaults.codeFormat, defaults.yearPrefix, JSON.stringify(defaults.categoryPrefixes), Date.now())
}

function getScriptoriaSettings() {
  ensureScriptoriaSettingsRow()
  const row = db.prepare('SELECT * FROM scriptoria_settings WHERE id = 1').get()
  return rowToScriptoriaSettings(row)
}

function saveScriptoriaSettings(nextSettings) {
  const sanitized = sanitizeScriptoriaSettings(nextSettings)
  db.prepare(`
    UPDATE scriptoria_settings
    SET code_format = ?, year_prefix = ?, category_prefixes_json = ?, updated_at = ?
    WHERE id = 1
  `).run(sanitized.codeFormat, sanitized.yearPrefix, JSON.stringify(sanitized.categoryPrefixes), Date.now())
  return sanitized
}

function getAllStories(ownerId) {
  return db
    .prepare('SELECT * FROM scriptoria_stories WHERE owner_id = ? ORDER BY updated_at DESC, name ASC')
    .all(ownerId)
    .map(rowToStory)
}

function getAllActivities(ownerId) {
  return db
    .prepare('SELECT * FROM scriptoria_activities WHERE owner_id = ? ORDER BY created_at DESC')
    .all(ownerId)
    .map(rowToActivity)
}

function getScriptoriaSnapshot(ownerId) {
  return {
    settings: getScriptoriaSettings(),
    stories: getAllStories(ownerId),
    activities: getAllActivities(ownerId),
  }
}

function getOwnedStoryById(storyId, ownerId) {
  return db.prepare('SELECT * FROM scriptoria_stories WHERE id = ? AND owner_id = ?').get(storyId, ownerId)
}

function ensureStoryDocumentRow(storyId) {
  const row = db.prepare('SELECT item_id FROM story_documents WHERE item_id = ?').get(storyId)
  if (row) return

  db.prepare(`
    INSERT INTO story_documents (item_id, chapters_json, published_at, updated_at)
    VALUES (?, '[]', NULL, ?)
  `).run(storyId, Date.now())
}

function getStoryDocument(storyId) {
  ensureStoryDocumentRow(storyId)
  const row = db.prepare('SELECT * FROM story_documents WHERE item_id = ?').get(storyId)
  return rowToStoryDocument(row)
}

function countWordsFromChapters(chapters) {
  const text = (Array.isArray(chapters) ? chapters : [])
    .map((chapter) => `${chapter.title || ''}\n${chapter.content || ''}`)
    .join('\n\n')
    .trim()

  if (!text) return 0
  return text.split(/\s+/).filter(Boolean).length
}

function isRiskyDocumentOverwrite(existingDocument, incomingDocument) {
  const existingChapters = Array.isArray(existingDocument?.chapters) ? existingDocument.chapters : []
  const incomingChapters = Array.isArray(incomingDocument?.chapters) ? incomingDocument.chapters : []
  const existingWords = countWordsFromChapters(existingChapters)
  const incomingWords = countWordsFromChapters(incomingChapters)

  if (existingWords < 200) return false

  const chapterDrop = existingChapters.length - incomingChapters.length
  const isSingleBlank =
    incomingChapters.length === 1 &&
    !String(incomingChapters[0]?.title || '').trim().replace(/^bab\s*1$/i, '') &&
    !String(incomingChapters[0]?.content || '').trim()
  const largeDrop = chapterDrop >= 3 && incomingWords <= Math.max(40, Math.floor(existingWords * 0.2))

  return isSingleBlank || largeDrop
}

function saveStoryDocumentRevision(storyId, documentPayload, { userId = null, note = '' } = {}) {
  const normalized = sanitizeStoryDocument(documentPayload)
  const chaptersJson = JSON.stringify(normalized.chapters)
  const chapterCount = normalized.chapters.length
  const wordCount = countWordsFromChapters(normalized.chapters)
  const previous = db
    .prepare('SELECT chapters_json FROM story_document_revisions WHERE item_id = ? ORDER BY id DESC LIMIT 1')
    .get(storyId)

  if (previous?.chapters_json === chaptersJson) return

  db.prepare(`
    INSERT INTO story_document_revisions (item_id, chapters_json, chapter_count, word_count, created_by, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(storyId, chaptersJson, chapterCount, wordCount, userId, String(note || '').slice(0, 180), Date.now())
}

function saveStoryDocument(storyId, rawDocument) {
  const existing = db.prepare('SELECT published_at FROM story_documents WHERE item_id = ?').get(storyId)
  const normalized = sanitizeStoryDocument(rawDocument)
  const now = Date.now()

  let publishedAt = existing?.published_at || null
  if (rawDocument && Object.prototype.hasOwnProperty.call(rawDocument, 'publishedAt')) {
    publishedAt = rawDocument.publishedAt ? parseDateToMs(rawDocument.publishedAt, now) : null
  }

  db.prepare(`
    INSERT INTO story_documents (item_id, chapters_json, published_at, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(item_id) DO UPDATE SET
      chapters_json = excluded.chapters_json,
      published_at = excluded.published_at,
      updated_at = excluded.updated_at
  `).run(storyId, JSON.stringify(normalized.chapters), publishedAt, now)

  return rowToStoryDocument({
    item_id: storyId,
    chapters_json: JSON.stringify(normalized.chapters),
    published_at: publishedAt,
    updated_at: now,
  })
}

function countWordsFromDocument(document) {
  return countWordsFromChapters(document?.chapters)
}

function getExistingCodesSet() {
  const rows = db.prepare('SELECT sku FROM scriptoria_stories').all()
  return new Set(rows.map((row) => String(row.sku || '').trim()).filter(Boolean))
}

function nextCounterForPrefix(prefix, withYear = null, skus = []) {
  const pattern = withYear
    ? new RegExp(`^${prefix}-${withYear}-(\\d+)$`, 'i')
    : new RegExp(`^${prefix}(\\d+)$`, 'i')

  return skus.reduce((max, sku) => {
    const match = String(sku || '').match(pattern)
    if (!match) return max
    return Math.max(max, Number(match[1]) || 0)
  }, 0) + 1
}

function generateSku(category, settings, usedSkus) {
  const list = Array.from(usedSkus.values())

  if (settings.codeFormat === 'category') {
    const mappedPrefix = settings.categoryPrefixes[category] || guessCategoryPrefix(category)
    const prefix = normalizePrefix(mappedPrefix) || 'ITM'
    let counter = nextCounterForPrefix(prefix, null, list)
    let sku = `${prefix}${String(counter).padStart(3, '0')}`
    while (usedSkus.has(sku)) {
      counter += 1
      sku = `${prefix}${String(counter).padStart(3, '0')}`
    }
    return sku
  }

  const prefix = normalizePrefix(settings.yearPrefix) || 'BRG'
  const year = new Date().getFullYear()
  let counter = nextCounterForPrefix(prefix, year, list)
  let sku = `${prefix}-${year}-${String(counter).padStart(3, '0')}`
  while (usedSkus.has(sku)) {
    counter += 1
    sku = `${prefix}-${year}-${String(counter).padStart(3, '0')}`
  }
  return sku
}

function insertStoryActivity(payload) {
  const row = {
    id: payload.id || crypto.randomUUID(),
    ownerId: Number(payload.ownerId) || 0,
    createdAtMs: payload.createdAtMs || Date.now(),
    type: String(payload.type || '').trim(),
    itemId: payload.storyId || null,
    itemName: String(payload.storyTitle || '').trim(),
    qty: Number(payload.wordsChanged) || 0,
    beforeStock: Number(payload.wordsBefore) || 0,
    afterStock: Number(payload.wordsAfter) || 0,
    note: String(payload.note || '').trim(),
  }

  db.prepare(`
    INSERT INTO scriptoria_activities
      (id, owner_id, created_at, type, item_id, item_name, qty, before_stock, after_stock, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.id,
    row.ownerId,
    row.createdAtMs,
    row.type,
    row.itemId,
    row.itemName,
    row.qty,
    row.beforeStock,
    row.afterStock,
    row.note
  )

  return rowToActivity({
    id: row.id,
    created_at: row.createdAtMs,
    type: row.type,
    item_id: row.itemId,
    item_name: row.itemName,
    qty: row.qty,
    before_stock: row.beforeStock,
    after_stock: row.afterStock,
    note: row.note,
  })
}

function nowMs() {
  return Date.now()
}

function normalizeUsername(raw) {
  return String(raw || '').trim().toLowerCase()
}

function isValidUsername(username) {
  return /^[a-z0-9._-]{3,32}$/.test(String(username || ''))
}

function randomToken(bytes = 48) {
  return crypto.randomBytes(bytes).toString('base64url')
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex')
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const digest = crypto.scryptSync(String(password), salt, 64).toString('hex')
  return `scrypt$${salt}$${digest}`
}

function verifyPassword(password, storedHash) {
  const [scheme, salt, digest] = String(storedHash || '').split('$')
  if (scheme !== 'scrypt' || !salt || !digest) return false

  const next = crypto.scryptSync(String(password), salt, 64).toString('hex')
  const left = Buffer.from(digest, 'hex')
  const right = Buffer.from(next, 'hex')

  if (left.length !== right.length) return false
  return crypto.timingSafeEqual(left, right)
}

function toPublicUser(row) {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  }
}

function writeAudit({ userId = null, action, resource, resourceId = null, status = 'success', detail = {}, ip = '', userAgent = '' }) {
  let detailJson = '{}'
  try {
    detailJson = JSON.stringify(detail)
  } catch {
    detailJson = '{}'
  }

  db.prepare(`
    INSERT INTO audit_logs (user_id, action, resource, resource_id, status, detail, ip, user_agent, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(userId, action, resource, resourceId, status, detailJson, ip, userAgent, nowMs())
}

function issueTokens(user, requestMeta = {}) {
  const accessToken = randomToken(40)
  const refreshToken = randomToken(56)

  const now = nowMs()
  const accessExpiresAt = now + ACCESS_TOKEN_TTL_SEC * 1000
  const refreshExpiresAt = now + REFRESH_TOKEN_TTL_SEC * 1000

  db.prepare(`
    INSERT INTO access_tokens (user_id, token_hash, expires_at, revoked_at, created_at, created_ip, user_agent)
    VALUES (?, ?, ?, NULL, ?, ?, ?)
  `).run(user.id, hashToken(accessToken), accessExpiresAt, now, requestMeta.ip || '', requestMeta.userAgent || '')

  db.prepare(`
    INSERT INTO refresh_tokens (user_id, token_hash, expires_at, revoked_at, created_at, created_ip, user_agent)
    VALUES (?, ?, ?, NULL, ?, ?, ?)
  `).run(user.id, hashToken(refreshToken), refreshExpiresAt, now, requestMeta.ip || '', requestMeta.userAgent || '')

  return {
    accessToken,
    refreshToken,
    expiresIn: ACCESS_TOKEN_TTL_SEC,
    refreshExpiresIn: REFRESH_TOKEN_TTL_SEC,
  }
}

function seedAdminUser() {
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(ADMIN_USERNAME)
  if (existing) return

  const now = nowMs()
  db.prepare(`
    INSERT INTO users (username, password_hash, role, is_active, failed_attempts, locked_until, last_login_at, created_at, updated_at)
    VALUES (?, ?, 'admin', 1, 0, NULL, NULL, ?, ?)
  `).run(ADMIN_USERNAME, hashPassword(ADMIN_PASSWORD), now, now)

  console.warn(`[auth-api] default admin dibuat: ${ADMIN_USERNAME}`)
}

seedAdminUser()
ensureStoryColumns()
ensureStoryOwnershipColumns()
migrateLegacyInventoryData()
ensureScriptoriaSettingsRow()

function parseBody(req, maxBytes = 262144) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []

    req.on('data', (chunk) => {
      size += chunk.length
      if (size > maxBytes) {
        reject(new Error('PAYLOAD_TOO_LARGE'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })

    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({})
        return
      }

      try {
        const text = Buffer.concat(chunks).toString('utf8')
        resolve(text ? JSON.parse(text) : {})
      } catch {
        reject(new Error('INVALID_JSON'))
      }
    })

    req.on('error', reject)
  })
}

function resolveCorsOrigin(req) {
  const requestOrigin = String(req.headers.origin || '')
  if (!requestOrigin) return ''
  if (allowedOrigins.length === 0) return requestOrigin
  return allowedOrigins.includes(requestOrigin) ? requestOrigin : null
}

function sendJson(res, status, payload, corsOrigin = '') {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  }

  if (corsOrigin) {
    headers['Access-Control-Allow-Origin'] = corsOrigin
  }

  res.writeHead(status, headers)
  res.end(JSON.stringify(payload))
}

function getRequestMeta(req) {
  return {
    ip: String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''),
    userAgent: String(req.headers['user-agent'] || ''),
  }
}

function getBearerToken(req) {
  const authHeader = String(req.headers.authorization || '')
  if (!authHeader.toLowerCase().startsWith('bearer ')) return ''
  return authHeader.slice(7).trim()
}

function authenticate(req) {
  const token = getBearerToken(req)
  if (!token) return null

  const now = nowMs()
  return db.prepare(`
    SELECT at.id AS access_id, u.id, u.username, u.role, u.is_active, u.created_at, u.last_login_at, u.password_hash
    FROM access_tokens at
    JOIN users u ON u.id = at.user_id
    WHERE at.token_hash = ?
      AND at.revoked_at IS NULL
      AND at.expires_at > ?
      AND u.is_active = 1
  `).get(hashToken(token), now)
}

function revokeAccessToken(rawToken) {
  if (!rawToken) return
  db.prepare('UPDATE access_tokens SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL').run(nowMs(), hashToken(rawToken))
}

function revokeRefreshToken(rawToken) {
  if (!rawToken) return null

  const hashed = hashToken(rawToken)
  const row = db.prepare('SELECT id, user_id FROM refresh_tokens WHERE token_hash = ? AND revoked_at IS NULL').get(hashed)
  if (!row) return null

  db.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?').run(nowMs(), row.id)
  return row
}

function enforceRole(user, roles) {
  if (!user) return false
  return roles.includes(user.role)
}

const LANGUAGE_NAMES = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
  ar: 'Arabic',
  id: 'Indonesian',
}

const TRANSLATE_ENGINES = new Set(['gemini', 'google', 'deepl', 'yandex', 'libre'])

function normalizeLanguageCode(raw, fallback = 'en') {
  const code = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z-]/g, '')
    .slice(0, 12)

  if (!code) return fallback
  if (!/^[a-z]{2,3}(-[a-z]{2,3})?$/.test(code)) return fallback
  return code
}

function normalizeSourceLanguageCode(raw) {
  const source = String(raw || '').trim().toLowerCase()
  if (!source || source === 'auto') return 'auto'
  return normalizeLanguageCode(source, 'auto')
}

function normalizeTranslateEngine(raw, fallback = TRANSLATE_DEFAULT_ENGINE) {
  const normalized = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, '')

  if (normalized && TRANSLATE_ENGINES.has(normalized)) return normalized
  if (TRANSLATE_ENGINES.has(fallback)) return fallback
  return 'google'
}

function resolveTranslateKey(engine) {
  if (engine === 'deepl') return TRANSLATE_DEEPL_KEY || TRANSLATE_PROVIDER_KEY
  if (engine === 'yandex') return TRANSLATE_YANDEX_KEY || TRANSLATE_PROVIDER_KEY
  if (engine === 'libre') return TRANSLATE_LIBRE_KEY || TRANSLATE_PROVIDER_KEY
  return ''
}

function pickGeminiText(data) {
  const parts = Array.isArray(data?.candidates?.[0]?.content?.parts) ? data.candidates[0].content.parts : []
  const text = parts
    .map((entry) => String(entry?.text || ''))
    .join('')
    .trim()
  return text
}

async function translateTextWithGemini(text, targetCode) {
  if (!GEMINI_API_KEY) {
    throw new Error('TRANSLATE_NOT_CONFIGURED')
  }

  const targetName = LANGUAGE_NAMES[targetCode] || targetCode
  const prompt = [
    `Translate the following story passage into ${targetName}.`,
    'Rules:',
    '- Return only the translation text.',
    '- Preserve paragraph breaks and tone.',
    '- Do not summarize and do not add explanation.',
    '',
    'Text:',
    text,
  ].join('\n')

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(TRANSLATE_GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.15,
        topP: 0.9,
        maxOutputTokens: 4096,
      },
    }),
  })

  if (!response.ok) {
    let detail = ''
    let status = ''
    try {
      const payload = await response.json()
      detail = String(payload?.error?.message || '').trim()
      status = String(payload?.error?.status || '').trim().toUpperCase()
    } catch {
      // noop
    }

    if (response.status === 429 || status === 'RESOURCE_EXHAUSTED') {
      const error = new Error('TRANSLATE_QUOTA_EXCEEDED')
      error.detail = detail
      throw error
    }

    if (response.status === 401 || response.status === 403) {
      const error = new Error('TRANSLATE_NOT_CONFIGURED')
      error.detail = detail
      throw error
    }

    const error = new Error('TRANSLATE_UPSTREAM_FAILED')
    error.detail = detail
    throw error
  }

  const data = await response.json()
  const translatedText = pickGeminiText(data)
  if (!translatedText) {
    throw new Error('TRANSLATE_EMPTY_RESULT')
  }

  return translatedText
}

async function translateTextWithEngine(text, { targetCode, sourceCode = 'auto', engine = TRANSLATE_DEFAULT_ENGINE }) {
  const normalizedEngine = normalizeTranslateEngine(engine)

  if (normalizedEngine === 'gemini') {
    return translateTextWithGemini(text, targetCode)
  }

  const normalizedSourceCode = sourceCode === 'auto' ? TRANSLATE_FALLBACK_SOURCE : sourceCode

  const translator = Translate({
    engine: normalizedEngine,
    key: resolveTranslateKey(normalizedEngine) || undefined,
    url: normalizedEngine === 'libre' && TRANSLATE_LIBRE_URL ? TRANSLATE_LIBRE_URL : undefined,
  })

  const baseLanguageResolver = translator.languages
  translator.languages = (language) => {
    const normalized = String(language || '').trim().toLowerCase()
    if (normalized === 'auto') return 'auto'
    return baseLanguageResolver(normalized)
  }

  try {
    const translatedText = await translator(text, {
      from: normalizedSourceCode,
      to: targetCode,
    })
    const normalizedText = String(translatedText || '').trim()
    if (!normalizedText) {
      throw new Error('TRANSLATE_EMPTY_RESULT')
    }
    return normalizedText
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (/needs a key/i.test(message) || /auth error/i.test(message)) {
      throw new Error('TRANSLATE_NOT_CONFIGURED')
    }
    if (/not part of the ISO 639-1/i.test(message)) {
      throw new Error('TRANSLATE_INVALID_LANGUAGE')
    }
    if (message === 'TRANSLATE_EMPTY_RESULT') {
      throw new Error('TRANSLATE_EMPTY_RESULT')
    }
    throw new Error('TRANSLATE_UPSTREAM_FAILED')
  }
}

async function handleRequest(req, res) {
  const corsOrigin = resolveCorsOrigin(req)
  if (corsOrigin === null) {
    sendJson(res, 403, { ok: false, message: 'Origin tidak diizinkan.' }, '')
    return
  }

  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {}, corsOrigin)
    return
  }

  const requestMeta = getRequestMeta(req)
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  const pathname = url.pathname

  if (req.method === 'GET' && pathname === '/api/health') {
    sendJson(res, 200, { ok: true, service: 'scriptoria-auth-api', time: nowMs() }, corsOrigin)
    return
  }

  if (req.method === 'POST' && pathname === '/api/translate') {
    let body
    try {
      body = await parseBody(req, TRANSLATE_REQUEST_MAX_BYTES)
    } catch (error) {
      const message =
        error.message === 'PAYLOAD_TOO_LARGE'
          ? 'Payload terjemahan terlalu besar.'
          : 'Body JSON tidak valid.'
      sendJson(res, 400, { ok: false, message }, corsOrigin)
      return
    }

    const inputText = String(body?.q || '').trim()
    const target = normalizeLanguageCode(body?.target, 'en')
    const source = normalizeSourceLanguageCode(body?.source)
    const engine = normalizeTranslateEngine(body?.engine)

    if (!inputText) {
      sendJson(res, 400, { ok: false, message: 'Teks terjemahan kosong.' }, corsOrigin)
      return
    }

    if (inputText.length > TRANSLATE_MAX_CHARS) {
      sendJson(
        res,
        400,
        { ok: false, message: `Teks terlalu panjang. Maksimal ${TRANSLATE_MAX_CHARS} karakter per request.` },
        corsOrigin
      )
      return
    }

    try {
      const translatedText = await translateTextWithEngine(inputText, {
        targetCode: target,
        sourceCode: source,
        engine,
      })
      sendJson(res, 200, { ok: true, translatedText, target, source, engine }, corsOrigin)
    } catch (error) {
      if (error.message === 'TRANSLATE_NOT_CONFIGURED') {
        if (engine === 'gemini') {
          sendJson(
            res,
            503,
            { ok: false, message: 'Translator Gemini belum dikonfigurasi. Isi GEMINI_API_KEY pada .env backend.' },
            corsOrigin
          )
          return
        }

        sendJson(
          res,
          503,
          { ok: false, message: `Translator engine "${engine}" butuh API key. Cek konfigurasi .env backend.` },
          corsOrigin
        )
        return
      }

      if (error.message === 'TRANSLATE_QUOTA_EXCEEDED') {
        sendJson(
          res,
          429,
          { ok: false, message: 'Kuota Gemini API habis/terbatas. Cek rate limit dan billing project Google AI Studio.' },
          corsOrigin
        )
        return
      }

      if (error.message === 'TRANSLATE_INVALID_LANGUAGE') {
        sendJson(res, 400, { ok: false, message: 'Kode bahasa tidak valid.' }, corsOrigin)
        return
      }

      if (error.message === 'TRANSLATE_UPSTREAM_FAILED') {
        sendJson(res, 502, { ok: false, message: 'Layanan terjemahan sedang bermasalah. Coba lagi.' }, corsOrigin)
        return
      }

      if (error.message === 'TRANSLATE_EMPTY_RESULT') {
        sendJson(res, 502, { ok: false, message: 'Layanan terjemahan tidak mengembalikan hasil.' }, corsOrigin)
        return
      }

      sendJson(res, 500, { ok: false, message: 'Gagal menerjemahkan teks.' }, corsOrigin)
    }
    return
  }

  if (req.method === 'GET' && pathname === '/api/scriptoria/stories/public') {
    const query = String(url.searchParams.get('q') || '')
      .trim()
      .toLowerCase()
    const genre = String(url.searchParams.get('genre') || '').trim()
    const limitRaw = Number(url.searchParams.get('limit'))
    const offsetRaw = Number(url.searchParams.get('offset'))
    const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, Math.trunc(limitRaw))) : 60
    const offset = Number.isFinite(offsetRaw) ? Math.max(0, Math.trunc(offsetRaw)) : 0

    const where = ["LOWER(s.unit) IN ('published', 'completed')"]
    const params = []

    if (genre) {
      where.push('s.category = ?')
      params.push(genre)
    }

    if (query) {
      where.push(`
        (
          LOWER(s.name) LIKE ?
          OR LOWER(s.category) LIKE ?
          OR LOWER(COALESCE(s.source, '')) LIKE ?
          OR LOWER(COALESCE(s.supplier, '')) LIKE ?
        )
      `)
      const like = `%${query}%`
      params.push(like, like, like, like)
    }

    const whereClause = where.join(' AND ')
    const totalRow = db.prepare(`SELECT COUNT(1) AS total FROM scriptoria_stories s WHERE ${whereClause}`).get(...params)
    const rows = db.prepare(`
      SELECT s.*, d.published_at, u.username AS author_name
      FROM scriptoria_stories s
      LEFT JOIN users u ON u.id = s.owner_id
      LEFT JOIN story_documents d ON d.item_id = s.id
      WHERE ${whereClause}
      ORDER BY COALESCE(d.published_at, s.updated_at) DESC, s.updated_at DESC, s.name ASC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset)

    sendJson(
      res,
      200,
      {
        ok: true,
        total: Number(totalRow?.total) || 0,
        stories: rows.map(rowToPublicStory),
      },
      corsOrigin
    )
    return
  }

  const publicStoryMatch = pathname.match(/^\/api\/scriptoria\/stories\/([^/]+)\/public$/)
  if (req.method === 'GET' && publicStoryMatch) {
    const id = decodeURIComponent(publicStoryMatch[1])
    const story = db.prepare(`
      SELECT s.*, u.username AS author_name
      FROM scriptoria_stories s
      LEFT JOIN users u ON u.id = s.owner_id
      WHERE s.id = ?
    `).get(id)

    if (!story) {
      sendJson(res, 404, { ok: false, message: 'Cerita tidak ditemukan.' }, corsOrigin)
      return
    }

    if (!['published', 'completed'].includes(String(story.unit || '').toLowerCase())) {
      sendJson(res, 403, { ok: false, message: 'Cerita belum berstatus Published/Completed.' }, corsOrigin)
      return
    }

    const document = getStoryDocument(id)
    sendJson(
      res,
      200,
      {
        ok: true,
        story: rowToStory(story),
        document,
      },
      corsOrigin
    )
    return
  }

  if (req.method === 'POST' && pathname === '/api/auth/register') {
    let body
    try {
      body = await parseBody(req)
    } catch (error) {
      const message = error.message === 'PAYLOAD_TOO_LARGE' ? 'Payload terlalu besar.' : 'Body JSON tidak valid.'
      sendJson(res, 400, { ok: false, message }, corsOrigin)
      return
    }

    const username = normalizeUsername(body.username)
    const password = String(body.password || '')
    const confirmPassword = String(body.confirmPassword || '')

    if (!username || !password) {
      sendJson(res, 400, { ok: false, message: 'Username dan password wajib diisi.' }, corsOrigin)
      return
    }

    if (!isValidUsername(username)) {
      sendJson(
        res,
        400,
        { ok: false, message: 'Username minimal 3 karakter. Gunakan huruf kecil, angka, titik, garis bawah, atau strip.' },
        corsOrigin
      )
      return
    }

    if (password.length < 8) {
      sendJson(res, 400, { ok: false, message: 'Password minimal 8 karakter.' }, corsOrigin)
      return
    }

    if (confirmPassword && password !== confirmPassword) {
      sendJson(res, 400, { ok: false, message: 'Konfirmasi password tidak sama.' }, corsOrigin)
      return
    }

    const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
    if (exists) {
      sendJson(res, 409, { ok: false, message: 'Username sudah digunakan.' }, corsOrigin)
      return
    }

    const now = nowMs()
    const created = db.prepare(`
      INSERT INTO users (username, password_hash, role, is_active, failed_attempts, locked_until, last_login_at, created_at, updated_at)
      VALUES (?, ?, 'staff', 1, 0, NULL, ?, ?, ?)
    `).run(username, hashPassword(password), now, now, now)

    const userId = Number(created.lastInsertRowid)
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId)
    const tokens = issueTokens(user, requestMeta)

    writeAudit({
      userId: userId || null,
      action: 'auth.register',
      resource: 'user',
      resourceId: String(userId || ''),
      status: 'success',
      detail: { username, role: 'staff' },
      ip: requestMeta.ip,
      userAgent: requestMeta.userAgent,
    })

    sendJson(
      res,
      201,
      {
        ok: true,
        message: 'Akun berhasil dibuat.',
        ...tokens,
        user: toPublicUser(user),
      },
      corsOrigin
    )
    return
  }

  if (req.method === 'POST' && pathname === '/api/auth/login') {
    let body
    try {
      body = await parseBody(req)
    } catch (error) {
      const message = error.message === 'PAYLOAD_TOO_LARGE' ? 'Payload terlalu besar.' : 'Body JSON tidak valid.'
      sendJson(res, 400, { ok: false, message }, corsOrigin)
      return
    }

    const username = normalizeUsername(body.username)
    const password = String(body.password || '')

    if (!username || !password) {
      sendJson(res, 400, { ok: false, message: 'Username dan password wajib diisi.' }, corsOrigin)
      return
    }

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username)
    const now = nowMs()

    if (!user) {
      writeAudit({
        action: 'auth.login',
        resource: 'session',
        status: 'failed',
        detail: { reason: 'user_not_found', username },
        ip: requestMeta.ip,
        userAgent: requestMeta.userAgent,
      })
      sendJson(res, 401, { ok: false, message: 'Username atau password salah.' }, corsOrigin)
      return
    }

    if (!user.is_active) {
      writeAudit({
        userId: user.id,
        action: 'auth.login',
        resource: 'session',
        status: 'failed',
        detail: { reason: 'inactive_user' },
        ip: requestMeta.ip,
        userAgent: requestMeta.userAgent,
      })
      sendJson(res, 403, { ok: false, message: 'Akun nonaktif.' }, corsOrigin)
      return
    }

    if (user.locked_until && Number(user.locked_until) > now) {
      const retryAfter = Math.max(1, Math.ceil((Number(user.locked_until) - now) / 1000))
      sendJson(res, 423, {
        ok: false,
        message: `Akun terkunci sementara. Coba lagi ${retryAfter} detik.`,
        retryAfter,
      }, corsOrigin)
      return
    }

    const valid = verifyPassword(password, user.password_hash)
    if (!valid) {
      const attempted = Number(user.failed_attempts || 0) + 1
      const shouldLock = attempted >= LOGIN_MAX_ATTEMPTS
      const lockUntil = shouldLock ? now + LOGIN_LOCK_MINUTES * 60 * 1000 : null

      db.prepare('UPDATE users SET failed_attempts = ?, locked_until = ?, updated_at = ? WHERE id = ?')
        .run(shouldLock ? 0 : attempted, lockUntil, now, user.id)

      writeAudit({
        userId: user.id,
        action: 'auth.login',
        resource: 'session',
        status: 'failed',
        detail: { reason: 'invalid_password', failedAttempts: attempted, lockUntil },
        ip: requestMeta.ip,
        userAgent: requestMeta.userAgent,
      })

      if (shouldLock) {
        sendJson(res, 423, {
          ok: false,
          message: `Terlalu banyak percobaan. Akun dikunci ${LOGIN_LOCK_MINUTES} menit.`,
          retryAfter: LOGIN_LOCK_MINUTES * 60,
        }, corsOrigin)
        return
      }

      sendJson(res, 401, { ok: false, message: 'Username atau password salah.' }, corsOrigin)
      return
    }

    db.prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = ?, updated_at = ? WHERE id = ?')
      .run(now, now, user.id)

    const tokens = issueTokens(user, requestMeta)

    writeAudit({
      userId: user.id,
      action: 'auth.login',
      resource: 'session',
      status: 'success',
      detail: { role: user.role },
      ip: requestMeta.ip,
      userAgent: requestMeta.userAgent,
    })

    sendJson(res, 200, {
      ok: true,
      message: 'Login berhasil.',
      user: toPublicUser(user),
      ...tokens,
    }, corsOrigin)
    return
  }

  if (req.method === 'POST' && pathname === '/api/auth/refresh') {
    let body
    try {
      body = await parseBody(req)
    } catch {
      sendJson(res, 400, { ok: false, message: 'Body JSON tidak valid.' }, corsOrigin)
      return
    }

    const refreshToken = String(body.refreshToken || '').trim()
    if (!refreshToken) {
      sendJson(res, 400, { ok: false, message: 'Refresh token wajib diisi.' }, corsOrigin)
      return
    }

    const now = nowMs()
    const row = db.prepare(`
      SELECT rt.id AS refresh_id, u.*
      FROM refresh_tokens rt
      JOIN users u ON u.id = rt.user_id
      WHERE rt.token_hash = ?
        AND rt.revoked_at IS NULL
        AND rt.expires_at > ?
        AND u.is_active = 1
    `).get(hashToken(refreshToken), now)

    if (!row) {
      sendJson(res, 401, { ok: false, message: 'Refresh token tidak valid.' }, corsOrigin)
      return
    }

    db.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?').run(now, row.refresh_id)
    const tokens = issueTokens(row, requestMeta)

    writeAudit({
      userId: row.id,
      action: 'auth.refresh',
      resource: 'session',
      status: 'success',
      detail: { rotatedFrom: row.refresh_id },
      ip: requestMeta.ip,
      userAgent: requestMeta.userAgent,
    })

    sendJson(res, 200, {
      ok: true,
      user: toPublicUser(row),
      ...tokens,
    }, corsOrigin)
    return
  }

  if (req.method === 'POST' && pathname === '/api/auth/logout') {
    let body = {}
    try {
      body = await parseBody(req)
    } catch {
      body = {}
    }

    const refreshToken = String(body.refreshToken || '').trim()
    const accessToken = getBearerToken(req)

    const revokedRefresh = revokeRefreshToken(refreshToken)
    revokeAccessToken(accessToken)

    writeAudit({
      userId: revokedRefresh?.user_id || null,
      action: 'auth.logout',
      resource: 'session',
      status: 'success',
      detail: { hasRefresh: Boolean(refreshToken), hasAccess: Boolean(accessToken) },
      ip: requestMeta.ip,
      userAgent: requestMeta.userAgent,
    })

    sendJson(res, 200, { ok: true, message: 'Logout berhasil.' }, corsOrigin)
    return
  }

  if (req.method === 'GET' && pathname === '/api/auth/me') {
    const authUser = authenticate(req)
    if (!authUser) {
      sendJson(res, 401, { ok: false, message: 'Token tidak valid atau sudah kedaluwarsa.' }, corsOrigin)
      return
    }

    sendJson(res, 200, { ok: true, user: toPublicUser(authUser) }, corsOrigin)
    return
  }

  if (req.method === 'POST' && pathname === '/api/auth/change-password') {
    const authUser = authenticate(req)
    if (!authUser) {
      sendJson(res, 401, { ok: false, message: 'Token tidak valid atau sudah kedaluwarsa.' }, corsOrigin)
      return
    }

    let body
    try {
      body = await parseBody(req)
    } catch {
      sendJson(res, 400, { ok: false, message: 'Body JSON tidak valid.' }, corsOrigin)
      return
    }

    const oldPassword = String(body.oldPassword || '')
    const newPassword = String(body.newPassword || '')

    if (!oldPassword || !newPassword) {
      sendJson(res, 400, { ok: false, message: 'Password lama dan baru wajib diisi.' }, corsOrigin)
      return
    }

    if (newPassword.length < 8) {
      sendJson(res, 400, { ok: false, message: 'Password baru minimal 8 karakter.' }, corsOrigin)
      return
    }

    if (!verifyPassword(oldPassword, authUser.password_hash)) {
      writeAudit({
        userId: authUser.id,
        action: 'auth.change_password',
        resource: 'user',
        resourceId: String(authUser.id),
        status: 'failed',
        detail: { reason: 'invalid_old_password' },
        ip: requestMeta.ip,
        userAgent: requestMeta.userAgent,
      })

      sendJson(res, 400, { ok: false, message: 'Password lama tidak sesuai.' }, corsOrigin)
      return
    }

    const now = nowMs()
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
      .run(hashPassword(newPassword), now, authUser.id)

    db.prepare('UPDATE access_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(now, authUser.id)
    db.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(now, authUser.id)

    writeAudit({
      userId: authUser.id,
      action: 'auth.change_password',
      resource: 'user',
      resourceId: String(authUser.id),
      status: 'success',
      detail: {},
      ip: requestMeta.ip,
      userAgent: requestMeta.userAgent,
    })

    sendJson(res, 200, { ok: true, message: 'Password berhasil diubah. Silakan login ulang.' }, corsOrigin)
    return
  }

  if (req.method === 'GET' && pathname === '/api/scriptoria/snapshot') {
    const authUser = authenticate(req)
    if (!authUser) {
      sendJson(res, 401, { ok: false, message: 'Token tidak valid atau sudah kedaluwarsa.' }, corsOrigin)
      return
    }

    sendJson(res, 200, { ok: true, ...getScriptoriaSnapshot(authUser.id) }, corsOrigin)
    return
  }

  const storyDocumentMatch = pathname.match(/^\/api\/scriptoria\/stories\/([^/]+)\/document$/)
  if (req.method === 'GET' && storyDocumentMatch) {
    const authUser = authenticate(req)
    if (!authUser) {
      sendJson(res, 401, { ok: false, message: 'Token tidak valid atau sudah kedaluwarsa.' }, corsOrigin)
      return
    }

    const storyId = decodeURIComponent(storyDocumentMatch[1])
    const story = getOwnedStoryById(storyId, authUser.id)
    if (!story) {
      sendJson(res, 404, { ok: false, message: 'Cerita tidak ditemukan.' }, corsOrigin)
      return
    }

    const document = getStoryDocument(storyId)
    sendJson(
      res,
      200,
      {
        ok: true,
        story: rowToStory(story),
        document,
        wordCount: countWordsFromDocument(document),
      },
      corsOrigin
    )
    return
  }

  if (req.method === 'PUT' && storyDocumentMatch) {
    const authUser = authenticate(req)
    if (!authUser) {
      sendJson(res, 401, { ok: false, message: 'Token tidak valid atau sudah kedaluwarsa.' }, corsOrigin)
      return
    }

    if (!enforceRole(authUser, SCRIPTORIA_WRITE_ROLES)) {
      sendJson(res, 403, { ok: false, message: 'Role kamu tidak memiliki izin edit konten cerita.' }, corsOrigin)
      return
    }

    let body
    try {
      body = await parseBody(req, SCRIPTORIA_IMPORT_MAX_BYTES)
    } catch (error) {
      const message =
        error.message === 'PAYLOAD_TOO_LARGE'
          ? `Konten cerita terlalu besar. Maksimal ${Math.floor(SCRIPTORIA_IMPORT_MAX_BYTES / (1024 * 1024))}MB.`
          : 'Body JSON tidak valid.'
      sendJson(res, 400, { ok: false, message }, corsOrigin)
      return
    }

    const storyId = decodeURIComponent(storyDocumentMatch[1])
    const story = getOwnedStoryById(storyId, authUser.id)
    if (!story) {
      sendJson(res, 404, { ok: false, message: 'Cerita tidak ditemukan.' }, corsOrigin)
      return
    }

    const currentDocument = getStoryDocument(storyId)
    const incomingDocument = sanitizeStoryDocument({
      chapters: body.chapters,
    })
    const shouldForce = Boolean(body?.force)

    if (!shouldForce && isRiskyDocumentOverwrite(currentDocument, incomingDocument)) {
      writeAudit({
        userId: authUser.id,
        action: 'story.document.update_blocked',
        resource: 'story_documents',
        resourceId: storyId,
        status: 'failed',
        detail: {
          reason: 'risky_overwrite',
          existingChapterCount: currentDocument.chapters.length,
          incomingChapterCount: incomingDocument.chapters.length,
          existingWordCount: countWordsFromDocument(currentDocument),
          incomingWordCount: countWordsFromDocument(incomingDocument),
        },
        ip: requestMeta.ip,
        userAgent: requestMeta.userAgent,
      })

      sendJson(
        res,
        409,
        {
          ok: false,
          code: 'RISKY_OVERWRITE',
          message:
            'Perubahan ini berisiko menimpa banyak isi cerita. Cek lagi dokumenmu, lalu simpan ulang dengan konfirmasi.',
          meta: {
            existingChapterCount: currentDocument.chapters.length,
            incomingChapterCount: incomingDocument.chapters.length,
            existingWordCount: countWordsFromDocument(currentDocument),
            incomingWordCount: countWordsFromDocument(incomingDocument),
          },
        },
        corsOrigin
      )
      return
    }

    saveStoryDocumentRevision(storyId, currentDocument, {
      userId: authUser.id,
      note: shouldForce ? 'before_force_update' : 'before_update',
    })

    const document = saveStoryDocument(storyId, {
      chapters: incomingDocument.chapters,
    })

    writeAudit({
      userId: authUser.id,
      action: 'story.document.update',
      resource: 'story_documents',
      resourceId: storyId,
      status: 'success',
      detail: { chapterCount: document.chapters.length },
      ip: requestMeta.ip,
      userAgent: requestMeta.userAgent,
    })

    sendJson(
      res,
      200,
      {
        ok: true,
        message: 'Konten cerita berhasil disimpan.',
        document,
        wordCount: countWordsFromDocument(document),
      },
      corsOrigin
    )
    return
  }

  const storyPublishMatch = pathname.match(/^\/api\/scriptoria\/stories\/([^/]+)\/publish$/)
  if (req.method === 'POST' && storyPublishMatch) {
    const authUser = authenticate(req)
    if (!authUser) {
      sendJson(res, 401, { ok: false, message: 'Token tidak valid atau sudah kedaluwarsa.' }, corsOrigin)
      return
    }

    if (!enforceRole(authUser, SCRIPTORIA_WRITE_ROLES)) {
      sendJson(res, 403, { ok: false, message: 'Role kamu tidak memiliki izin publikasi cerita.' }, corsOrigin)
      return
    }

    let body
    try {
      body = await parseBody(req)
    } catch {
      sendJson(res, 400, { ok: false, message: 'Body JSON tidak valid.' }, corsOrigin)
      return
    }

    const storyId = decodeURIComponent(storyPublishMatch[1])
    const current = getOwnedStoryById(storyId, authUser.id)
    if (!current) {
      sendJson(res, 404, { ok: false, message: 'Cerita tidak ditemukan.' }, corsOrigin)
      return
    }
    if (requiresCoverForPublished('Published', current.cover_image)) {
      sendJson(res, 400, { ok: false, message: 'Cover wajib di-upload sebelum cerita dipublikasikan.' }, corsOrigin)
      return
    }

    const savedDocument = getStoryDocument(storyId)
    const wordCount = countWordsFromDocument(savedDocument)
    if (wordCount <= 0) {
      sendJson(res, 400, { ok: false, message: 'Konten cerita masih kosong. Isi minimal satu bab sebelum publish.' }, corsOrigin)
      return
    }

    const cleanNote = String(body.note || '').trim().slice(0, 180)
    const beforeWords = Number(current.stock) || 0
    const afterWords = wordCount

    const result = runInTransaction(() => {
      const now = Date.now()
      db.prepare('UPDATE scriptoria_stories SET unit = ?, stock = ?, updated_at = ? WHERE id = ? AND owner_id = ?')
        .run('Published', afterWords, now, storyId, authUser.id)

      const document = saveStoryDocument(storyId, {
        chapters: savedDocument.chapters,
        publishedAt: new Date(now).toISOString(),
      })

      const tx = insertStoryActivity({
        ownerId: authUser.id,
        type: 'update',
        storyId,
        storyTitle: current.name,
        wordsChanged: Math.abs(afterWords - beforeWords),
        wordsBefore: beforeWords,
        wordsAfter: afterWords,
        note: cleanNote || 'Cerita dipublikasikan.',
      })

      const updatedStory = getOwnedStoryById(storyId, authUser.id)
      return { story: rowToStory(updatedStory), document, activity: tx }
    })

    writeAudit({
      userId: authUser.id,
      action: 'story.publish',
      resource: 'scriptoria_stories',
      resourceId: storyId,
      status: 'success',
      detail: { words: afterWords },
      ip: requestMeta.ip,
      userAgent: requestMeta.userAgent,
    })

    sendJson(
      res,
      200,
      {
        ok: true,
        message: 'Cerita berhasil dipublikasikan.',
        ...result,
      },
      corsOrigin
    )
    return
  }

  if (req.method === 'PATCH' && pathname === '/api/scriptoria/settings') {
    const authUser = authenticate(req)
    if (!authUser) {
      sendJson(res, 401, { ok: false, message: 'Token tidak valid atau sudah kedaluwarsa.' }, corsOrigin)
      return
    }

    if (!enforceRole(authUser, SCRIPTORIA_SETTINGS_ROLES)) {
      sendJson(res, 403, { ok: false, message: 'Role kamu tidak memiliki izin ubah pengaturan Scriptoria.' }, corsOrigin)
      return
    }

    let body
    try {
      body = await parseBody(req)
    } catch {
      sendJson(res, 400, { ok: false, message: 'Body JSON tidak valid.' }, corsOrigin)
      return
    }

    const current = getScriptoriaSettings()
    const next = saveScriptoriaSettings({
      ...current,
      ...body,
    })

    writeAudit({
      userId: authUser.id,
      action: 'scriptoria.settings.update',
      resource: 'scriptoria_settings',
      status: 'success',
      detail: { codeFormat: next.codeFormat, yearPrefix: next.yearPrefix },
      ip: requestMeta.ip,
      userAgent: requestMeta.userAgent,
    })

    sendJson(res, 200, { ok: true, message: 'Pengaturan Scriptoria diperbarui.', settings: next }, corsOrigin)
    return
  }

  if (req.method === 'POST' && pathname === '/api/scriptoria/stories') {
    const authUser = authenticate(req)
    if (!authUser) {
      sendJson(res, 401, { ok: false, message: 'Token tidak valid atau sudah kedaluwarsa.' }, corsOrigin)
      return
    }

    if (!enforceRole(authUser, SCRIPTORIA_WRITE_ROLES)) {
      sendJson(res, 403, { ok: false, message: 'Role kamu tidak memiliki izin tambah cerita.' }, corsOrigin)
      return
    }

    let body
    try {
      body = await parseBody(req, SCRIPTORIA_STORY_MAX_BYTES)
    } catch {
      sendJson(
        res,
        400,
        {
          ok: false,
          message: 'Payload cerita tidak valid atau terlalu besar.',
        },
        corsOrigin
      )
      return
    }

    const normalized = normalizeStoryInput(body, { allowCustomId: true })
    if (!normalized) {
      sendJson(res, 400, { ok: false, message: 'Data cerita tidak valid. Judul dan genre wajib diisi.' }, corsOrigin)
      return
    }
    if (String(normalized.status || '').trim().toLowerCase() === 'completed') {
      sendJson(res, 400, { ok: false, message: 'Status Completed hanya bisa dipilih setelah cerita dipublikasikan.' }, corsOrigin)
      return
    }
    if (requiresCoverForPublished(normalized.status, normalized.coverImage)) {
      sendJson(res, 400, { ok: false, message: 'Cover wajib di-upload sebelum status cerita diubah ke Published/Completed.' }, corsOrigin)
      return
    }

    try {
      const result = runInTransaction(() => {
        const existingById = db.prepare('SELECT id FROM scriptoria_stories WHERE id = ?').get(normalized.id)
        if (existingById) {
          throw new Error('ITEM_ID_EXISTS')
        }

        const usedSkus = getExistingCodesSet()
        const code = generateSku(normalized.genre, getScriptoriaSettings(), usedSkus)

        const updatedAt = Date.now()
        db.prepare(`
          INSERT INTO scriptoria_stories
            (id, owner_id, sku, name, category, unit, source, supplier, cover_image, stock, min_stock, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          normalized.id,
          authUser.id,
          code,
          normalized.title,
          normalized.genre,
          normalized.status,
          normalized.summary,
          normalized.audience,
          normalized.coverImage,
          normalized.words,
          normalized.targetWords,
          updatedAt
        )

        const tx = insertStoryActivity({
          ownerId: authUser.id,
          type: 'create',
          storyId: normalized.id,
          storyTitle: normalized.title,
          wordsChanged: normalized.words,
          wordsBefore: 0,
          wordsAfter: normalized.words,
          note: 'Cerita baru ditambahkan.',
        })

        const itemRow = getOwnedStoryById(normalized.id, authUser.id)
        return {
          story: rowToStory(itemRow),
          activity: tx,
        }
      })

      writeAudit({
        userId: authUser.id,
        action: 'scriptoria.story.create',
        resource: 'scriptoria_stories',
        resourceId: normalized.id,
        status: 'success',
        detail: { title: result.story.title },
        ip: requestMeta.ip,
        userAgent: requestMeta.userAgent,
      })

      sendJson(res, 201, { ok: true, message: 'Cerita berhasil ditambahkan.', ...result }, corsOrigin)
    } catch (error) {
      if (error.message === 'ITEM_ID_EXISTS') {
        sendJson(res, 409, { ok: false, message: 'ID cerita sudah ada.' }, corsOrigin)
        return
      }
      throw error
    }
    return
  }

  const updateItemMatch = pathname.match(/^\/api\/scriptoria\/stories\/([^/]+)$/)
  if (req.method === 'PATCH' && updateItemMatch) {
    const authUser = authenticate(req)
    if (!authUser) {
      sendJson(res, 401, { ok: false, message: 'Token tidak valid atau sudah kedaluwarsa.' }, corsOrigin)
      return
    }
    if (!enforceRole(authUser, SCRIPTORIA_WRITE_ROLES)) {
      sendJson(res, 403, { ok: false, message: 'Role kamu tidak memiliki izin edit cerita.' }, corsOrigin)
      return
    }

    let body
    try {
      body = await parseBody(req, SCRIPTORIA_STORY_MAX_BYTES)
    } catch {
      sendJson(
        res,
        400,
        {
          ok: false,
          message: 'Payload cerita tidak valid atau terlalu besar.',
        },
        corsOrigin
      )
      return
    }

    const id = decodeURIComponent(updateItemMatch[1])
    const current = getOwnedStoryById(id, authUser.id)
    if (!current) {
      sendJson(res, 404, { ok: false, message: 'Cerita tidak ditemukan.' }, corsOrigin)
      return
    }

    const merged = normalizeStoryInput(
      {
        id: current.id,
        title: body.title ?? current.name,
        genre: body.genre ?? current.category,
        status: body.status ?? current.unit,
        summary: body.summary ?? current.source,
        audience: body.audience ?? current.supplier,
        coverImage: body.coverImage ?? current.cover_image,
        words: body.words ?? current.stock,
        targetWords: body.targetWords ?? current.min_stock,
        updatedAt: body.updatedAt ?? current.updated_at,
      },
      { allowCustomId: true }
    )

    if (!merged) {
      sendJson(res, 400, { ok: false, message: 'Data cerita tidak valid.' }, corsOrigin)
      return
    }
    if (requiresCoverForPublished(merged.status, merged.coverImage)) {
      sendJson(res, 400, { ok: false, message: 'Cover wajib di-upload sebelum status cerita diubah ke Published/Completed.' }, corsOrigin)
      return
    }

    const currentStatus = String(current.unit || '').trim().toLowerCase()
    const nextStatus = String(merged.status || '').trim().toLowerCase()
    if (nextStatus === 'completed' && !['published', 'completed'].includes(currentStatus)) {
      sendJson(
        res,
        400,
        { ok: false, message: 'Status Completed hanya bisa dipilih dari cerita yang sudah Published.' },
        corsOrigin
      )
      return
    }

    if (nextStatus === 'completed') {
      const currentDocument = getStoryDocument(id)
      const documentWords = countWordsFromDocument(currentDocument)
      if (documentWords <= 0) {
        sendJson(res, 400, { ok: false, message: 'Konten cerita masih kosong. Isi minimal satu bab sebelum tandai Completed.' }, corsOrigin)
        return
      }
      merged.words = Math.max(merged.words, documentWords)
    }

    const beforeWords = Number(current.stock) || 0
    const afterWords = merged.words

    const tx = runInTransaction(() => {
      db.prepare(`
        UPDATE scriptoria_stories
        SET name = ?, category = ?, unit = ?, source = ?, supplier = ?, cover_image = ?, stock = ?, min_stock = ?, updated_at = ?
        WHERE id = ? AND owner_id = ?
      `).run(
        merged.title,
        merged.genre,
        merged.status,
        merged.summary,
        merged.audience,
        merged.coverImage,
        merged.words,
        merged.targetWords,
        Date.now(),
        id,
        authUser.id
      )

      return insertStoryActivity({
        ownerId: authUser.id,
        type: 'update',
        storyId: id,
        storyTitle: merged.title,
        wordsChanged: Math.abs(afterWords - beforeWords),
        wordsBefore: beforeWords,
        wordsAfter: afterWords,
        note: 'Data cerita diperbarui.',
      })
    })

    const updated = getOwnedStoryById(id, authUser.id)
    writeAudit({
      userId: authUser.id,
      action: 'scriptoria.story.update',
      resource: 'scriptoria_stories',
      resourceId: id,
      status: 'success',
      detail: { beforeWords, afterWords },
      ip: requestMeta.ip,
      userAgent: requestMeta.userAgent,
    })

    sendJson(res, 200, { ok: true, message: 'Cerita berhasil diperbarui.', story: rowToStory(updated), activity: tx }, corsOrigin)
    return
  }

  if (req.method === 'DELETE' && updateItemMatch) {
    const authUser = authenticate(req)
    if (!authUser) {
      sendJson(res, 401, { ok: false, message: 'Token tidak valid atau sudah kedaluwarsa.' }, corsOrigin)
      return
    }
    if (!enforceRole(authUser, SCRIPTORIA_WRITE_ROLES)) {
      sendJson(res, 403, { ok: false, message: 'Role kamu tidak memiliki izin hapus cerita.' }, corsOrigin)
      return
    }

    const id = decodeURIComponent(updateItemMatch[1])
    const target = getOwnedStoryById(id, authUser.id)
    if (!target) {
      sendJson(res, 404, { ok: false, message: 'Cerita tidak ditemukan.' }, corsOrigin)
      return
    }

    const tx = runInTransaction(() => {
      db.prepare('DELETE FROM scriptoria_stories WHERE id = ? AND owner_id = ?').run(id, authUser.id)
      return insertStoryActivity({
        ownerId: authUser.id,
        type: 'delete',
        storyId: id,
        storyTitle: target.name,
        wordsChanged: Number(target.stock) || 0,
        wordsBefore: Number(target.stock) || 0,
        wordsAfter: 0,
        note: 'Cerita dihapus dari workspace.',
      })
    })

    writeAudit({
      userId: authUser.id,
      action: 'scriptoria.story.delete',
      resource: 'scriptoria_stories',
      resourceId: id,
      status: 'success',
      detail: { title: target.name },
      ip: requestMeta.ip,
      userAgent: requestMeta.userAgent,
    })

    sendJson(res, 200, { ok: true, message: 'Cerita berhasil dihapus.', activity: tx }, corsOrigin)
    return
  }

  const stockAdjustMatch = pathname.match(/^\/api\/scriptoria\/stories\/([^/]+)\/words$/)
  if (req.method === 'POST' && stockAdjustMatch) {
    const authUser = authenticate(req)
    if (!authUser) {
      sendJson(res, 401, { ok: false, message: 'Token tidak valid atau sudah kedaluwarsa.' }, corsOrigin)
      return
    }
    if (!enforceRole(authUser, SCRIPTORIA_WRITE_ROLES)) {
      sendJson(res, 403, { ok: false, message: 'Role kamu tidak memiliki izin sesi kata.' }, corsOrigin)
      return
    }

    let body
    try {
      body = await parseBody(req)
    } catch {
      sendJson(res, 400, { ok: false, message: 'Body JSON tidak valid.' }, corsOrigin)
      return
    }

    const id = decodeURIComponent(stockAdjustMatch[1])
    const story = getOwnedStoryById(id, authUser.id)
    if (!story) {
      sendJson(res, 404, { ok: false, message: 'Cerita tidak ditemukan.' }, corsOrigin)
      return
    }

    const type = String(body.type || '').trim()
    const qty = Math.max(1, Number(body.qty) || 0)
    if (!['in', 'out'].includes(type) || !qty) {
      sendJson(res, 400, { ok: false, message: 'Jenis sesi atau jumlah kata tidak valid.' }, corsOrigin)
      return
    }

    const beforeWords = Number(story.stock) || 0
    if (type === 'out' && beforeWords < qty) {
      sendJson(res, 400, { ok: false, message: 'Jumlah kata tidak cukup untuk dikurangi.' }, corsOrigin)
      return
    }

    const afterWords = type === 'in' ? beforeWords + qty : beforeWords - qty
    const cleanedNote = String(body.note || '').trim().slice(0, 160)
    const defaultNote = type === 'in' ? 'Penambahan kata.' : 'Pengurangan kata.'

    const tx = runInTransaction(() => {
      db.prepare('UPDATE scriptoria_stories SET stock = ?, updated_at = ? WHERE id = ? AND owner_id = ?')
        .run(afterWords, Date.now(), id, authUser.id)
      return insertStoryActivity({
        ownerId: authUser.id,
        type,
        storyId: id,
        storyTitle: story.name,
        wordsChanged: qty,
        wordsBefore: beforeWords,
        wordsAfter: afterWords,
        note: cleanedNote || defaultNote,
      })
    })

    writeAudit({
      userId: authUser.id,
      action: 'scriptoria.words.adjust',
      resource: 'scriptoria_stories',
      resourceId: id,
      status: 'success',
      detail: { type, qty, beforeWords, afterWords },
      ip: requestMeta.ip,
      userAgent: requestMeta.userAgent,
    })

    const updated = getOwnedStoryById(id, authUser.id)
    sendJson(res, 200, { ok: true, message: 'Sesi kata berhasil dicatat.', story: rowToStory(updated), activity: tx }, corsOrigin)
    return
  }

  if (req.method === 'POST' && pathname === '/api/scriptoria/import') {
    const authUser = authenticate(req)
    if (!authUser) {
      sendJson(res, 401, { ok: false, message: 'Token tidak valid atau sudah kedaluwarsa.' }, corsOrigin)
      return
    }
    if (!enforceRole(authUser, SCRIPTORIA_IMPORT_ROLES)) {
      sendJson(res, 403, { ok: false, message: 'Role kamu tidak memiliki izin import data.' }, corsOrigin)
      return
    }

    let body
    try {
      body = await parseBody(req, SCRIPTORIA_IMPORT_MAX_BYTES)
    } catch (error) {
      const message =
        error.message === 'PAYLOAD_TOO_LARGE'
          ? `File import terlalu besar. Maksimal ${Math.floor(SCRIPTORIA_IMPORT_MAX_BYTES / (1024 * 1024))}MB.`
          : 'Body JSON tidak valid.'
      sendJson(res, 400, { ok: false, message }, corsOrigin)
      return
    }

    const rawStories = Array.isArray(body.stories) ? body.stories : Array.isArray(body.items) ? body.items : null
    const rawActivities = Array.isArray(body.activities) ? body.activities : Array.isArray(body.transactions) ? body.transactions : []
    if (!rawStories || rawStories.length === 0) {
      sendJson(res, 400, { ok: false, message: 'Data cerita pada file import tidak valid atau kosong.' }, corsOrigin)
      return
    }

    const nextSettings = sanitizeScriptoriaSettings(body.settings)
    const nextStories = rawStories.map((entry) => normalizeStoryInput(entry, { allowCustomId: true })).filter(Boolean)
    const nextActivities = rawActivities.map(normalizeStoryActivityInput).filter(Boolean)

    if (!nextStories.length) {
      sendJson(res, 400, { ok: false, message: 'Data cerita pada file import tidak valid atau kosong.' }, corsOrigin)
      return
    }

    runInTransaction(() => {
      saveScriptoriaSettings(nextSettings)
      db.prepare('DELETE FROM scriptoria_activities WHERE owner_id = ?').run(authUser.id)
      db.prepare('DELETE FROM scriptoria_stories WHERE owner_id = ?').run(authUser.id)

      const usedSkus = getExistingCodesSet()
      const bySku = new Map()
      const byId = new Set()
      const remappedStoryIds = new Map()
      const occupiedStoryIds = new Set(
        db.prepare('SELECT id FROM scriptoria_stories').all().map((row) => String(row.id || '').trim()).filter(Boolean)
      )

      nextStories.forEach((story) => {
        const originalId = String(story.id || '').trim()
        let nextId = originalId || crypto.randomUUID()
        while (occupiedStoryIds.has(nextId)) {
          nextId = crypto.randomUUID()
        }
        occupiedStoryIds.add(nextId)
        if (nextId !== originalId && originalId) {
          remappedStoryIds.set(originalId, nextId)
        }

        let code = story.legacyCode
        if (!code || usedSkus.has(code)) {
          code = generateSku(story.genre, nextSettings, usedSkus)
        }
        usedSkus.add(code)
        bySku.set(code, nextId)
        byId.add(nextId)

        db.prepare(`
          INSERT INTO scriptoria_stories
            (id, owner_id, sku, name, category, unit, source, supplier, cover_image, stock, min_stock, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          nextId,
          authUser.id,
          code,
          story.title,
          story.genre,
          story.status,
          story.summary,
          story.audience,
          story.coverImage,
          story.words,
          story.targetWords,
          story.updatedAtMs || Date.now()
        )
      })

      nextActivities.forEach((entry) => {
        let storyId = entry.storyId
        if (storyId && remappedStoryIds.has(storyId)) {
          storyId = remappedStoryIds.get(storyId)
        }
        if (storyId && !byId.has(storyId) && bySku.has(storyId)) {
          storyId = bySku.get(storyId)
        }
        if (storyId && !byId.has(storyId)) {
          storyId = null
        }

        insertStoryActivity({
          ...entry,
          ownerId: authUser.id,
          storyId,
        })
      })
    })

    writeAudit({
      userId: authUser.id,
      action: 'scriptoria.import',
      resource: 'scriptoria_snapshot',
      status: 'success',
      detail: { stories: nextStories.length, activities: nextActivities.length },
      ip: requestMeta.ip,
      userAgent: requestMeta.userAgent,
    })

    sendJson(res, 200, {
      ok: true,
      message: 'Data berhasil di-import.',
      snapshot: getScriptoriaSnapshot(authUser.id),
    }, corsOrigin)
    return
  }

  if (req.method === 'GET' && pathname === '/api/admin/users') {
    const authUser = authenticate(req)
    if (!authUser) {
      sendJson(res, 401, { ok: false, message: 'Token tidak valid atau sudah kedaluwarsa.' }, corsOrigin)
      return
    }

    if (!enforceRole(authUser, ['admin'])) {
      sendJson(res, 403, { ok: false, message: 'Akses ditolak (RBAC).' }, corsOrigin)
      return
    }

    const users = db.prepare('SELECT id, username, role, is_active, created_at, last_login_at FROM users ORDER BY id ASC').all()
    sendJson(res, 200, {
      ok: true,
      users: users.map((row) => ({
        id: row.id,
        username: row.username,
        role: row.role,
        isActive: Boolean(row.is_active),
        createdAt: row.created_at,
        lastLoginAt: row.last_login_at,
      })),
    }, corsOrigin)
    return
  }

  if (req.method === 'POST' && pathname === '/api/admin/users') {
    const authUser = authenticate(req)
    if (!authUser) {
      sendJson(res, 401, { ok: false, message: 'Token tidak valid atau sudah kedaluwarsa.' }, corsOrigin)
      return
    }

    if (!enforceRole(authUser, ['admin'])) {
      sendJson(res, 403, { ok: false, message: 'Akses ditolak (RBAC).' }, corsOrigin)
      return
    }

    let body
    try {
      body = await parseBody(req)
    } catch {
      sendJson(res, 400, { ok: false, message: 'Body JSON tidak valid.' }, corsOrigin)
      return
    }

    const username = normalizeUsername(body.username)
    const password = String(body.password || '')
    const role = String(body.role || 'staff').toLowerCase()

    if (!username || !password) {
      sendJson(res, 400, { ok: false, message: 'Username dan password wajib diisi.' }, corsOrigin)
      return
    }

    if (password.length < 8) {
      sendJson(res, 400, { ok: false, message: 'Password minimal 8 karakter.' }, corsOrigin)
      return
    }

    if (!ROLES.includes(role)) {
      sendJson(res, 400, { ok: false, message: `Role tidak valid. Gunakan: ${ROLES.join(', ')}` }, corsOrigin)
      return
    }

    const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
    if (exists) {
      sendJson(res, 409, { ok: false, message: 'Username sudah digunakan.' }, corsOrigin)
      return
    }

    const now = nowMs()
    const result = db.prepare(`
      INSERT INTO users (username, password_hash, role, is_active, failed_attempts, locked_until, last_login_at, created_at, updated_at)
      VALUES (?, ?, ?, 1, 0, NULL, NULL, ?, ?)
    `).run(username, hashPassword(password), role, now, now)

    writeAudit({
      userId: authUser.id,
      action: 'admin.create_user',
      resource: 'user',
      resourceId: String(result.lastInsertRowid),
      status: 'success',
      detail: { username, role },
      ip: requestMeta.ip,
      userAgent: requestMeta.userAgent,
    })

    sendJson(res, 201, { ok: true, message: 'User berhasil dibuat.' }, corsOrigin)
    return
  }

  const roleUpdateMatch = pathname.match(/^\/api\/admin\/users\/(\d+)\/role$/)
  if (req.method === 'PATCH' && roleUpdateMatch) {
    const authUser = authenticate(req)
    if (!authUser) {
      sendJson(res, 401, { ok: false, message: 'Token tidak valid atau sudah kedaluwarsa.' }, corsOrigin)
      return
    }

    if (!enforceRole(authUser, ['admin'])) {
      sendJson(res, 403, { ok: false, message: 'Akses ditolak (RBAC).' }, corsOrigin)
      return
    }

    let body
    try {
      body = await parseBody(req)
    } catch {
      sendJson(res, 400, { ok: false, message: 'Body JSON tidak valid.' }, corsOrigin)
      return
    }

    const role = String(body.role || '').toLowerCase()
    const userId = Number(roleUpdateMatch[1])

    if (!ROLES.includes(role)) {
      sendJson(res, 400, { ok: false, message: `Role tidak valid. Gunakan: ${ROLES.join(', ')}` }, corsOrigin)
      return
    }

    const target = db.prepare('SELECT id, role FROM users WHERE id = ?').get(userId)
    if (!target) {
      sendJson(res, 404, { ok: false, message: 'User tidak ditemukan.' }, corsOrigin)
      return
    }

    db.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').run(role, nowMs(), userId)

    writeAudit({
      userId: authUser.id,
      action: 'admin.change_role',
      resource: 'user',
      resourceId: String(userId),
      status: 'success',
      detail: { from: target.role, to: role },
      ip: requestMeta.ip,
      userAgent: requestMeta.userAgent,
    })

    sendJson(res, 200, { ok: true, message: 'Role user berhasil diubah.' }, corsOrigin)
    return
  }

  if (req.method === 'GET' && pathname === '/api/admin/audit-logs') {
    const authUser = authenticate(req)
    if (!authUser) {
      sendJson(res, 401, { ok: false, message: 'Token tidak valid atau sudah kedaluwarsa.' }, corsOrigin)
      return
    }

    if (!enforceRole(authUser, ['admin'])) {
      sendJson(res, 403, { ok: false, message: 'Akses ditolak (RBAC).' }, corsOrigin)
      return
    }

    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 50))

    const logs = db.prepare(`
      SELECT a.id, a.user_id, u.username, a.action, a.resource, a.resource_id,
             a.status, a.detail, a.ip, a.user_agent, a.created_at
      FROM audit_logs a
      LEFT JOIN users u ON u.id = a.user_id
      ORDER BY a.created_at DESC
      LIMIT ?
    `).all(limit)

    sendJson(res, 200, {
      ok: true,
      logs: logs.map((row) => {
        let detail = {}
        try {
          detail = JSON.parse(row.detail || '{}')
        } catch {
          detail = {}
        }

        return {
          id: row.id,
          userId: row.user_id,
          username: row.username,
          action: row.action,
          resource: row.resource,
          resourceId: row.resource_id,
          status: row.status,
          detail,
          ip: row.ip,
          userAgent: row.user_agent,
          createdAt: row.created_at,
        }
      }),
    }, corsOrigin)
    return
  }

  sendJson(res, 404, { ok: false, message: `Route tidak ditemukan: ${req.method} ${pathname}` }, corsOrigin)
}

const server = createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    console.error('[auth-api-error]', error)

    const corsOrigin = resolveCorsOrigin(req)
    const safeOrigin = corsOrigin && corsOrigin !== null ? corsOrigin : ''
    sendJson(res, 500, { ok: false, message: 'Internal server error.' }, safeOrigin)
  })
})

server.on('error', (error) => {
  console.error('[auth-api] failed to start:', error.message)
  process.exit(1)
})

server.listen(API_PORT, API_HOST, () => {
  console.log(`[auth-api] running on http://${API_HOST}:${API_PORT}`)
  console.log(`[auth-api] sqlite file: ${dbPath}`)
})

function shutdown() {
  server.close(() => {
    db.close()
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
