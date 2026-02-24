<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useScriptoriaStore } from '../stores/scriptoria'
import { useReaderStore } from '../stores/reader'
import { API_BASE_URL } from '../utils/api'
import { renderMarkdown } from '../utils/markdown'
import {
    buildReadRoute,
    buildReadUrl,
    buildStorySlug,
    clampChapterNumber,
    countWords,
    estimateReadMinutes,
    extractStoryIdFromSlug,
    slugifyText,
} from '../utils/reader'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const scriptoria = useScriptoriaStore()
const reader = useReaderStore()

const isLoading = ref(true)
const error = ref('')
const story = ref(null)
const documentState = ref({ chapters: [], publishedAt: null })
const readingProgress = ref(0)
const mobileChapterPanelOpen = ref(false)
const toast = ref('')
const translationLanguage = ref('original')
const translationEngine = ref(String(import.meta.env.VITE_TRANSLATE_ENGINE || 'google').trim().toLowerCase() === 'gemini' ? 'gemini' : 'google')
const isTranslating = ref(false)
const translationError = ref('')
const translationCache = ref({})

let toastTimer = 0
let loadToken = 0
const TRANSLATE_API_URL = String(import.meta.env.VITE_TRANSLATE_API_URL || `${API_BASE_URL}/api/translate`).trim()
const TRANSLATE_API_KEY = String(import.meta.env.VITE_TRANSLATE_API_KEY || '').trim()

const translationEngineOptions = [
    { code: 'google', label: 'Translate (Cepat)' },
    { code: 'gemini', label: 'Gemini (Natural)' },
]

const translationOptions = [
    { code: 'en', label: 'English' },
    { code: 'es', label: 'Español' },
    { code: 'fr', label: 'Français' },
    { code: 'de', label: 'Deutsch' },
    { code: 'ja', label: '日本語' },
    { code: 'ko', label: '한국어' },
    { code: 'zh', label: '中文' },
    { code: 'ar', label: 'العربية' },
]

const chapters = computed(() => {
    const source = Array.isArray(documentState.value?.chapters) ? documentState.value.chapters : []
    return source.map((chapter, index) => {
        const title = String(chapter?.title || '').trim() || `Bab ${index + 1}`
        const content = String(chapter?.content || '').replace(/\r\n/g, '\n')
        const chapterWords = countWords(`${title}\n${content}`)

        return {
            id: String(chapter?.id || `chapter-${index + 1}`).trim(),
            number: index + 1,
            title,
            content,
            html: renderMarkdown(content),
            words: chapterWords,
            minutes: estimateReadMinutes(chapterWords),
        }
    })
})

const chapterCount = computed(() => chapters.value.length)

const totalWords = computed(() => {
    return chapters.value.reduce((total, chapter) => total + chapter.words, 0)
})

const totalMinutes = computed(() => estimateReadMinutes(totalWords.value))

const activeChapterNumber = computed(() => {
    return clampChapterNumber(route.params.chapter, chapterCount.value || 1)
})

const activeChapter = computed(() => {
    return chapters.value.find((chapter) => chapter.number === activeChapterNumber.value) || null
})

const translationModeActive = computed(() => translationLanguage.value !== 'original')

const activeTranslationKey = computed(() => {
    if (!translationModeActive.value || !story.value || !activeChapter.value) return ''
    return `${story.value.id}:${activeChapter.value.number}:${translationLanguage.value}:${translationEngine.value}`
})

const activeTranslatedEntry = computed(() => {
    const key = activeTranslationKey.value
    if (!key) return null
    return translationCache.value[key] || null
})

const chapterContentHtml = computed(() => {
    if (!activeChapter.value) return ''
    if (!translationModeActive.value) return activeChapter.value.html
    return activeTranslatedEntry.value?.html || activeChapter.value.html
})

const translationLanguageLabel = computed(() => {
    return translationOptions.find((entry) => entry.code === translationLanguage.value)?.label || translationLanguage.value
})

const translationEngineLabel = computed(() => {
    return translationEngineOptions.find((entry) => entry.code === translationEngine.value)?.label || translationEngine.value
})

const canonicalSlug = computed(() => {
    if (!story.value) return String(route.params.slug || '')
    return buildStorySlug(story.value)
})

const canGoPrev = computed(() => activeChapterNumber.value > 1)
const canGoNext = computed(() => activeChapterNumber.value < chapterCount.value)

const progressLabel = computed(() => `${Math.round(readingProgress.value)}%`)

const chapterTrailLabel = computed(() => {
    if (!chapterCount.value) return '-'
    return `${activeChapterNumber.value}/${chapterCount.value}`
})

const shareUrl = computed(() => {
    if (!story.value) return ''
    return buildReadUrl(story.value, activeChapterNumber.value)
})

const shareText = computed(() => {
    if (!story.value) return ''
    return `Baca \"${story.value.title}\" - ${activeChapter.value?.title || `Bab ${activeChapterNumber.value}`}`
})

const whatsappShareUrl = computed(() => {
    if (!shareUrl.value) return '#'
    const payload = `${shareText.value}\n${shareUrl.value}`
    return `https://wa.me/?text=${encodeURIComponent(payload)}`
})

const telegramShareUrl = computed(() => {
    if (!shareUrl.value) return '#'
    return `https://t.me/share/url?url=${encodeURIComponent(shareUrl.value)}&text=${encodeURIComponent(shareText.value)}`
})

const readerFontStyle = computed(() => ({
    fontSize: `${Math.round(reader.fontScale * 100)}%`,
}))

const isCurrentChapterBookmarked = computed(() => {
    if (!auth.isAuthenticated || !story.value) return false
    return reader.isBookmarked(story.value.id, activeChapterNumber.value)
})

const chapterBookmarkSet = computed(() => {
    if (!auth.isAuthenticated || !story.value) return new Set()
    return new Set(reader.getStoryBookmarks(story.value.id).map((entry) => entry.chapter))
})

const routeStoryLookupKey = computed(() => {
    const legacyId = String(route.params.id || '').trim()
    if (legacyId) return `id:${legacyId}`

    const slug = String(route.params.slug || '').trim()
    if (!slug) return ''

    const parsedId = extractStoryIdFromSlug(slug)
    if (slug.includes('--') && parsedId) return `id:${parsedId}`
    return `slug:${slug}`
})

function setToast(message, timeout = 1800) {
    toast.value = message
    clearTimeout(toastTimer)

    if (timeout > 0) {
        toastTimer = window.setTimeout(() => {
            if (toast.value === message) toast.value = ''
        }, timeout)
    }
}

function normalizeLineBreaks(text) {
    return String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function chunkTextForTranslation(text, maxChars = 1800) {
    const normalized = normalizeLineBreaks(text).trim()
    if (!normalized) return []
    if (normalized.length <= maxChars) return [normalized]

    const chunks = []
    let start = 0

    while (start < normalized.length) {
        let end = Math.min(start + maxChars, normalized.length)
        if (end < normalized.length) {
            const breakAt = normalized.lastIndexOf('\n', end)
            if (breakAt > start + 400) end = breakAt
        }

        const chunk = normalized.slice(start, end).trim()
        if (chunk) chunks.push(chunk)
        start = end
    }

    return chunks
}

async function translateChunk(chunk, targetLanguage) {
    const payload = {
        q: chunk,
        source: 'auto',
        target: targetLanguage,
        engine: translationEngine.value,
        format: 'text',
    }
    if (TRANSLATE_API_KEY) payload.api_key = TRANSLATE_API_KEY

    const response = await fetch(TRANSLATE_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    })

    if (!response.ok) {
        let message = `API terjemahan gagal (${response.status}).`
        try {
            const data = await response.json()
            const backendMessage = typeof data?.message === 'string' ? data.message.trim() : ''
            if (backendMessage) message = backendMessage
        } catch {
            // fallback pakai message default
        }
        throw new Error(message)
    }

    const data = await response.json()
    const translatedText = typeof data?.translatedText === 'string' ? data.translatedText : ''
    if (!translatedText) {
        throw new Error('Respons terjemahan kosong.')
    }

    return translatedText
}

async function translateActiveChapter(force = false) {
    if (!translationModeActive.value || !activeChapter.value) return

    if (!TRANSLATE_API_URL) {
        translationError.value = 'Set VITE_TRANSLATE_API_URL di .env untuk mengaktifkan mode terjemahan.'
        return
    }

    const key = activeTranslationKey.value
    if (!key) return
    if (!force && translationCache.value[key]) return

    isTranslating.value = true
    translationError.value = ''

    try {
        const chunks = chunkTextForTranslation(activeChapter.value.content)
        if (!chunks.length) {
            translationCache.value = {
                ...translationCache.value,
                [key]: {
                    text: '',
                    html: '',
                },
            }
            return
        }

        const translatedChunks = []
        for (const chunk of chunks) {
            const translated = await translateChunk(chunk, translationLanguage.value)
            translatedChunks.push(translated)
        }

        if (key !== activeTranslationKey.value) return

        const translatedText = translatedChunks.join('\n\n').trim()
        translationCache.value = {
            ...translationCache.value,
            [key]: {
                text: translatedText,
                html: renderMarkdown(translatedText),
            },
        }

        setToast(`Bab diterjemahkan (${translationEngineLabel.value}) ke ${translationLanguageLabel.value}.`, 1600)
    } catch (err) {
        translationError.value = err instanceof Error ? err.message : 'Gagal menerjemahkan bab.'
    } finally {
        isTranslating.value = false
    }
}

async function resolveStoryId() {
    const legacyId = String(route.params.id || '').trim()
    if (legacyId) return legacyId

    const slug = String(route.params.slug || '').trim()
    if (!slug) return ''

    const parsedId = extractStoryIdFromSlug(slug)
    if (slug.includes('--') && parsedId) return parsedId

    const fallbackQuery = slug.replace(/-/g, ' ')
    const listResult = await scriptoria.fetchPublicStories({ q: fallbackQuery, limit: 100 })

    if (listResult.ok) {
        const target = listResult.stories.find((entry) => slugifyText(entry.title) === slugifyText(slug))
        if (target?.id) return target.id
    }

    return parsedId
}

function updateReadingProgress() {
    if (typeof window === 'undefined') return

    const doc = document.documentElement
    const maxScrollable = Math.max(1, doc.scrollHeight - window.innerHeight)
    const next = (window.scrollY / maxScrollable) * 100

    readingProgress.value = Math.max(0, Math.min(100, next))
}

function scrollToTop() {
    if (typeof window === 'undefined') return
    window.scrollTo({ top: 0, behavior: 'smooth' })
}

async function ensureCanonicalRoute({ replace = true } = {}) {
    if (!story.value || !chapterCount.value) return

    const safeChapter = clampChapterNumber(route.params.chapter, chapterCount.value)
    const target = buildReadRoute(story.value, safeChapter)
    const currentPath = route.fullPath
    const nextPath = router.resolve(target).fullPath

    if (currentPath === nextPath) return

    if (replace) {
        await router.replace(target)
        return
    }

    await router.push(target)
}

async function loadStory() {
    isLoading.value = true
    error.value = ''
    mobileChapterPanelOpen.value = false

    const token = ++loadToken
    const storyId = await resolveStoryId()

    if (token !== loadToken) return

    if (!storyId) {
        error.value = 'URL cerita tidak valid.'
        isLoading.value = false
        return
    }

    const result = await scriptoria.fetchPublicStory(storyId)
    if (token !== loadToken) return

    if (!result.ok || !result.story) {
        error.value = result.message || 'Cerita tidak ditemukan.'
        isLoading.value = false
        return
    }

    story.value = result.story
    documentState.value = result.document || { chapters: [], publishedAt: null }

    if (!Array.isArray(documentState.value.chapters) || !documentState.value.chapters.length) {
        documentState.value = {
            ...documentState.value,
            chapters: [{ id: crypto.randomUUID(), title: 'Bab 1', content: '' }],
        }
    }

    isLoading.value = false

    await ensureCanonicalRoute({ replace: true })
    scrollToTop()
    updateReadingProgress()
}

async function goToChapter(chapterNumber) {
    if (!story.value || !chapterCount.value) return

    const safeChapter = clampChapterNumber(chapterNumber, chapterCount.value)
    const target = buildReadRoute(story.value, safeChapter)
    const nextPath = router.resolve(target).fullPath

    mobileChapterPanelOpen.value = false

    if (route.fullPath === nextPath) {
        scrollToTop()
        updateReadingProgress()
        return
    }

    await router.push(target)
}

function goToPreviousChapter() {
    if (!canGoPrev.value) return
    void goToChapter(activeChapterNumber.value - 1)
}

function goToNextChapter() {
    if (!canGoNext.value) return
    void goToChapter(activeChapterNumber.value + 1)
}

async function toggleBookmark() {
    if (!story.value || !activeChapter.value) return

    const isLoggedIn = auth.isAuthenticated || (await auth.ensureSessionValid())
    if (!isLoggedIn) {
        setToast('Login dulu untuk menyimpan bookmark.', 2200)
        await router.push({
            name: 'login',
            query: {
                redirect: route.fullPath,
            },
        })
        return
    }

    const result = reader.toggleBookmark({
        storyId: story.value.id,
        storyTitle: story.value.title,
        chapter: activeChapterNumber.value,
        chapterTitle: activeChapter.value.title,
        slug: canonicalSlug.value,
    })

    if (!result.ok) {
        setToast('Bookmark gagal disimpan.', 2200)
        return
    }

    setToast(result.bookmarked ? 'Bab disimpan ke bookmark.' : 'Bookmark bab dihapus.')
}

async function copyShareLink() {
    if (!shareUrl.value) return

    try {
        await navigator.clipboard.writeText(shareUrl.value)
        setToast('Link bab berhasil disalin.')
    } catch {
        setToast('Gagal menyalin link.', 2200)
    }
}

function toggleTheme() {
    reader.toggleTheme()
}

watch(
    () => routeStoryLookupKey.value,
    () => {
        void loadStory()
    },
    { immediate: true }
)

watch(
    () => route.params.chapter,
    (next, prev) => {
        if (next === prev) return

        mobileChapterPanelOpen.value = false
        scrollToTop()
        if (typeof window !== 'undefined') {
            window.requestAnimationFrame(() => {
                updateReadingProgress()
            })
        }
    }
)

watch(
    [() => activeChapter.value?.id, translationLanguage, translationEngine],
    () => {
        translationError.value = ''
        if (!translationModeActive.value) return
        void translateActiveChapter()
    }
)

watch(
    () => [route.params.slug, route.params.chapter, route.params.id, story.value?.id, chapterCount.value],
    () => {
        if (isLoading.value || !story.value || !chapterCount.value) return
        void ensureCanonicalRoute({ replace: true })
    }
)

onMounted(() => {
    reader.applyTheme(reader.theme)
    window.addEventListener('scroll', updateReadingProgress, { passive: true })
    updateReadingProgress()
})

onBeforeUnmount(() => {
    clearTimeout(toastTimer)
    window.removeEventListener('scroll', updateReadingProgress)
})
</script>

<template>
    <div class="min-h-screen page-bg p-4 md:p-8">
        <section class="mx-auto max-w-6xl space-y-4">
            <div class="sticky top-0 z-40">
                <div class="h-1 w-full overflow-hidden rounded-full bg-base-300/80">
                    <div class="h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
                        :style="{ width: `${readingProgress}%` }"></div>
                </div>
            </div>

            <header class="reveal-up flex flex-wrap items-center justify-between gap-2">
                <div>
                    <p class="text-xs uppercase tracking-[0.2em] opacity-60">Scriptoria Read</p>
                    <h1 class="text-2xl font-bold md:text-4xl">{{ story?.title || 'Membaca cerita...' }}</h1>
                    <p class="text-sm opacity-75" v-if="story">
                        {{ story.genre }} • {{ totalWords }} kata • ±{{ totalMinutes }} menit
                    </p>
                </div>

                <div class="flex flex-wrap gap-2">
                    <button class="btn btn-outline btn-sm" @click="reader.decreaseFont"
                        :disabled="!reader.canDecreaseFont">
                        A-
                    </button>
                    <div class="badge badge-outline badge-primary min-w-[72px]">{{ reader.fontScaleLabel }}</div>
                    <button class="btn btn-outline btn-sm" @click="reader.increaseFont"
                        :disabled="!reader.canIncreaseFont">
                        A+
                    </button>
                    <button class="btn btn-ghost btn-sm" @click="toggleTheme">
                        <i :class="reader.theme === 'scriptorianight' ? 'bi bi-sun-fill' : 'bi bi-moon-stars-fill'"></i>
                        {{ reader.theme === 'scriptorianight' ? 'Light' : 'Dark' }}
                    </button>
                    <button class="btn btn-ghost btn-sm" @click="router.push({ name: 'landing' })">
                        <i class="bi bi-house"></i>
                        Home
                    </button>
                </div>
            </header>

            <div v-if="toast" class="alert alert-success py-2 text-sm">
                <span>{{ toast }}</span>
            </div>

            <div v-if="error" class="alert alert-error">
                <span>{{ error }}</span>
            </div>

            <section v-if="!isLoading && story" class="grid gap-4 lg:grid-cols-[320px_1fr]">
                <div class="lg:hidden">
                    <button class="btn btn-outline w-full justify-between"
                        @click="mobileChapterPanelOpen = !mobileChapterPanelOpen">
                        <span><i class="bi bi-list-ul mr-2"></i> Daftar Bab</span>
                        <span class="badge badge-primary">{{ chapterTrailLabel }}</span>
                    </button>

                    <transition name="fade-slide">
                        <aside v-if="mobileChapterPanelOpen"
                            class="mt-2 rounded-2xl border border-base-300 bg-base-100 p-3 shadow-sm">
                            <div class="space-y-2 max-h-[44vh] overflow-y-auto pr-1">
                                <button v-for="chapter in chapters" :key="chapter.id" type="button"
                                    class="w-full rounded-xl border px-3 py-2 text-left text-sm transition" :class="chapter.number === activeChapterNumber
                                            ? 'border-primary bg-primary/12'
                                            : 'border-base-300 bg-base-100 hover:bg-base-200/70'
                                        " @click="goToChapter(chapter.number)">
                                    <div class="flex items-center justify-between gap-2">
                                        <p class="truncate font-semibold">Bab {{ chapter.number }} · {{ chapter.title }}
                                        </p>
                                        <i v-if="auth.isAuthenticated && chapterBookmarkSet.has(chapter.number)"
                                            class="bi bi-bookmark-fill text-accent"></i>
                                    </div>
                                    <p class="text-xs opacity-70">{{ chapter.words }} kata • ±{{ chapter.minutes }}
                                        menit</p>
                                </button>
                            </div>
                        </aside>
                    </transition>
                </div>

                <aside class="hidden lg:block lg:sticky lg:top-16 lg:self-start">
                    <div class="card border border-base-300 bg-base-100 shadow-sm">
                        <div class="card-body gap-3">
                            <h2 class="card-title text-base">
                                <i class="bi bi-list-ul text-primary"></i>
                                Daftar Bab
                            </h2>

                            <div class="space-y-2 max-h-[64vh] overflow-y-auto pr-1">
                                <button v-for="chapter in chapters" :key="chapter.id" type="button"
                                    class="w-full rounded-xl border px-3 py-2 text-left text-sm transition" :class="chapter.number === activeChapterNumber
                                            ? 'border-primary bg-primary/12'
                                            : 'border-base-300 bg-base-100 hover:bg-base-200/70'
                                        " @click="goToChapter(chapter.number)">
                                    <div class="flex items-center justify-between gap-2">
                                        <p class="truncate font-semibold">Bab {{ chapter.number }} · {{ chapter.title }}
                                        </p>
                                        <i v-if="auth.isAuthenticated && chapterBookmarkSet.has(chapter.number)"
                                            class="bi bi-bookmark-fill text-accent"></i>
                                    </div>
                                    <p class="text-xs opacity-70">{{ chapter.words }} kata • ±{{ chapter.minutes }}
                                        menit</p>
                                </button>
                            </div>

                            <div class="rounded-xl border border-base-300 bg-base-200/65 p-3 text-xs">
                                <p>Progress scroll: <strong>{{ progressLabel }}</strong></p>
                                <p>Posisi bab: <strong>{{ chapterTrailLabel }}</strong></p>
                            </div>
                        </div>
                    </div>
                </aside>

                <article class="card border border-base-300 bg-base-100 shadow-sm">
                    <div class="card-body gap-4">
                        <div class="flex flex-wrap items-center justify-between gap-2">
                            <div>
                                <p class="text-xs uppercase tracking-[0.16em] opacity-60">Bab Aktif</p>
                                <h2 class="text-xl font-semibold md:text-2xl">
                                    {{ activeChapter?.title || `Bab ${activeChapterNumber}` }}
                                </h2>
                                <p class="text-xs opacity-70" v-if="activeChapter">
                                    Bab {{ activeChapter.number }} • {{ activeChapter.words }} kata • ±{{
                                    activeChapter.minutes }} menit baca
                                </p>
                            </div>

                            <div class="flex flex-wrap gap-2">
                                <select v-model="translationEngine" class="select select-bordered select-sm">
                                    <option v-for="option in translationEngineOptions" :key="option.code"
                                        :value="option.code">
                                        {{ option.label }}
                                    </option>
                                </select>
                                <select v-model="translationLanguage" class="select select-bordered select-sm">
                                    <option value="original">Bahasa Asli</option>
                                    <option v-for="option in translationOptions" :key="option.code" :value="option.code">
                                        {{ option.label }}
                                    </option>
                                </select>
                                <button
                                    class="btn btn-outline btn-sm"
                                    :disabled="!translationModeActive || isTranslating"
                                    @click="translateActiveChapter(true)"
                                >
                                    <span v-if="isTranslating" class="loading loading-spinner loading-xs"></span>
                                    {{ translationModeActive ? (activeTranslatedEntry ? 'Terjemahkan Ulang' : 'Terjemahkan') : 'Pilih Bahasa' }}
                                </button>
                                <button class="btn btn-outline btn-sm"
                                    :class="isCurrentChapterBookmarked ? 'btn-accent' : ''" @click="toggleBookmark">
                                    <i :class="auth.isAuthenticated
                                            ? isCurrentChapterBookmarked
                                                ? 'bi bi-bookmark-fill'
                                                : 'bi bi-bookmark'
                                            : 'bi bi-person-lock'
                                        "></i>
                                    {{
                                        auth.isAuthenticated
                                            ? isCurrentChapterBookmarked
                                                ? 'Tersimpan'
                                                : 'Bookmark'
                                    : 'Login untuk Bookmark'
                                    }}
                                </button>
                                <a class="btn btn-outline btn-sm" :href="whatsappShareUrl" target="_blank"
                                    rel="noopener noreferrer">
                                    <i class="bi bi-whatsapp"></i>
                                    WhatsApp
                                </a>
                                <a class="btn btn-outline btn-sm" :href="telegramShareUrl" target="_blank"
                                    rel="noopener noreferrer">
                                    <i class="bi bi-telegram"></i>
                                    Telegram
                                </a>
                                <button class="btn btn-outline btn-sm" @click="copyShareLink">
                                    <i class="bi bi-link-45deg"></i>
                                    Copy Link
                                </button>
                            </div>
                        </div>

                        <div v-if="translationModeActive" class="alert alert-info py-2 text-xs">
                            <span v-if="activeTranslatedEntry">Mode terjemahan aktif: {{ translationLanguageLabel }} ({{ translationEngineLabel }}).</span>
                            <span v-else-if="isTranslating">Menerjemahkan bab ke {{ translationLanguageLabel }}...</span>
                            <span v-else>Terjemahan belum tersedia untuk bab ini.</span>
                        </div>

                        <div v-if="translationError" class="alert alert-error py-2 text-xs">
                            <span>{{ translationError }}</span>
                        </div>

                        <!-- <p class="text-sm leading-relaxed opacity-80" v-if="story.summary">{{ story.summary }}</p> -->

                        <section class="reader-content space-y-4" :style="readerFontStyle">
                            <article v-if="chapterContentHtml" class="reader-markdown" v-html="chapterContentHtml">
                            </article>
                            <p v-else class="leading-8 text-base-content/90 opacity-70">Bab ini masih kosong.</p>
                        </section>

                        <div class="flex flex-wrap items-center justify-between gap-2 border-t border-base-300 pt-4">
                            <button class="btn btn-outline" :disabled="!canGoPrev" @click="goToPreviousChapter">
                                <i class="bi bi-arrow-left"></i>
                                Bab Sebelumnya
                            </button>

                            <div class="text-xs opacity-70">
                                URL bab unik: <code>/novel/{{ canonicalSlug }}/{{ activeChapterNumber }}</code>
                            </div>

                            <button class="btn btn-primary" :disabled="!canGoNext" @click="goToNextChapter">
                                Bab Berikutnya
                                <i class="bi bi-arrow-right"></i>
                            </button>
                        </div>
                    </div>
                </article>
            </section>

            <section v-else-if="isLoading" class="card border border-base-300 bg-base-100 shadow-sm">
                <div class="card-body">
                    <div class="flex items-center gap-2 text-sm opacity-70">
                        <span class="loading loading-spinner loading-sm"></span>
                        Memuat cerita publik...
                    </div>
                </div>
            </section>
        </section>
    </div>
</template>

<style scoped>
.reader-markdown {
    line-height: 1.9;
}

.reader-markdown :deep(h1),
.reader-markdown :deep(h2),
.reader-markdown :deep(h3),
.reader-markdown :deep(h4) {
    margin: 1.1rem 0 0.65rem;
    font-weight: 700;
}

.reader-markdown :deep(p) {
    margin: 0.7rem 0;
}

.reader-markdown :deep(hr) {
    margin: 1.2rem 0;
    border: 0;
    border-top: 1px solid color-mix(in srgb, hsl(var(--bc)) 22%, transparent);
}

.reader-markdown :deep(ul),
.reader-markdown :deep(ol) {
    margin: 0.7rem 0;
    padding-left: 1.3rem;
}

.reader-markdown :deep(a) {
    color: hsl(var(--p));
    text-decoration: underline;
}

.reader-markdown :deep(blockquote) {
    margin: 0.9rem 0;
    border-left: 3px solid color-mix(in srgb, hsl(var(--p)) 40%, transparent);
    padding-left: 0.85rem;
    opacity: 0.9;
}
</style>
