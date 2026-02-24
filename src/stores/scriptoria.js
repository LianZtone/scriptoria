import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { API_BASE_URL, ApiError, apiRequest } from '../utils/api'
import { normalizeGenreValue, parseGenreList } from '../utils/genre'
import { useAuthStore } from './auth'

const AUTO_BACKUP_KEY = 'scriptoria-auto-backup-v1'
const SCRIPTORIA_PREFS_KEY = 'scriptoria-preferences-v1'
const SCHEMA_VERSION = 1

const STORY_STATUSES = ['Draft', 'Review', 'Published', 'Completed', 'Archived']

const DEFAULT_PREFERENCES = {
  defaultGenre: 'Fiksi',
  defaultStatus: 'Draft',
  editorFontSize: 'base',
  publishVisibility: 'public',
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

function normalizeStatus(raw) {
  const next = String(raw || '').trim()
  if (!next) return DEFAULT_PREFERENCES.defaultStatus

  const matched = STORY_STATUSES.find((value) => value.toLowerCase() === next.toLowerCase())
  return matched || DEFAULT_PREFERENCES.defaultStatus
}

function normalizeDefaultStatus(raw) {
  const status = normalizeStatus(raw)
  return status === 'Completed' ? 'Draft' : status
}

function toPositiveNumber(value) {
  const next = Number(value)
  if (!Number.isFinite(next)) return 0
  return Math.max(0, Math.round(next))
}

function sanitizePreferences(raw) {
  const merged = {
    ...DEFAULT_PREFERENCES,
    ...(raw && typeof raw === 'object' ? raw : {}),
  }

  const editorFontSize = ['sm', 'base', 'lg'].includes(merged.editorFontSize) ? merged.editorFontSize : 'base'
  const publishVisibility = ['public', 'community', 'private'].includes(merged.publishVisibility)
    ? merged.publishVisibility
    : 'public'

  return {
    defaultGenre: normalizeGenreValue(merged.defaultGenre || DEFAULT_PREFERENCES.defaultGenre) || DEFAULT_PREFERENCES.defaultGenre,
    defaultStatus: normalizeDefaultStatus(merged.defaultStatus),
    editorFontSize,
    publishVisibility,
  }
}

function loadPreferences() {
  return sanitizePreferences(parseJson(localStorage.getItem(SCRIPTORIA_PREFS_KEY), DEFAULT_PREFERENCES))
}

function sanitizeStory(raw) {
  if (!raw || typeof raw !== 'object') return null

  const title = String(raw.title || raw.name || '').trim()
  const genre = normalizeGenreValue(raw.genre || raw.category || '')
  if (!title || !genre) return null

  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : crypto.randomUUID(),
    title,
    genre,
    status: normalizeStatus(raw.status || raw.unit),
    authorName: String(raw.authorName || raw.author_name || '').trim(),
    summary: String(raw.summary || raw.source || '').trim(),
    audience: String(raw.audience || raw.supplier || '').trim(),
    coverImage: String(raw.coverImage || raw.cover_image || '').trim(),
    words: toPositiveNumber(raw.words ?? raw.stock),
    targetWords: toPositiveNumber(raw.targetWords ?? raw.minStock),
    updatedAt: raw.updatedAt || nowIso(),
  }
}

function sanitizeActivity(raw) {
  if (!raw || typeof raw !== 'object') return null

  const type = String(raw.type || '').trim()
  const storyTitle = String(raw.storyTitle || raw.itemName || '').trim()
  if (!type || !storyTitle) return null

  const wordsBefore = Number(raw.wordsBefore ?? raw.beforeStock ?? 0) || 0
  const wordsAfter = Number(raw.wordsAfter ?? raw.afterStock ?? 0) || 0
  const computedDelta = Math.abs(wordsAfter - wordsBefore)

  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : crypto.randomUUID(),
    createdAt: raw.createdAt || nowIso(),
    type,
    storyId: raw.storyId || raw.itemId || null,
    storyTitle,
    wordsChanged: toPositiveNumber(raw.wordsChanged ?? raw.qty ?? computedDelta),
    wordsBefore,
    wordsAfter,
    note: String(raw.note || '').trim(),
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
    updatedAt: source.updatedAt || nowIso(),
  }
}

function countWordsFromDocument(document) {
  const text = (document?.chapters || [])
    .map((chapter) => `${chapter.title || ''}\n${chapter.content || ''}`)
    .join('\n\n')
    .trim()

  if (!text) return 0
  return text.split(/\s+/).filter(Boolean).length
}

function toBackendStory(story) {
  return {
    id: story.id,
    title: story.title,
    genre: story.genre,
    status: story.status,
    summary: story.summary,
    audience: story.audience,
    coverImage: story.coverImage || '',
    words: story.words,
    targetWords: story.targetWords,
    updatedAt: story.updatedAt,
  }
}

function toBackendActivity(activity) {
  return {
    id: activity.id,
    createdAt: activity.createdAt,
    type: activity.type,
    storyId: activity.storyId,
    storyTitle: activity.storyTitle,
    wordsChanged: activity.wordsChanged,
    wordsBefore: activity.wordsBefore,
    wordsAfter: activity.wordsAfter,
    note: activity.note,
  }
}

function toErrorMessage(error, fallback = 'Operasi Scriptoria gagal.') {
  if (error instanceof ApiError) {
    return normalizeLegacyMessage(error.message)
  }
  if (error instanceof TypeError) {
    return `Tidak bisa terhubung ke Scriptoria API (${API_BASE_URL}). Jalankan backend: npm run dev:server`
  }
  return fallback
}

function normalizeLegacyMessage(message) {
  return String(message || '')
    .replace(/\bbarang\b/gi, 'cerita')
    .replace(/\bstok\b/gi, 'kata')
    .replace(/\binventaris\b/gi, 'workspace')
}

export const useScriptoriaStore = defineStore('scriptoria', () => {
  const auth = useAuthStore()

  const stories = ref([])
  const activities = ref([])
  const preferences = ref(loadPreferences())
  const documents = ref({})

  const isReady = ref(false)
  const isLoading = ref(false)
  const lastError = ref('')

  const undoState = ref(null)
  const canUndo = computed(() => Boolean(undoState.value))

  let suppressUndo = false

  const genres = computed(() => {
    const unique = new Set()
    stories.value.forEach((story) => {
      parseGenreList(story.genre).forEach((genre) => unique.add(genre))
    })
    return Array.from(unique).sort((a, b) => a.localeCompare(b, 'id'))
  })

  const totalWords = computed(() => {
    return stories.value.reduce((total, story) => total + Math.max(0, story.words), 0)
  })

  const publishedCount = computed(() => stories.value.filter((story) => story.status === 'Published').length)
  const draftCount = computed(() => stories.value.filter((story) => story.status === 'Draft').length)
  const reviewCount = computed(() => stories.value.filter((story) => story.status === 'Review').length)
  const archivedCount = computed(() => stories.value.filter((story) => story.status === 'Archived').length)

  const needsAttentionStories = computed(() => {
    return stories.value.filter((story) => {
      if (story.status === 'Published' || story.status === 'Completed' || story.status === 'Archived') return false
      return story.targetWords > 0 && story.words < story.targetWords
    })
  })

  const needsAttentionCount = computed(() => needsAttentionStories.value.length)

  const todayActivityCount = computed(() => {
    const today = new Date().toISOString().slice(0, 10)
    return activities.value.filter((entry) => String(entry.createdAt || '').slice(0, 10) === today).length
  })

  function persistPreferences() {
    localStorage.setItem(SCRIPTORIA_PREFS_KEY, JSON.stringify(preferences.value))
  }

  function setUndo(payload) {
    if (suppressUndo) return
    undoState.value = payload
  }

  function syncStory(story) {
    const next = sanitizeStory(story)
    if (!next) return

    const index = stories.value.findIndex((entry) => entry.id === next.id)
    if (index >= 0) {
      stories.value[index] = next
      return
    }

    stories.value.unshift(next)
  }

  function syncActivity(activity) {
    const next = sanitizeActivity(activity)
    if (!next) return

    const index = activities.value.findIndex((entry) => entry.id === next.id)
    if (index >= 0) {
      activities.value[index] = next
      return
    }

    activities.value.unshift(next)
  }

  function applySnapshot(payload) {
    stories.value = Array.isArray(payload?.stories)
      ? payload.stories.map(sanitizeStory).filter(Boolean)
      : Array.isArray(payload?.items)
        ? payload.items.map(sanitizeStory).filter(Boolean)
        : []

    activities.value = Array.isArray(payload?.activities)
      ? payload.activities.map(sanitizeActivity).filter(Boolean)
      : Array.isArray(payload?.transactions)
        ? payload.transactions.map(sanitizeActivity).filter(Boolean)
        : []
  }

  function pickStoryResponse(payload) {
    return payload?.story || payload?.item || null
  }

  function pickActivityResponse(payload) {
    return payload?.activity || payload?.transaction || null
  }

  function setStoryDocument(storyId, document) {
    const cleanId = String(storyId || '').trim()
    if (!cleanId) return null

    const next = sanitizeStoryDocument(document)
    documents.value = {
      ...documents.value,
      [cleanId]: next,
    }
    return next
  }

  function getCachedStoryDocument(storyId) {
    const cleanId = String(storyId || '').trim()
    if (!cleanId) return null
    return documents.value[cleanId] || null
  }

  async function authedRequest(path, options = {}) {
    const hasSession = await auth.ensureSessionValid()
    const token = auth.session?.accessToken

    if (!hasSession || !token) {
      throw new ApiError('Sesi login tidak valid. Silakan login ulang.', 401)
    }

    try {
      return await apiRequest(path, {
        ...options,
        token,
      })
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        auth.logout()
      }
      throw error
    }
  }

  async function initialize(force = false) {
    if (isLoading.value) {
      return { ok: false, message: 'Workspace Scriptoria sedang dimuat.' }
    }

    if (isReady.value && !force) {
      return { ok: true }
    }

    isLoading.value = true
    lastError.value = ''

    try {
      const data = await authedRequest('/api/scriptoria/snapshot')
      applySnapshot(data)
      isReady.value = true
      return { ok: true }
    } catch (error) {
      const message = toErrorMessage(error, 'Gagal memuat workspace Scriptoria.')
      lastError.value = message
      return { ok: false, message }
    } finally {
      isLoading.value = false
    }
  }

  function clearState() {
    stories.value = []
    activities.value = []
    documents.value = {}
    preferences.value = loadPreferences()
    undoState.value = null
    isReady.value = false
    isLoading.value = false
    lastError.value = ''
  }

  async function addStory(payload, { skipUndo = false } = {}) {
    try {
      const normalized = sanitizeStory(payload)
      if (!normalized) {
        return { ok: false, message: 'Data cerita tidak valid. Judul dan genre wajib diisi.' }
      }

      const data = await authedRequest('/api/scriptoria/stories', {
        method: 'POST',
        body: toBackendStory(normalized),
      })

      const createdStory = pickStoryResponse(data)
      const createdActivity = pickActivityResponse(data)
      if (createdStory) syncStory(createdStory)
      if (createdActivity) syncActivity(createdActivity)

      if (!skipUndo && createdStory) {
        setUndo({
          type: 'create',
          storyId: createdStory.id,
          storyTitle: createdStory.title || createdStory.name,
        })
      }

      return { ok: true, message: 'Cerita berhasil dibuat.' }
    } catch (error) {
      return { ok: false, message: toErrorMessage(error, 'Gagal membuat cerita.') }
    }
  }

  async function updateStory(id, payload, { skipUndo = false } = {}) {
    const before = sanitizeStory(stories.value.find((entry) => entry.id === id) || {})

    try {
      const normalized = sanitizeStory({
        ...(before || {}),
        ...payload,
        id,
      })

      if (!normalized) {
        return { ok: false, message: 'Data cerita tidak valid.' }
      }

      const data = await authedRequest(`/api/scriptoria/stories/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: toBackendStory(normalized),
      })

      const updatedStory = pickStoryResponse(data)
      const updatedActivity = pickActivityResponse(data)
      if (updatedStory) syncStory(updatedStory)
      if (updatedActivity) syncActivity(updatedActivity)

      if (!skipUndo && before?.id) {
        setUndo({
          type: 'update',
          storyId: id,
          before,
        })
      }

      return { ok: true, message: 'Cerita berhasil diperbarui.' }
    } catch (error) {
      return { ok: false, message: toErrorMessage(error, 'Gagal memperbarui cerita.') }
    }
  }

  async function deleteStory(id, { skipUndo = false } = {}) {
    const index = stories.value.findIndex((entry) => entry.id === id)
    const target = index >= 0 ? sanitizeStory(stories.value[index]) : null

    try {
      const data = await authedRequest(`/api/scriptoria/stories/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })

      if (index >= 0) stories.value.splice(index, 1)
      const deletedActivity = pickActivityResponse(data)
      if (deletedActivity) syncActivity(deletedActivity)

      if (!skipUndo && target) {
        setUndo({
          type: 'delete',
          index,
          story: target,
        })
      }

      return { ok: true, message: 'Cerita berhasil dihapus.' }
    } catch (error) {
      return { ok: false, message: toErrorMessage(error, 'Gagal menghapus cerita.') }
    }
  }

  async function adjustWordCount(id, type, amount, note = '', { skipUndo = false } = {}) {
    const target = stories.value.find((entry) => entry.id === id)
    const qty = toPositiveNumber(amount)

    if (!target) {
      return { ok: false, message: 'Cerita tidak ditemukan.' }
    }

    if (!['in', 'out'].includes(type) || qty <= 0) {
      return { ok: false, message: 'Jenis sesi atau jumlah kata tidak valid.' }
    }

    try {
      const data = await authedRequest(`/api/scriptoria/stories/${encodeURIComponent(id)}/words`, {
        method: 'POST',
        body: {
          type,
          qty,
          note,
        },
      })

      const updatedStory = pickStoryResponse(data)
      const updatedActivity = pickActivityResponse(data)
      if (updatedStory) syncStory(updatedStory)
      if (updatedActivity) syncActivity(updatedActivity)

      if (!skipUndo && target && updatedStory) {
        setUndo({
          type: 'words',
          storyId: id,
          beforeWords: target.words,
          afterWords: toPositiveNumber(updatedStory.words ?? updatedStory.stock),
        })
      }

      return {
        ok: true,
        message: type === 'in' ? 'Jumlah kata berhasil ditambahkan.' : 'Jumlah kata berhasil dikurangi.',
      }
    } catch (error) {
      return { ok: false, message: toErrorMessage(error, 'Gagal memperbarui jumlah kata.') }
    }
  }

  async function fetchStoryDocument(storyId, { force = false } = {}) {
    const cleanId = String(storyId || '').trim()
    if (!cleanId) {
      return { ok: false, message: 'ID cerita tidak valid.' }
    }

    if (!force) {
      const cached = getCachedStoryDocument(cleanId)
      if (cached) {
        return {
          ok: true,
          document: cached,
          wordCount: countWordsFromDocument(cached),
        }
      }
    }

    try {
      const data = await authedRequest(`/api/scriptoria/stories/${encodeURIComponent(cleanId)}/document`)
      if (data?.story) syncStory(data.story)
      const document = setStoryDocument(cleanId, data?.document)
      return {
        ok: true,
        document,
        wordCount: Number(data?.wordCount) || countWordsFromDocument(document),
      }
    } catch (error) {
      return { ok: false, message: toErrorMessage(error, 'Gagal memuat dokumen cerita.') }
    }
  }

  async function saveStoryDocument(storyId, documentPayload, { force = false } = {}) {
    const cleanId = String(storyId || '').trim()
    if (!cleanId) {
      return { ok: false, message: 'ID cerita tidak valid.' }
    }

    const prepared = sanitizeStoryDocument(documentPayload)

    try {
      const data = await authedRequest(`/api/scriptoria/stories/${encodeURIComponent(cleanId)}/document`, {
        method: 'PUT',
        body: {
          chapters: prepared.chapters,
          force: Boolean(force),
        },
      })

      if (data?.story) syncStory(data.story)
      const document = setStoryDocument(cleanId, data?.document || prepared)
      return {
        ok: true,
        message: data?.message || 'Konten cerita berhasil disimpan.',
        document,
        wordCount: Number(data?.wordCount) || countWordsFromDocument(document),
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && error.data?.code === 'RISKY_OVERWRITE') {
        return {
          ok: false,
          message: toErrorMessage(error, 'Perubahan berisiko menimpa dokumen.'),
          needsForce: true,
          conflictMeta: error.data?.meta || null,
        }
      }
      return { ok: false, message: toErrorMessage(error, 'Gagal menyimpan konten cerita.') }
    }
  }

  async function publishStory(storyId, note = '') {
    const cleanId = String(storyId || '').trim()
    if (!cleanId) {
      return { ok: false, message: 'ID cerita tidak valid.' }
    }

    const targetStory = stories.value.find((entry) => entry.id === cleanId) || null
    if (targetStory && !String(targetStory.coverImage || '').trim()) {
      return { ok: false, message: 'Cover wajib di-upload sebelum cerita dipublikasikan.' }
    }

    try {
      const data = await authedRequest(`/api/scriptoria/stories/${encodeURIComponent(cleanId)}/publish`, {
        method: 'POST',
        body: { note },
      })

      if (data?.story) syncStory(data.story)
      if (data?.transaction) syncActivity(data.transaction)
      if (data?.document) setStoryDocument(cleanId, data.document)

      return {
        ok: true,
        message: data?.message || 'Cerita berhasil dipublikasikan.',
      }
    } catch (error) {
      return { ok: false, message: toErrorMessage(error, 'Gagal mempublikasikan cerita.') }
    }
  }

  async function fetchPublicStory(storyId) {
    const cleanId = String(storyId || '').trim()
    if (!cleanId) {
      return { ok: false, message: 'ID cerita tidak valid.' }
    }

    try {
      const data = await apiRequest(`/api/scriptoria/stories/${encodeURIComponent(cleanId)}/public`)
      const story = sanitizeStory(data?.story)
      const document = sanitizeStoryDocument(data?.document)
      return {
        ok: true,
        story,
        document,
        wordCount: countWordsFromDocument(document),
      }
    } catch (error) {
      return { ok: false, message: toErrorMessage(error, 'Cerita tidak tersedia untuk publik.') }
    }
  }

  async function fetchPublicStories({ q = '', genre = '', limit = 60, offset = 0 } = {}) {
    const params = new URLSearchParams()
    const query = String(q || '').trim()
    const selectedGenre = String(genre || '').trim()
    const parsedLimit = Number(limit)
    const parsedOffset = Number(offset)

    if (query) params.set('q', query)
    if (selectedGenre) params.set('genre', selectedGenre)
    if (Number.isFinite(parsedLimit) && parsedLimit > 0) params.set('limit', String(Math.trunc(parsedLimit)))
    if (Number.isFinite(parsedOffset) && parsedOffset >= 0) params.set('offset', String(Math.trunc(parsedOffset)))

    const queryString = params.toString()
    const path = queryString ? `/api/scriptoria/stories/public?${queryString}` : '/api/scriptoria/stories/public'

    try {
      const data = await apiRequest(path)
      return {
        ok: true,
        total: Number(data?.total) || 0,
        stories: Array.isArray(data?.stories) ? data.stories.map(sanitizeStory).filter(Boolean) : [],
      }
    } catch (error) {
      return { ok: false, message: toErrorMessage(error, 'Novel publik belum tersedia.') }
    }
  }

  async function undoLastAction() {
    if (!undoState.value) {
      return { ok: false, message: 'Tidak ada aksi yang bisa di-undo.' }
    }

    const action = undoState.value
    undoState.value = null
    suppressUndo = true

    try {
      if (action.type === 'create') {
        return await deleteStory(action.storyId, { skipUndo: true })
      }

      if (action.type === 'update') {
        return await updateStory(action.storyId, action.before, { skipUndo: true })
      }

      if (action.type === 'delete') {
        return await addStory(action.story, { skipUndo: true })
      }

      if (action.type === 'words') {
        const delta = Math.abs((action.afterWords || 0) - (action.beforeWords || 0))
        if (!delta) {
          return { ok: true, message: 'Tidak ada perubahan kata untuk di-undo.' }
        }

        const reverseType = (action.afterWords || 0) > (action.beforeWords || 0) ? 'out' : 'in'
        return await adjustWordCount(action.storyId, reverseType, delta, 'Undo sesi kata.', { skipUndo: true })
      }

      return { ok: false, message: 'Aksi undo tidak dikenali.' }
    } finally {
      suppressUndo = false
    }
  }

  async function updatePreferences(payload) {
    preferences.value = sanitizePreferences({
      ...preferences.value,
      ...(payload && typeof payload === 'object' ? payload : {}),
    })

    persistPreferences()
    return { ok: true, message: 'Preferensi Scriptoria berhasil diperbarui.' }
  }

  function exportWorkspace() {
    const exportDocuments = {}
    stories.value.forEach((story) => {
      if (!documents.value[story.id]) return
      exportDocuments[story.id] = documents.value[story.id]
    })

    const payload = {
      version: SCHEMA_VERSION,
      exportedAt: nowIso(),
      preferences: preferences.value,
      stories: stories.value,
      activities: activities.value,
      documents: exportDocuments,
    }

    return JSON.stringify(payload, null, 2)
  }

  async function importWorkspace(rawPayload) {
    const parsed = typeof rawPayload === 'string' ? parseJson(rawPayload, null) : rawPayload
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, message: 'Format file backup tidak valid.' }
    }

    const rawStories = Array.isArray(parsed.stories) ? parsed.stories : parsed.items
    const rawActivities = Array.isArray(parsed.activities) ? parsed.activities : parsed.transactions
    const rawDocuments = parsed.documents && typeof parsed.documents === 'object' ? parsed.documents : {}

    const nextStories = Array.isArray(rawStories) ? rawStories.map(sanitizeStory).filter(Boolean) : []
    const nextActivities = Array.isArray(rawActivities) ? rawActivities.map(sanitizeActivity).filter(Boolean) : []

    if (!nextStories.length) {
      return { ok: false, message: 'Data cerita pada file import kosong atau tidak valid.' }
    }

    try {
      const data = await authedRequest('/api/scriptoria/import', {
        method: 'POST',
        body: {
          stories: nextStories.map(toBackendStory),
          activities: nextActivities.map(toBackendActivity),
        },
      })

      applySnapshot(data?.snapshot || data)

      if (parsed.preferences) {
        preferences.value = sanitizePreferences(parsed.preferences)
        persistPreferences()
      }

      const storyIdSet = new Set(stories.value.map((story) => story.id))
      const documentEntries = Object.entries(rawDocuments).filter(([storyId]) => storyIdSet.has(storyId))
      for (const [storyId, docPayload] of documentEntries) {
        const saveResult = await saveStoryDocument(storyId, docPayload)
        if (!saveResult.ok) {
          return { ok: false, message: saveResult.message }
        }
      }

      undoState.value = null
      isReady.value = true
      return { ok: true, message: 'Workspace Scriptoria berhasil di-import.' }
    } catch (error) {
      return { ok: false, message: toErrorMessage(error, 'Import workspace gagal.') }
    }
  }

  async function restoreAutoBackup() {
    const parsed = parseJson(localStorage.getItem(AUTO_BACKUP_KEY), null)
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, message: 'Auto-backup Scriptoria tidak ditemukan.' }
    }

    const result = await importWorkspace(parsed)
    if (!result.ok) return result

    return {
      ok: true,
      message: `Auto-backup dipulihkan${parsed.backedUpAt ? ` (${new Date(parsed.backedUpAt).toLocaleString('id-ID')})` : '.'}`,
    }
  }

  watch(
    [isReady, stories, activities, preferences, documents],
    ([ready, nextStories, nextActivities, nextPreferences, nextDocuments]) => {
      if (!ready) return
      localStorage.setItem(
        AUTO_BACKUP_KEY,
        JSON.stringify({
          version: SCHEMA_VERSION,
          backedUpAt: nowIso(),
          preferences: nextPreferences,
          stories: nextStories,
          activities: nextActivities,
          documents: nextDocuments,
        })
      )
    },
    { deep: true }
  )

  return {
    stories,
    activities,
    documents,
    preferences,
    isReady,
    isLoading,
    lastError,
    genres,
    totalWords,
    publishedCount,
    draftCount,
    reviewCount,
    archivedCount,
    needsAttentionStories,
    needsAttentionCount,
    todayActivityCount,
    canUndo,
    initialize,
    clearState,
    addStory,
    updateStory,
    deleteStory,
    adjustWordCount,
    fetchStoryDocument,
    saveStoryDocument,
    publishStory,
    fetchPublicStories,
    fetchPublicStory,
    undoLastAction,
    updatePreferences,
    exportWorkspace,
    importWorkspace,
    restoreAutoBackup,
  }
})
