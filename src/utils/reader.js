const FALLBACK_STORY_SLUG = 'novel'
const READER_WORDS_PER_MINUTE = 200

function toSafeInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value || ''), 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function slugifyText(value, fallback = FALLBACK_STORY_SLUG) {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || fallback
}

export function buildStorySlug(story) {
  const title = typeof story === 'string' ? story : story?.title
  const id = typeof story === 'object' ? story?.id : ''
  const base = slugifyText(title)
  const cleanId = String(id || '').trim()

  if (!cleanId) return base
  return `${base}--${cleanId}`
}

export function extractStoryIdFromSlug(slug) {
  const clean = String(slug || '').trim()
  if (!clean) return ''

  const markerIndex = clean.lastIndexOf('--')
  if (markerIndex === -1) return clean

  const afterMarker = clean.slice(markerIndex + 2).trim()
  return afterMarker || clean
}

export function clampChapterNumber(value, chapterCount) {
  const safeChapterCount = Math.max(1, toSafeInt(chapterCount, 1))
  const parsed = toSafeInt(value, 1)
  return Math.min(safeChapterCount, Math.max(1, parsed))
}

export function buildReadRoute(story, chapter = 1) {
  const safeChapter = Math.max(1, toSafeInt(chapter, 1))
  return {
    name: 'read-story',
    params: {
      slug: buildStorySlug(story),
      chapter: String(safeChapter),
    },
  }
}

export function buildDetailRoute(story) {
  return {
    name: 'novel-detail',
    params: {
      slug: buildStorySlug(story),
    },
  }
}

export function buildReadUrl(story, chapter = 1) {
  if (typeof window === 'undefined') return ''
  const slug = encodeURIComponent(buildStorySlug(story))
  const safeChapter = Math.max(1, toSafeInt(chapter, 1))
  return `${window.location.origin}/novel/${slug}/${safeChapter}`
}

export function countWords(text) {
  const clean = String(text || '').trim()
  if (!clean) return 0
  return clean.split(/\s+/).filter(Boolean).length
}

export function estimateReadMinutes(wordCount, wordsPerMinute = READER_WORDS_PER_MINUTE) {
  const safeWords = Math.max(0, Number(wordCount) || 0)
  const safeWpm = Math.max(1, Number(wordsPerMinute) || READER_WORDS_PER_MINUTE)
  if (!safeWords) return 1
  return Math.max(1, Math.ceil(safeWords / safeWpm))
}
