import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from './auth'

const READER_PREFS_KEY = 'scriptoria-reader-prefs-v1'
const READER_BOOKMARKS_KEY = 'scriptoria-reader-bookmarks-v1'
const READER_NOVEL_BOOKMARKS_KEY = 'scriptoria-reader-novel-bookmarks-v1'
const READER_BOOKMARKS_KEY_PREFIX = 'scriptoria-reader-bookmarks-v2::'
const READER_NOVEL_BOOKMARKS_KEY_PREFIX = 'scriptoria-reader-novel-bookmarks-v2::'
const THEME_STORAGE_KEY = 'scriptoria-theme-v1'
const FONT_SCALE_STEPS = [0.95, 1, 1.05, 1.1, 1.15, 1.2, 1.25]
const DEFAULT_THEME = 'scriptorialight'
const DEFAULT_FONT_SCALE = 1

function readStorage(key, fallback) {
  if (typeof window === 'undefined') return fallback

  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function writeStorage(key, value) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, JSON.stringify(value))
}

function sanitizeTheme(raw) {
  return raw === 'scriptorianight' ? 'scriptorianight' : DEFAULT_THEME
}

function sanitizeFontScale(raw) {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return DEFAULT_FONT_SCALE

  const nearest = FONT_SCALE_STEPS.reduce((best, current) => {
    if (Math.abs(current - parsed) < Math.abs(best - parsed)) return current
    return best
  }, DEFAULT_FONT_SCALE)

  return nearest
}

function sanitizePreferences(raw) {
  const source = raw && typeof raw === 'object' ? raw : {}

  return {
    fontScale: sanitizeFontScale(source.fontScale),
    theme: sanitizeTheme(source.theme),
  }
}

function sanitizeBookmark(raw) {
  if (!raw || typeof raw !== 'object') return null

  const storyId = String(raw.storyId || '').trim()
  const chapter = Math.max(1, Number.parseInt(String(raw.chapter || ''), 10) || 1)
  if (!storyId) return null

  return {
    storyId,
    chapter,
    storyTitle: String(raw.storyTitle || '').trim(),
    chapterTitle: String(raw.chapterTitle || '').trim(),
    slug: String(raw.slug || '').trim(),
    savedAt: String(raw.savedAt || new Date().toISOString()),
  }
}

function sanitizeBookmarks(raw) {
  if (!raw || typeof raw !== 'object') return {}

  const sanitized = {}
  Object.entries(raw).forEach(([key, value]) => {
    const next = sanitizeBookmark(value)
    if (!next) return
    sanitized[key] = next
  })

  return sanitized
}

function sanitizeNovelBookmark(raw) {
  if (!raw || typeof raw !== 'object') return null

  const storyId = String(raw.storyId || '').trim()
  if (!storyId) return null

  return {
    storyId,
    storyTitle: String(raw.storyTitle || '').trim(),
    slug: String(raw.slug || '').trim(),
    savedAt: String(raw.savedAt || new Date().toISOString()),
  }
}

function sanitizeNovelBookmarks(raw) {
  if (!raw || typeof raw !== 'object') return {}

  const sanitized = {}
  Object.entries(raw).forEach(([key, value]) => {
    const next = sanitizeNovelBookmark(value)
    if (!next) return
    sanitized[key] = next
  })

  return sanitized
}

function buildBookmarkKey(storyId, chapter) {
  const cleanStoryId = String(storyId || '').trim()
  const cleanChapter = Math.max(1, Number.parseInt(String(chapter || ''), 10) || 1)
  return cleanStoryId ? `${cleanStoryId}::${cleanChapter}` : ''
}

function sanitizeScope(raw) {
  const clean = String(raw || '').trim().toLowerCase()
  return clean || 'guest'
}

function scopedStorageKey(prefix, scope) {
  return `${prefix}${sanitizeScope(scope)}`
}

export const useReaderStore = defineStore('reader', () => {
  const auth = useAuthStore()
  const storedTheme = typeof window !== 'undefined' ? window.localStorage.getItem(THEME_STORAGE_KEY) : DEFAULT_THEME
  const preferences = ref(
    sanitizePreferences({
      ...readStorage(READER_PREFS_KEY, {}),
      theme: storedTheme,
    })
  )
  const bookmarkScope = computed(() => {
    const userId = Number(auth.currentUser?.id) || 0
    return userId > 0 ? `user:${userId}` : 'guest'
  })
  const bookmarks = ref({})
  const novelBookmarks = ref({})

  function loadScopedBookmarks(scope) {
    const key = scopedStorageKey(READER_BOOKMARKS_KEY_PREFIX, scope)
    const scopedRaw = readStorage(key, null)
    if (scopedRaw && typeof scopedRaw === 'object') {
      return sanitizeBookmarks(scopedRaw)
    }

    if (scope === 'guest') {
      return sanitizeBookmarks(readStorage(READER_BOOKMARKS_KEY, {}))
    }

    return {}
  }

  function loadScopedNovelBookmarks(scope) {
    const key = scopedStorageKey(READER_NOVEL_BOOKMARKS_KEY_PREFIX, scope)
    const scopedRaw = readStorage(key, null)
    if (scopedRaw && typeof scopedRaw === 'object') {
      return sanitizeNovelBookmarks(scopedRaw)
    }

    if (scope === 'guest') {
      return sanitizeNovelBookmarks(readStorage(READER_NOVEL_BOOKMARKS_KEY, {}))
    }

    return {}
  }

  const fontScale = computed(() => preferences.value.fontScale)
  const theme = computed(() => preferences.value.theme)
  const fontScaleLabel = computed(() => `${Math.round(fontScale.value * 100)}%`)
  const fontScaleIndex = computed(() => FONT_SCALE_STEPS.findIndex((step) => step === fontScale.value))
  const canDecreaseFont = computed(() => fontScaleIndex.value > 0)
  const canIncreaseFont = computed(() => fontScaleIndex.value >= 0 && fontScaleIndex.value < FONT_SCALE_STEPS.length - 1)

  function applyTheme(nextTheme) {
    const safeTheme = sanitizeTheme(nextTheme)
    preferences.value = {
      ...preferences.value,
      theme: safeTheme,
    }

    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', safeTheme)
    }
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(THEME_STORAGE_KEY, safeTheme)
    }
  }

  function toggleTheme() {
    applyTheme(preferences.value.theme === 'scriptorianight' ? 'scriptorialight' : 'scriptorianight')
  }

  function setFontScale(nextScale) {
    preferences.value = {
      ...preferences.value,
      fontScale: sanitizeFontScale(nextScale),
    }
  }

  function increaseFont() {
    if (!canIncreaseFont.value) return
    setFontScale(FONT_SCALE_STEPS[fontScaleIndex.value + 1])
  }

  function decreaseFont() {
    if (!canDecreaseFont.value) return
    setFontScale(FONT_SCALE_STEPS[fontScaleIndex.value - 1])
  }

  function isBookmarked(storyId, chapter) {
    const key = buildBookmarkKey(storyId, chapter)
    if (!key) return false
    return Boolean(bookmarks.value[key])
  }

  function toggleBookmark(payload) {
    const clean = sanitizeBookmark(payload)
    if (!clean) return { ok: false, bookmarked: false }

    const key = buildBookmarkKey(clean.storyId, clean.chapter)
    if (!key) return { ok: false, bookmarked: false }

    if (bookmarks.value[key]) {
      const { [key]: _, ...next } = bookmarks.value
      bookmarks.value = next
      return { ok: true, bookmarked: false }
    }

    bookmarks.value = {
      ...bookmarks.value,
      [key]: {
        ...clean,
        savedAt: new Date().toISOString(),
      },
    }
    return { ok: true, bookmarked: true }
  }

  function getStoryBookmarks(storyId) {
    const cleanStoryId = String(storyId || '').trim()
    if (!cleanStoryId) return []

    return Object.values(bookmarks.value)
      .filter((entry) => entry.storyId === cleanStoryId)
      .sort((a, b) => a.chapter - b.chapter)
  }

  function isNovelBookmarked(storyId) {
    const cleanStoryId = String(storyId || '').trim()
    if (!cleanStoryId) return false
    return Boolean(novelBookmarks.value[cleanStoryId])
  }

  function toggleNovelBookmark(payload) {
    const clean = sanitizeNovelBookmark(payload)
    if (!clean?.storyId) return { ok: false, bookmarked: false }

    if (novelBookmarks.value[clean.storyId]) {
      const { [clean.storyId]: _, ...next } = novelBookmarks.value
      novelBookmarks.value = next
      return { ok: true, bookmarked: false }
    }

    novelBookmarks.value = {
      ...novelBookmarks.value,
      [clean.storyId]: {
        ...clean,
        savedAt: new Date().toISOString(),
      },
    }
    return { ok: true, bookmarked: true }
  }

  function getNovelBookmarks() {
    return Object.values(novelBookmarks.value).sort((a, b) => {
      return new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
    })
  }

  watch(
    preferences,
    (next) => {
      writeStorage(READER_PREFS_KEY, next)
    },
    { deep: true }
  )

  watch(
    bookmarks,
    (next) => {
      writeStorage(scopedStorageKey(READER_BOOKMARKS_KEY_PREFIX, bookmarkScope.value), next)
      if (bookmarkScope.value === 'guest') {
        writeStorage(READER_BOOKMARKS_KEY, next)
      }
    },
    { deep: true }
  )

  watch(
    novelBookmarks,
    (next) => {
      writeStorage(scopedStorageKey(READER_NOVEL_BOOKMARKS_KEY_PREFIX, bookmarkScope.value), next)
      if (bookmarkScope.value === 'guest') {
        writeStorage(READER_NOVEL_BOOKMARKS_KEY, next)
      }
    },
    { deep: true }
  )

  watch(
    bookmarkScope,
    (scope) => {
      bookmarks.value = loadScopedBookmarks(scope)
      novelBookmarks.value = loadScopedNovelBookmarks(scope)
    },
    { immediate: true }
  )

  return {
    preferences,
    bookmarks,
    novelBookmarks,
    fontScale,
    theme,
    fontScaleLabel,
    canDecreaseFont,
    canIncreaseFont,
    applyTheme,
    toggleTheme,
    setFontScale,
    increaseFont,
    decreaseFont,
    isBookmarked,
    toggleBookmark,
    getStoryBookmarks,
    isNovelBookmarked,
    toggleNovelBookmark,
    getNovelBookmarks,
  }
})
