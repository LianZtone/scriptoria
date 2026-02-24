<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import defaultCover from '../assets/cover.jpeg'
import TopNavbar from '../components/scriptoria/TopNavbar.vue'
import { useAuthStore } from '../stores/auth'
import { useReaderStore } from '../stores/reader'
import { useScriptoriaStore } from '../stores/scriptoria'
import {
    buildDetailRoute,
    buildReadRoute,
    buildStorySlug,
    countWords,
    estimateReadMinutes,
    extractStoryIdFromSlug,
    slugifyText,
} from '../utils/reader'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const reader = useReaderStore()
const scriptoria = useScriptoriaStore()

const isLoading = ref(true)
const error = ref('')
const toast = ref('')
const story = ref(null)
const documentState = ref({ chapters: [], publishedAt: null })
const isScrolled = ref(false)
const theme = ref('scriptorialight')
const THEME_STORAGE_KEY = 'scriptoria-theme-v1'

let toastTimer = 0
let loadToken = 0

const chapters = computed(() => {
    const source = Array.isArray(documentState.value?.chapters) ? documentState.value.chapters : []
    return source.map((chapter, index) => {
        const title = String(chapter?.title || '').trim() || `Bab ${index + 1}`
        const content = String(chapter?.content || '').replace(/\r\n/g, '\n')
        const words = countWords(`${title}\n${content}`)

        return {
            id: String(chapter?.id || `chapter-${index + 1}`).trim(),
            number: index + 1,
            title,
            words,
            minutes: estimateReadMinutes(words),
        }
    })
})

const chapterCount = computed(() => chapters.value.length)
const totalWords = computed(() => chapters.value.reduce((total, chapter) => total + chapter.words, 0))
const totalMinutes = computed(() => estimateReadMinutes(totalWords.value))

const latestChapterBookmark = computed(() => {
    if (!auth.isAuthenticated || !story.value) return null
    const entries = reader.getStoryBookmarks(story.value.id)
    if (!entries.length) return null

    return entries
        .slice()
        .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime())[0]
})

const continueChapterNumber = computed(() => {
    const bookmarked = Number(latestChapterBookmark.value?.chapter || 0)
    if (bookmarked >= 1 && bookmarked <= chapterCount.value) return bookmarked
    return 1
})

const continueReadLabel = computed(() => {
    if (!chapterCount.value) return 'Lanjutkan Baca'
    return continueChapterNumber.value > 1 ? `Lanjutkan Bab ${continueChapterNumber.value}` : 'Lanjutkan Baca'
})

const continueReadRoute = computed(() => {
    if (!story.value) return { name: 'landing' }
    return buildReadRoute(story.value, continueChapterNumber.value)
})

const startReadRoute = computed(() => {
    if (!story.value) return { name: 'landing' }
    return buildReadRoute(story.value, 1)
})

const isNovelBookmarked = computed(() => {
    if (!auth.isAuthenticated || !story.value) return false
    return reader.isNovelBookmarked(story.value.id)
})

function getStoryCover(currentStory) {
    const uploaded = String(currentStory?.coverImage || '').trim()
    return uploaded || defaultCover
}

function handleCoverError(event) {
    const img = event?.target
    if (!img || img.dataset.fallbackApplied === '1') return
    img.dataset.fallbackApplied = '1'
    img.src = defaultCover
}

function setToast(message, timeout = 1800) {
    toast.value = message
    clearTimeout(toastTimer)
    if (timeout > 0) {
        toastTimer = window.setTimeout(() => {
            if (toast.value === message) toast.value = ''
        }, timeout)
    }
}

function handleScroll() {
    if (typeof window === 'undefined') return
    isScrolled.value = window.scrollY > 10
}

function toggleTheme() {
    theme.value = theme.value === 'scriptorialight' ? 'scriptorianight' : 'scriptorialight'
}

async function resolveStoryId() {
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

async function ensureCanonicalRoute() {
    if (!story.value) return
    const target = buildDetailRoute(story.value)
    const nextPath = router.resolve(target).fullPath
    if (route.fullPath === nextPath) return
    await router.replace(target)
}

async function loadStory() {
    isLoading.value = true
    error.value = ''

    const token = ++loadToken
    const storyId = await resolveStoryId()
    if (token !== loadToken) return

    if (!storyId) {
        error.value = 'URL novel tidak valid.'
        isLoading.value = false
        return
    }

    const result = await scriptoria.fetchPublicStory(storyId)
    if (token !== loadToken) return

    if (!result.ok || !result.story) {
        error.value = result.message || 'Novel tidak ditemukan.'
        isLoading.value = false
        return
    }

    story.value = result.story
    documentState.value = result.document || { chapters: [], publishedAt: null }
    isLoading.value = false

    await ensureCanonicalRoute()
}

async function toggleNovelBookmark() {
    if (!story.value) return

    const isLoggedIn = auth.isAuthenticated || (await auth.ensureSessionValid())
    if (!isLoggedIn) {
        setToast('Login dulu untuk bookmark novel.', 2200)
        await router.push({
            name: 'login',
            query: { redirect: route.fullPath },
        })
        return
    }

    const result = reader.toggleNovelBookmark({
        storyId: story.value.id,
        storyTitle: story.value.title,
        slug: buildStorySlug(story.value),
    })

    if (!result.ok) {
        setToast('Bookmark novel gagal disimpan.', 2200)
        return
    }

    setToast(result.bookmarked ? 'Novel disimpan ke bookmark.' : 'Bookmark novel dihapus.')
}

watch(
    () => route.params.slug,
    () => {
        void loadStory()
    },
    { immediate: true }
)

watch(theme, (value) => {
    if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-theme', value)
    }
    if (typeof window !== 'undefined') {
        window.localStorage.setItem(THEME_STORAGE_KEY, value)
    }
})

onMounted(() => {
    if (typeof window !== 'undefined') {
        const saved = window.localStorage.getItem(THEME_STORAGE_KEY)
        if (saved === 'scriptorialight' || saved === 'scriptorianight') {
            theme.value = saved
        }
        window.addEventListener('scroll', handleScroll, { passive: true })
        handleScroll()
    }
})

onBeforeUnmount(() => {
    clearTimeout(toastTimer)
    if (typeof window !== 'undefined') {
        window.removeEventListener('scroll', handleScroll)
    }
})
</script>

<template>
    <div class="min-h-screen page-bg p-4 md:p-8">
        <section class="mx-auto max-w-6xl space-y-4">
            <TopNavbar :scrolled="isScrolled" :theme="theme" :show-theme-toggle="true" :show-public-shortcut="true"
                @toggle-theme="toggleTheme" />

            <div class="flex items-center">
                <button class="inline-flex items-center gap-1 text-sm opacity-75 transition hover:opacity-100"
                    @click="router.push({ name: 'landing', hash: '#novel-publik' })">
                    <i class="bi bi-arrow-left"></i>
                    Kembali
                </button>
            </div>

            <div v-if="toast" class="alert alert-success py-2 text-sm">
                <span>{{ toast }}</span>
            </div>

            <div v-if="error" class="alert alert-error">
                <span>{{ error }}</span>
            </div>

            <section v-if="!isLoading && story" class="grid gap-4 lg:grid-cols-[330px_1fr]">
                <aside class="card border border-base-300 bg-base-100 shadow-sm">
                    <div class="card-body">
                        <div class="relative overflow-hidden rounded-xl bg-base-200 p-2">
                            <img :src="getStoryCover(story)" :alt="`Cover ${story.title}`"
                                class="mx-auto h-auto max-h-[72vh] w-auto max-w-full object-contain object-center"
                                loading="lazy" decoding="async" @error="handleCoverError" />
                        </div>
                    </div>
                </aside>

                <article class="card border border-base-300 bg-base-100 shadow-sm">
                    <div class="card-body gap-4">
                        <div>
                            <p class="text-xs uppercase tracking-[0.18em] opacity-60">Detail Novel</p>
                            <h1 class="text-2xl font-bold md:text-4xl">{{ story.title }}</h1>
                            <p class="mt-1 text-sm opacity-75 line-clamp-1">{{ story.genre }}</p>
                            <p class="mt-1 text-sm opacity-80">
                                <i class="bi bi-feather mr-1"></i>
                                Penulis: <span class="font-medium">{{ story.authorName || 'Scriptoria Author' }}</span>
                            </p>
                        </div>

                        <div class="grid gap-2 text-sm sm:grid-cols-3">
                            <div class="rounded-xl border border-base-300 bg-base-200/50 p-3">
                                <p class="text-xs opacity-70">Total Bab</p>
                                <p class="text-base font-semibold">{{ chapterCount }}</p>
                            </div>
                            <div class="rounded-xl border border-base-300 bg-base-200/50 p-3">
                                <p class="text-xs opacity-70">Jumlah Kata</p>
                                <p class="text-base font-semibold">{{ totalWords }}</p>
                            </div>
                            <div class="rounded-xl border border-base-300 bg-base-200/50 p-3">
                                <p class="text-xs opacity-70">Estimasi Baca</p>
                                <p class="text-base font-semibold">±{{ totalMinutes }} menit</p>
                            </div>
                        </div>

                        <p class="text-sm leading-relaxed opacity-80">
                            {{ story.summary || 'Belum ada ringkasan. Kamu bisa langsung mulai membaca dari bab pertama.' }}
                        </p>

                        <div class="flex flex-wrap gap-2">
                            <RouterLink :to="continueReadRoute" class="btn btn-primary">
                                <i class="bi bi-play-circle"></i>
                                {{ continueReadLabel }}
                            </RouterLink>
                            <RouterLink :to="startReadRoute" class="btn btn-outline">
                                <i class="bi bi-book"></i>
                                Mulai dari Bab 1
                            </RouterLink>
                            <button type="button" class="btn btn-outline" :class="isNovelBookmarked ? 'btn-accent' : ''"
                                @click="toggleNovelBookmark">
                                <i :class="auth.isAuthenticated
                                    ? isNovelBookmarked
                                        ? 'bi bi-bookmark-fill'
                                        : 'bi bi-bookmark'
                                    : 'bi bi-person-lock'
                                    "></i>
                                {{
                                    auth.isAuthenticated
                                        ? isNovelBookmarked
                                            ? 'Tersimpan'
                                            : 'Bookmark Novel'
                                : 'Login untuk Bookmark'
                                }}
                            </button>
                        </div>

                        <div class="rounded-xl border border-base-300 bg-base-200/45 p-3">
                            <p class="mb-2 text-xs uppercase tracking-[0.12em] opacity-60">Preview Bab</p>
                            <div class="space-y-1.5">
                                <p v-for="chapter in chapters.slice(0, 6)" :key="chapter.id" class="text-sm">
                                    <span class="font-medium">Bab {{ chapter.number }}.</span>
                                    <span class="opacity-80"> {{ chapter.title }}</span>
                                </p>
                                <p v-if="chapters.length > 6" class="text-xs opacity-65">+{{ chapters.length - 6 }} bab
                                    lainnya</p>
                            </div>
                        </div>
                    </div>
                </article>
            </section>

            <section v-else-if="isLoading" class="card border border-base-300 bg-base-100 shadow-sm">
                <div class="card-body">
                    <div class="flex items-center gap-2 text-sm opacity-70">
                        <span class="loading loading-spinner loading-sm"></span>
                        Memuat detail novel...
                    </div>
                </div>
            </section>
        </section>
    </div>
</template>
