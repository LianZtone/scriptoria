<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import heroArt from '../assets/illustrations/add-to-cart/relaunch-day_k3qo.svg'
import sideArt from '../assets/online-shopping_po8w.svg'
import defaultCover from '../assets/cover.jpeg'
import TopNavbar from '../components/scriptoria/TopNavbar.vue'
import { useAuthStore } from '../stores/auth'
import { useReaderStore } from '../stores/reader'
import { useScriptoriaStore } from '../stores/scriptoria'
import { parseGenreList } from '../utils/genre'
import { buildDetailRoute } from '../utils/reader'

const isScrolled = ref(false)
const scrollProgress = ref(0)
const motionReady = ref(false)
const rootRef = ref(null)

const revealNodes = ref([])
let revealObserver = null

const targetX = ref(0)
const targetY = ref(0)
const currentX = ref(0)
const currentY = ref(0)
const reducedMotion = ref(false)
let rafId = 0
let motionQuery = null
let onMotionChange = null
const theme = ref('scriptorialight')
const THEME_STORAGE_KEY = 'scriptoria-theme-v1'
const auth = useAuthStore()
const reader = useReaderStore()
const scriptoria = useScriptoriaStore()
const route = useRoute()
const router = useRouter()

const socialLinks = [
    { label: 'Instagram', icon: 'bi-instagram', href: 'https://www.instagram.com/' },
    { label: 'LinkedIn', icon: 'bi-linkedin', href: 'https://www.linkedin.com/' },
    { label: 'Twitter', icon: 'bi-twitter-x', href: 'https://x.com/' },
]

function handleScroll() {
    isScrolled.value = window.scrollY > 10
    scrollProgress.value = Math.min(window.scrollY / 260, 1)
}

function animateParallax() {
    currentX.value += (targetX.value - currentX.value) * 0.08
    currentY.value += (targetY.value - currentY.value) * 0.08
    rafId = requestAnimationFrame(animateParallax)
}

function onHeroMove(event) {
    if (reducedMotion.value) return

    const rect = event.currentTarget.getBoundingClientRect()
    const px = ((event.clientX - rect.left) / rect.width) * 2 - 1
    const py = ((event.clientY - rect.top) / rect.height) * 2 - 1

    targetX.value = Math.max(-1, Math.min(1, px))
    targetY.value = Math.max(-1, Math.min(1, py))
}

function onHeroLeave() {
    targetX.value = 0
    targetY.value = 0
}

const heroVisualStyle = computed(() => ({
    transform: reducedMotion.value
        ? 'translate3d(0,0,0)'
        : `translate3d(${currentX.value * 10}px, ${currentY.value * 8}px, 0)`,
}))

const heroSideStyle = computed(() => ({
    transform: reducedMotion.value
        ? 'translate3d(0,0,0)'
        : `translate3d(${currentX.value * -14}px, ${currentY.value * -10 - scrollProgress.value * 10}px, 0)`,
}))

const heroGlowStyle = computed(() => ({
    transform: reducedMotion.value
        ? 'translate3d(0,0,0)'
        : `translate3d(${currentX.value * 6}px, ${currentY.value * 6 - scrollProgress.value * 12}px, 0)`,
}))

const chipLeftStyle = computed(() => ({
    transform: reducedMotion.value
        ? 'translate3d(0,0,0)'
        : `translate3d(${currentX.value * 8}px, ${currentY.value * 6}px, 0)`,
}))

const chipRightStyle = computed(() => ({
    transform: reducedMotion.value
        ? 'translate3d(0,0,0)'
        : `translate3d(${currentX.value * -10}px, ${currentY.value * -8 - scrollProgress.value * 8}px, 0)`,
}))

const currentYear = new Date().getFullYear()
const newsletterEmail = ref('')
const newsletterState = ref('')
const publicStories = ref([])
const publicStoriesLoading = ref(false)
const publicStoriesError = ref('')
const storyQuery = ref('')
const selectedStoryGenre = ref('all')
const showAllStories = ref(false)
const SAMPLE_PREVIEW_LIMIT = 6
const DISCOVERY_SHELF_LIMIT = 6
const STORY_QUERY_MAX_CHARS = 120
let isSyncingFiltersFromRoute = false

const storyGenres = computed(() => {
    const unique = new Set()
    publicStories.value.forEach((story) => {
        parseGenreList(story.genre).forEach((genre) => unique.add(genre))
    })
    return Array.from(unique).sort((a, b) => a.localeCompare(b, 'id'))
})

const filteredStories = computed(() => {
    const keyword = storyQuery.value.trim().toLowerCase()

    return publicStories.value.filter((story) => {
        if (selectedStoryGenre.value !== 'all' && !parseGenreList(story.genre).includes(selectedStoryGenre.value)) {
            return false
        }

        if (!keyword) return true

        const haystack = [story.title, story.genre, story.summary, story.audience]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()

        return haystack.includes(keyword)
    })
})

const shelfStories = computed(() => {
    return publicStories.value
})

const visibleStories = computed(() => {
    if (showAllStories.value) return filteredStories.value
    return filteredStories.value.slice(0, SAMPLE_PREVIEW_LIMIT)
})

const hasMoreStories = computed(() => filteredStories.value.length > SAMPLE_PREVIEW_LIMIT)
const publicStoryCount = computed(() => publicStories.value.length)

const storyDateFormatter = new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
})

function storyTimestamp(story) {
    const published = Date.parse(String(story?.publishedAt || ''))
    if (Number.isFinite(published)) return published
    const updated = Date.parse(String(story?.updatedAt || ''))
    return Number.isFinite(updated) ? updated : 0
}

function sortByFreshness(stories) {
    return stories
        .slice()
        .sort((a, b) => storyTimestamp(b) - storyTimestamp(a))
}

function trendScore(story) {
    const now = Date.now()
    const storyTs = storyTimestamp(story)
    const ageDays = Math.max(1, (now - storyTs) / 86400000)
    const freshnessScore = 160 / ageDays
    const words = Math.max(0, Number(story?.words) || 0)
    const wordScore = Math.min(120, Math.log10(words + 1) * 42)
    const targetWords = Math.max(0, Number(story?.targetWords) || 0)
    const completionScore = targetWords > 0 ? Math.min(80, (words / targetWords) * 80) : 0

    return freshnessScore + wordScore + completionScore
}

function hashToUnitInterval(input) {
    const text = String(input || '')
    let hash = 2166136261
    for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i)
        hash = Math.imul(hash, 16777619)
    }
    return (hash >>> 0) / 4294967295
}

function isStoryCompleted(story) {
    const status = String(story?.status || '').trim().toLowerCase()
    if (status === 'completed') return true

    const words = Math.max(0, Number(story?.words) || 0)
    const targetWords = Math.max(0, Number(story?.targetWords) || 0)
    if (targetWords > 0 && words >= targetWords) return true

    const signals = [story?.summary, story?.title, story?.audience]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

    return /(tamat|selesai|completed|complete|end|ending|final)/.test(signals)
}

function storyUpdatedLabel(story) {
    const ts = storyTimestamp(story)
    if (!ts) return ''
    return storyDateFormatter.format(new Date(ts))
}

const latestStories = computed(() => sortByFreshness(shelfStories.value).slice(0, DISCOVERY_SHELF_LIMIT))

const trendingStories = computed(() => {
    return shelfStories.value
        .slice()
        .sort((a, b) => trendScore(b) - trendScore(a))
        .slice(0, DISCOVERY_SHELF_LIMIT)
})

const genreHighlights = computed(() => {
    const map = new Map()

    shelfStories.value.forEach((story) => {
        parseGenreList(story.genre).forEach((genreName) => {
            if (!map.has(genreName)) {
                map.set(genreName, { name: genreName, count: 0, topStory: null, score: -Infinity })
            }
            const entry = map.get(genreName)
            entry.count += 1
            const score = trendScore(story)
            if (score > entry.score) {
                entry.score = score
                entry.topStory = story
            }
        })
    })

    return Array.from(map.values())
        .sort((a, b) => {
            if (b.count !== a.count) return b.count - a.count
            return a.name.localeCompare(b.name, 'id')
        })
        .slice(0, 8)
})

const completedStories = computed(() => {
    return sortByFreshness(shelfStories.value.filter((story) => isStoryCompleted(story))).slice(0, DISCOVERY_SHELF_LIMIT)
})

const bookmarkedStoryIds = computed(() => {
    const ids = new Set()
    Object.keys(reader.novelBookmarks || {}).forEach((storyId) => ids.add(storyId))
    Object.values(reader.bookmarks || {}).forEach((entry) => {
        if (entry?.storyId) ids.add(String(entry.storyId))
    })
    return ids
})

const preferredGenres = computed(() => {
    const genres = new Set()
    if (!bookmarkedStoryIds.value.size) return genres

    publicStories.value.forEach((story) => {
        if (!bookmarkedStoryIds.value.has(String(story.id))) return
        parseGenreList(story.genre).forEach((genre) => genres.add(genre))
    })
    return genres
})

const recommendedStories = computed(() => {
    if (!auth.isAuthenticated) return []

    const currentUsername = String(auth.currentUser?.username || '').trim().toLowerCase()
    const userSeed = String(auth.currentUser?.id || auth.currentUser?.username || 'guest')
    const pool = shelfStories.value.filter((story) => {
        if (bookmarkedStoryIds.value.has(String(story.id))) return false
        if (currentUsername && String(story.authorName || '').trim().toLowerCase() === currentUsername) return false
        return true
    })
    if (!pool.length) return []

    return pool
        .slice()
        .sort((left, right) => {
            const leftGenres = parseGenreList(left.genre)
            const rightGenres = parseGenreList(right.genre)
            const leftPreferredMatchCount = leftGenres.filter((genre) => preferredGenres.value.has(genre)).length
            const rightPreferredMatchCount = rightGenres.filter((genre) => preferredGenres.value.has(genre)).length

            const leftGenreBoost = leftPreferredMatchCount > 0 ? 180 + leftPreferredMatchCount * 24 : 0
            const rightGenreBoost = rightPreferredMatchCount > 0 ? 180 + rightPreferredMatchCount * 24 : 0

            const leftPersonalJitter = (hashToUnitInterval(`${userSeed}:${left.id}`) - 0.5) * 26
            const rightPersonalJitter = (hashToUnitInterval(`${userSeed}:${right.id}`) - 0.5) * 26

            const leftScore = trendScore(left) + leftGenreBoost + leftPersonalJitter
            const rightScore = trendScore(right) + rightGenreBoost + rightPersonalJitter

            if (rightScore !== leftScore) return rightScore - leftScore
            return String(left.title || '').localeCompare(String(right.title || ''), 'id')
        })
        .slice(0, DISCOVERY_SHELF_LIMIT)
})

const workspaceRoute = computed(() => (auth.isAuthenticated ? { name: 'stories' } : { name: 'login' }))
const writeRoute = computed(() => (auth.isAuthenticated ? { name: 'story-create' } : { name: 'login' }))
const workspaceLabel = computed(() => (auth.isAuthenticated ? 'Karya Saya' : 'Masuk Scriptoria'))
const writeLabel = computed(() => (auth.isAuthenticated ? 'Tulis Cerita Baru' : 'Mulai Menulis'))

function handleNewsletterSubmit() {
    if (!newsletterEmail.value.trim()) {
        newsletterState.value = 'Masukkan email dulu ya.'
        return
    }

    newsletterState.value = 'Terima kasih. Update terbaru akan kami kirim.'
    newsletterEmail.value = ''
}

function getStoryCover(story) {
    const uploaded = String(story?.coverImage || '').trim()
    return uploaded || defaultCover
}

function handleCoverError(event) {
    const img = event?.target
    if (!img || img.dataset.fallbackApplied === '1') return
    img.dataset.fallbackApplied = '1'
    img.src = defaultCover
}

function storyDetailRoute(story) {
    return buildDetailRoute(story)
}

function pickFirstQueryValue(raw) {
    if (Array.isArray(raw)) return raw[0] || ''
    return raw ?? ''
}

function normalizeStoryQuery(raw) {
    return String(pickFirstQueryValue(raw)).trim().slice(0, STORY_QUERY_MAX_CHARS)
}

function normalizeStoryGenre(raw) {
    const clean = String(pickFirstQueryValue(raw)).trim()
    if (!clean || clean.toLowerCase() === 'all') return 'all'
    return clean
}

function applyFiltersFromRoute() {
    isSyncingFiltersFromRoute = true
    storyQuery.value = normalizeStoryQuery(route.query.q)
    selectedStoryGenre.value = normalizeStoryGenre(route.query.genre)
    showAllStories.value = false
    isSyncingFiltersFromRoute = false
}

function currentRouteFilterState() {
    return {
        q: normalizeStoryQuery(route.query.q),
        genre: normalizeStoryGenre(route.query.genre),
    }
}

async function syncRouteFromFilters() {
    if (isSyncingFiltersFromRoute) return

    const nextQ = normalizeStoryQuery(storyQuery.value)
    const nextGenre = normalizeStoryGenre(selectedStoryGenre.value)
    const current = currentRouteFilterState()

    if (current.q === nextQ && current.genre === nextGenre) return

    const nextQuery = { ...route.query }
    delete nextQuery.q
    delete nextQuery.genre

    if (nextQ) nextQuery.q = nextQ
    if (nextGenre !== 'all') nextQuery.genre = nextGenre

    await router.replace({
        name: 'landing',
        query: nextQuery,
        hash: route.hash || undefined,
    })
}

async function loadPublicStories() {
    publicStoriesLoading.value = true
    publicStoriesError.value = ''

    const result = await scriptoria.fetchPublicStories({ limit: 120 })
    if (!result.ok) {
        publicStories.value = []
        publicStoriesError.value = result.message || 'Gagal memuat novel publik.'
        publicStoriesLoading.value = false
        return
    }

    publicStories.value = result.stories
        .slice()
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

    publicStoriesLoading.value = false
}

function runStorySearch() {
    showAllStories.value = true
    window.setTimeout(() => {
        document.getElementById('novel-publik')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 20)
}

function clearStorySearch() {
    storyQuery.value = ''
    selectedStoryGenre.value = 'all'
    showAllStories.value = false
}

function applyGenreFilter(genre = 'all') {
    selectedStoryGenre.value = genre
    showAllStories.value = false
    if (genre !== 'all') {
        storyQuery.value = ''
    }
    window.setTimeout(() => {
        document.getElementById('novel-publik')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 20)
}

function toggleTheme() {
    theme.value = theme.value === 'scriptorialight' ? 'scriptorianight' : 'scriptorialight'
}

function handleLandingLogout() {
    auth.logout()
}

onMounted(() => {
    void auth.ensureSessionValid().then(() => auth.fetchMe())
    applyFiltersFromRoute()

    const saved = localStorage.getItem(THEME_STORAGE_KEY)
    if (saved === 'scriptorialight' || saved === 'scriptorianight') {
        theme.value = saved
    }
    document.documentElement.setAttribute('data-theme', theme.value)

    motionReady.value = true
    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })

    motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotion.value = motionQuery.matches

    onMotionChange = (event) => {
        reducedMotion.value = event.matches
        if (event.matches) {
            targetX.value = 0
            targetY.value = 0
            currentX.value = 0
            currentY.value = 0
        }
    }

    if (typeof motionQuery.addEventListener === 'function') {
        motionQuery.addEventListener('change', onMotionChange)
    } else {
        motionQuery.addListener(onMotionChange)
    }

    if (!reducedMotion.value) {
        rafId = requestAnimationFrame(animateParallax)
    }

    if (rootRef.value) {
        revealNodes.value = Array.from(rootRef.value.querySelectorAll('[data-reveal], [data-reveal-section]'))

        revealObserver = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('is-visible')
                        return
                    }
                    entry.target.classList.remove('is-visible')
                })
            },
            { threshold: 0.18 }
        )

        revealNodes.value.forEach((node) => revealObserver.observe(node))
    }

    void loadPublicStories()
})

watch(theme, (value) => {
    document.documentElement.setAttribute('data-theme', value)
    localStorage.setItem(THEME_STORAGE_KEY, value)
})

watch(() => route.query, () => {
    applyFiltersFromRoute()
})

watch([storyQuery, selectedStoryGenre], () => {
    showAllStories.value = false
    void syncRouteFromFilters()
})

onBeforeUnmount(() => {
    window.removeEventListener('scroll', handleScroll)
    cancelAnimationFrame(rafId)

    if (revealObserver) revealObserver.disconnect()

    if (motionQuery && onMotionChange) {
        if (typeof motionQuery.removeEventListener === 'function') {
            motionQuery.removeEventListener('change', onMotionChange)
        } else {
            motionQuery.removeListener(onMotionChange)
        }
    }
})
</script>

<template>
    <div ref="rootRef" class="min-h-screen page-bg" :class="{ 'motion-ready': motionReady }">
        <div class="mx-auto max-w-7xl p-4 md:p-8">
            <TopNavbar
                :scrolled="isScrolled"
                :theme="theme"
                :show-theme-toggle="true"
                :show-public-shortcut="true"
                logout-mode="emit"
                @toggle-theme="toggleTheme"
                @logout="handleLandingLogout"
            />

            <section id="fitur" data-reveal-section
                class="reveal-section grid gap-8 py-10 md:py-14 lg:grid-cols-2 lg:items-center" @mousemove="onHeroMove"
                @mouseleave="onHeroLeave">
                <div class="landing-hero-glow" :style="heroGlowStyle"></div>
                <div data-reveal class="reveal-item" style="--reveal-delay: 40ms;">
                    <div class="badge badge-soft shadow-xl badge-primary mb-3">Scriptoria</div>
                    <h1 class="text-4xl md:text-6xl font-black leading-tight">Sebuah ruang digital pribadi untuk
                        menulis dan membagikan cerita.</h1>
                    <p class="py-4 text-base-content/75 max-w-2xl">
                        Dirancang dengan teknologi modern untuk menghadirkan pengalaman membaca yang cepat, bersih, dan
                        fokus pada isi cerita.
                    </p>
                    <div class="flex flex-wrap gap-3">
                        <RouterLink :to="writeRoute" class="btn btn-primary">{{ writeLabel }}</RouterLink>
                        <a href="#novel-publik" class="btn btn-ghost">Jelajah Novel</a>
                    </div>
                </div>

                <div data-reveal class="relative reveal-item" style="--reveal-delay: 90ms;">
                    <div class="card backdrop-blur">
                        <div class="card-body">
                            <img :src="heroArt" alt="Scriptoria hero preview" class="w-full max-w-md mx-auto"
                                :style="heroVisualStyle" />
                        </div>
                    </div>
                    <div class="floating-chip hidden md:flex" :style="chipLeftStyle">
                        <span class="hero-chip-media">
                            <i class="bi bi-lightning-charge hero-chip-vector"></i>
                        </span>
                        <div>
                            <p class="text-xs opacity-70">Writing Insight</p>
                            <p class="font-semibold">Draft baru siap dipublikasikan</p>
                        </div>
                    </div>
                    <div class="floating-chip chip-right hidden md:flex" :style="chipRightStyle">
                        <span class="hero-chip-media">
                            <i class="bi bi-bar-chart-line hero-chip-vector"></i>
                        </span>
                        <div>
                            <p class="text-xs opacity-70">Reading Flow</p>
                            <p class="font-semibold">Pembaca fokus lebih lama</p>
                        </div>
                    </div>
                    <div class="absolute -right-2 -bottom-3 hidden rounded-xl border border-base-300 bg-base-100/80 p-3 shadow-md md:block"
                        :style="heroSideStyle">
                        <img :src="sideArt" alt="Story reading illustration" class="w-24" />
                    </div>
                </div>
            </section>

            <section id="search-discovery" data-reveal-section class="reveal-section py-4">
                <div class="rounded-2xl border border-base-300 bg-base-100/85 p-3 md:p-4">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                        <p class="text-sm font-semibold">Cari novel sekarang</p>
                        <span class="text-xs opacity-70">{{ publicStoryCount }} novel publik</span>
                    </div>
                    <form class="join mt-2 w-full" role="search" @submit.prevent="runStorySearch">
                        <label for="novel-search-input" class="sr-only">Cari novel publik</label>
                        <input id="novel-search-input" v-model="storyQuery" type="search"
                            class="input input-bordered join-item w-full"
                            aria-label="Cari novel publik"
                            placeholder="Cari judul, genre, atau ringkasan..." />
                        <button type="submit" class="btn btn-primary join-item">
                            <i class="bi bi-search"></i>
                            Search
                        </button>
                    </form>
                </div>
            </section>
            
            <section data-reveal-section class="reveal-section py-2">
                <div v-if="publicStoriesLoading" class="alert">
                    <span class="flex items-center gap-2">
                        <span class="loading loading-spinner loading-sm"></span>
                        Memuat discovery novel ...
                    </span>
                </div>
                <div v-else-if="publicStoriesError" class="alert alert-error flex items-center justify-between gap-3">
                    <span>{{ publicStoriesError }}</span>
                    <button type="button" class="btn btn-xs btn-outline" @click="loadPublicStories">Coba Lagi</button>
                </div>
                <div v-else-if="publicStoryCount === 0" class="alert">
                    <span>Belum ada novel publik yang tersedia.</span>
                </div>
            </section>

            <section id="latest-update" data-reveal-section class="reveal-section py-8">
                <div data-reveal class="mb-4 reveal-item" style="--reveal-delay: 40ms;">
                    <h2 class="text-2xl md:text-3xl font-bold">Novel Terbaru</h2>
                    <p class="text-sm opacity-70">Update rilis dan pembaruan paling baru dari penulis Scriptoria.</p>
                </div>
                <div v-if="latestStories.length" class="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-6">
                    <article v-for="(story, index) in latestStories" :key="`latest-${story.id}`"
                        class="card bg-base-100 border border-base-300 shadow-sm reveal-card"
                        :style="{ '--stagger-index': index }">
                        <div class="card-body">
                            <div class="relative aspect-[3/4] overflow-hidden rounded-xl bg-base-200">
                                <img :src="getStoryCover(story)" :alt="`Cover ${story.title}`"
                                    class="h-full w-full object-cover object-center" loading="lazy" decoding="async"
                                    @error="handleCoverError" />
                            </div>
                            <h3 class="line-clamp-2 text-base font-semibold leading-tight">{{ story.title }}</h3>
                            <p class="text-xs opacity-70 line-clamp-1">{{ story.genre }}</p>
                            <p class="text-[11px] opacity-60">Update {{ storyUpdatedLabel(story) }}</p>
                            <div class="card-actions justify-end">
                                <RouterLink :to="storyDetailRoute(story)" class="btn btn-xs sm:btn-sm btn-primary">Baca Novel</RouterLink>
                            </div>
                        </div>
                    </article>
                </div>
            </section>

            <section id="trending" data-reveal-section class="reveal-section py-8">
                <div data-reveal class="mb-4 reveal-item" style="--reveal-delay: 40ms;">
                    <h2 class="text-2xl md:text-3xl font-bold">Trending Saat Ini</h2>
                    <p class="text-sm opacity-70">Diurutkan dari kombinasi pembaruan terbaru dan perkembangan naskah.</p>
                </div>
                <div v-if="trendingStories.length" class="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-6">
                    <article v-for="(story, index) in trendingStories" :key="`trending-${story.id}`"
                        class="card bg-base-100 border border-base-300 shadow-sm reveal-card"
                        :style="{ '--stagger-index': index }">
                        <div class="card-body">
                            <div class="relative aspect-[3/4] overflow-hidden rounded-xl bg-base-200">
                                <img :src="getStoryCover(story)" :alt="`Cover ${story.title}`"
                                    class="h-full w-full object-cover object-center" loading="lazy" decoding="async"
                                    @error="handleCoverError" />
                                <span class="badge badge-primary absolute left-2 top-2">#{{ index + 1 }}</span>
                            </div>
                            <h3 class="line-clamp-2 text-base font-semibold leading-tight">{{ story.title }}</h3>
                            <p class="text-xs opacity-70 line-clamp-1">{{ story.genre }}</p>
                            <div class="text-[11px] opacity-65">{{ story.words || 0 }} kata</div>
                            <div class="card-actions justify-end">
                                <RouterLink :to="storyDetailRoute(story)" class="btn btn-xs sm:btn-sm btn-primary">Baca Novel</RouterLink>
                            </div>
                        </div>
                    </article>
                </div>
            </section>



            <section v-if="auth.isAuthenticated" id="rekomendasi" data-reveal-section class="reveal-section py-8">
                <div data-reveal class="mb-4 reveal-item" style="--reveal-delay: 40ms;">
                    <h2 class="text-2xl md:text-3xl font-bold">Rekomendasi untuk Kamu</h2>
                    <p class="text-sm opacity-70">Disusun dari aktivitas baca/bookmark dan tren yang sedang naik.</p>
                </div>
                <div v-if="recommendedStories.length" class="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-6">
                    <article v-for="(story, index) in recommendedStories" :key="`recommended-${story.id}`"
                        class="card bg-base-100 border border-base-300 shadow-sm reveal-card"
                        :style="{ '--stagger-index': index }">
                        <div class="card-body">
                            <div class="relative aspect-[3/4] overflow-hidden rounded-xl bg-base-200">
                                <img :src="getStoryCover(story)" :alt="`Cover ${story.title}`"
                                    class="h-full w-full object-cover object-center" loading="lazy" decoding="async"
                                    @error="handleCoverError" />
                            </div>
                            <h3 class="line-clamp-2 text-base font-semibold leading-tight">{{ story.title }}</h3>
                            <p class="text-xs opacity-70 line-clamp-1">{{ story.genre }}</p>
                            <div class="card-actions justify-end">
                                <RouterLink :to="storyDetailRoute(story)" class="btn btn-xs sm:btn-sm btn-primary">Baca Novel</RouterLink>
                            </div>
                        </div>
                    </article>
                </div>
                <div v-else class="alert">
                    <span>Belum ada rekomendasi personal. Tambahkan bookmark untuk hasil yang lebih relevan.</span>
                </div>
            </section>

            <section id="novel-selesai" data-reveal-section class="reveal-section py-8">
                <div data-reveal class="mb-4 reveal-item" style="--reveal-delay: 40ms;">
                    <h2 class="text-2xl md:text-3xl font-bold">Novel Selesai</h2>
                    <p class="text-sm opacity-70">Koleksi novel berstatus Completed (dengan fallback deteksi konten final).</p>
                </div>
                <div v-if="completedStories.length" class="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-6">
                    <article v-for="(story, index) in completedStories" :key="`completed-${story.id}`"
                        class="card bg-base-100 border border-base-300 shadow-sm reveal-card"
                        :style="{ '--stagger-index': index }">
                        <div class="card-body">
                            <div class="relative aspect-[3/4] overflow-hidden rounded-xl bg-base-200">
                                <img :src="getStoryCover(story)" :alt="`Cover ${story.title}`"
                                    class="h-full w-full object-cover object-center" loading="lazy" decoding="async"
                                    @error="handleCoverError" />
                                <span class="badge badge-success absolute left-2 top-2">Completed</span>
                            </div>
                            <h3 class="line-clamp-2 text-base font-semibold leading-tight">{{ story.title }}</h3>
                            <p class="text-xs opacity-70 line-clamp-1">{{ story.genre }}</p>
                            <div class="card-actions justify-end">
                                <RouterLink :to="storyDetailRoute(story)" class="btn btn-xs sm:btn-sm btn-primary">Baca Novel</RouterLink>
                            </div>
                        </div>
                    </article>
                </div>
                <div v-else class="alert">
                    <span>Belum ada novel selesai yang terdeteksi.</span>
                </div>
            </section>

            <section id="novel-publik" data-reveal-section class="reveal-section py-8">
                <div data-reveal class="mb-4 reveal-item" style="--reveal-delay: 40ms;">
                    <h2 class="text-2xl md:text-3xl font-bold">Semua Novel Publik</h2>
                    <p class="text-sm opacity-70">Hub utama untuk menjelajah semua novel yang sudah dipublikasikan.</p>
                </div>

                <div class="mb-4 grid gap-3 rounded-xl border border-base-300 bg-base-100/80 p-3 md:grid-cols-[1fr_auto]">
                    <form class="join w-full" role="search" @submit.prevent="runStorySearch">
                        <label for="novel-search-input-secondary" class="sr-only">Cari novel pada katalog lengkap</label>
                        <input id="novel-search-input-secondary" v-model="storyQuery" type="search"
                            class="input input-bordered join-item w-full"
                            aria-label="Cari novel pada katalog lengkap"
                            placeholder="Cari judul, genre, atau ringkasan..." />
                        <button type="submit" class="btn btn-primary join-item">
                            <i class="bi bi-search"></i>
                            Search
                        </button>
                    </form>

                    <div class="flex flex-wrap items-center gap-2">
                        <button type="button" class="btn btn-xs"
                            :class="selectedStoryGenre === 'all' ? 'btn-primary' : 'btn-outline'"
                            @click="applyGenreFilter('all')">
                            Semua
                        </button>
                        <button v-for="genre in storyGenres" :key="genre" type="button" class="btn btn-xs"
                            :class="selectedStoryGenre === genre ? 'btn-primary' : 'btn-outline'"
                            @click="applyGenreFilter(genre)">
                            {{ genre }}
                        </button>
                        <button type="button" class="btn btn-xs btn-ghost" @click="clearStorySearch">
                            Reset
                        </button>
                        <button type="button" class="btn btn-xs btn-ghost" :disabled="publicStoriesLoading"
                            @click="loadPublicStories">
                            Refresh
                        </button>
                    </div>
                </div>

                <div v-if="visibleStories.length === 0" class="alert">
                    <span>Novel tidak ditemukan. Coba kata kunci atau genre lain.</span>
                </div>

                <div v-else class="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-6">
                    <article v-for="(story, index) in visibleStories" :key="`all-${story.id}`"
                        class="card bg-base-100 border border-base-300 shadow-sm reveal-card"
                        :style="{ '--stagger-index': index }">
                        <div class="card-body">
                            <div class="relative aspect-[3/4] overflow-hidden rounded-xl bg-base-200">
                                <img :src="getStoryCover(story)" :alt="`Cover ${story.title}`"
                                    class="h-full w-full object-cover object-center" loading="lazy" decoding="async"
                                    @error="handleCoverError" />
                            </div>
                            <h3 class="line-clamp-2 text-base font-semibold leading-tight">{{ story.title }}</h3>
                            <p class="text-xs opacity-70 line-clamp-1">{{ story.genre }}</p>
                            <p class="text-[11px] opacity-60">Update {{ storyUpdatedLabel(story) }}</p>
                            <div class="card-actions justify-end">
                                <RouterLink :to="storyDetailRoute(story)" class="btn btn-xs sm:btn-sm btn-primary">Baca Novel</RouterLink>
                            </div>
                        </div>
                    </article>
                </div>

                <div v-if="hasMoreStories && !showAllStories" class="mt-4 flex justify-center">
                    <button type="button" class="btn btn-outline btn-sm" @click="showAllStories = true">
                        Lihat Semua Novel
                    </button>
                </div>
            </section>

            <section id="genre-kategori" data-reveal-section class="reveal-section py-8">
                <div data-reveal class="mb-4 reveal-item" style="--reveal-delay: 40ms;">
                    <h2 class="text-2xl md:text-3xl font-bold">Genre & Kategori</h2>
                    <p class="text-sm opacity-70">Temukan koleksi berdasarkan genre yang paling aktif dipublikasikan.
                    </p>
                </div>
                <div v-if="genreHighlights.length"
                    class="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <article v-for="(genre, index) in genreHighlights" :key="`genre-${genre.name}`"
                        class="card bg-base-100 border border-base-300 shadow-sm reveal-card"
                        :style="{ '--stagger-index': index }">
                        <div class="card-body gap-2">
                            <div class="flex items-center justify-between gap-2">
                                <h3 class="card-title text-base">{{ genre.name }}</h3>
                                <span class="badge badge-outline">{{ genre.count }} novel</span>
                            </div>
                            <p class="text-xs opacity-70 line-clamp-2">
                                {{ genre.topStory ? `Contoh: ${genre.topStory.title}` : 'Belum ada contoh judul.' }}
                            </p>
                            <div class="card-actions justify-end">
                                <button type="button" class="btn btn-xs sm:btn-sm btn-primary"
                                    @click="applyGenreFilter(genre.name)">
                                    Jelajah Genre
                                </button>
                            </div>
                        </div>
                    </article>
                </div>
            </section>

            <section id="paket" class="reveal-section py-8 pb-12" data-reveal-section>
                <div class="card border border-primary/30 bg-base-100/80 shadow-xl reveal-item" style="--reveal-delay: 80ms;">
                    <div class="card-body md:flex-row md:items-center md:justify-between">
                        <div>
                            <h2 class="card-title text-2xl">Lanjutkan ke Workspace</h2>
                            <p class="text-sm opacity-70">Kalau kamu siap menulis, lanjutkan ke workspace pribadi Scriptoria.</p>
                        </div>
                        <div class="text-right">
                            <p class="text-3xl font-black">Scriptoria</p>
                            <p class="text-xs opacity-70">Discovery untuk pembaca, workspace untuk penulis</p>
                            <RouterLink :to="workspaceRoute" class="btn btn-primary mt-2">{{ workspaceLabel }}</RouterLink>
                        </div>
                    </div>
                </div>
            </section>

            <footer data-reveal-section class="reveal-section border-t border-base-300/70 py-8">
                <div class="grid gap-6 lg:grid-cols-[1.15fr_1fr_1.1fr]">
                    <div class="reveal-item space-y-3" style="--reveal-delay: 30ms;">
                        <div
                            class="inline-flex items-center gap-2 rounded-xl border border-base-300 bg-base-100/80 px-3 py-2">
                            <span class="grid h-8 w-8 place-items-center rounded-lg bg-primary/15 text-primary">
                                <i class="bi bi-journal-text"></i>
                            </span>
                            <div>
                                <p class="text-sm font-semibold leading-tight">Scriptoria</p>
                                <p class="text-xs opacity-70 leading-tight">Personal Story Space</p>
                            </div>
                        </div>
                        <p class="text-sm opacity-70 max-w-xs">Ruang digital pribadi untuk menulis, membaca, dan
                            membagikan cerita tanpa distraksi.</p>
                    </div>

                    <div class="reveal-item" style="--reveal-delay: 70ms;">
                        <p class="text-sm font-semibold mb-2">Quick Links</p>
                        <div class="flex flex-wrap gap-3 text-sm opacity-80">
                            <a href="#fitur" class="link link-hover">Hero</a>
                            <a href="#latest-update" class="link link-hover">Latest</a>
                            <a href="#trending" class="link link-hover">Trending</a>
                            <a href="#genre-kategori" class="link link-hover">Genre</a>
                            <a v-if="auth.isAuthenticated" href="#rekomendasi" class="link link-hover">Rekomendasi</a>
                            <a href="#novel-selesai" class="link link-hover">Completed</a>
                            <a href="#novel-publik" class="link link-hover">Novel Publik</a>
                        </div>
                        <div class="mt-4 flex items-center gap-2">
                            <a v-for="social in socialLinks" :key="social.label" class="btn btn-sm btn-circle btn-ghost"
                                :href="social.href" :aria-label="social.label" target="_blank"
                                rel="noopener noreferrer">
                                <i :class="['bi', social.icon]"></i>
                            </a>
                        </div>
                    </div>

                    <div class="reveal-item" style="--reveal-delay: 110ms;">
                        <p class="text-sm font-semibold mb-2">Mini Newsletter</p>
                        <p class="text-xs opacity-70 mb-3">Dapatkan update fitur menulis, membaca, dan publikasi cerita.
                        </p>
                        <form class="join w-full" @submit.prevent="handleNewsletterSubmit">
                            <label for="newsletter-email-input" class="sr-only">Email newsletter</label>
                            <input v-model="newsletterEmail" type="email" class="input input-bordered join-item w-full"
                                id="newsletter-email-input"
                                aria-label="Email newsletter"
                                placeholder="email@scriptoria.id" />
                            <button type="submit" class="btn btn-primary join-item">
                                Join
                            </button>
                        </form>
                        <p class="mt-2 text-xs opacity-75 min-h-4" aria-live="polite">{{ newsletterState || `© ${currentYear} Scriptoria`
                            }}</p>
                    </div>
                </div>
            </footer>
        </div>

        <div class="landing-mobile-cta fixed inset-x-3 bottom-3 z-[60] md:hidden">
            <div class="rounded-2xl border border-base-300 bg-base-100/85 p-2 shadow-xl backdrop-blur-lg">
                <div class="flex items-center gap-2">
                    <RouterLink v-if="!auth.isAuthenticated" :to="{ name: 'login' }" class="btn btn-outline btn-sm flex-1">Login</RouterLink>
                    <button v-else type="button" class="btn btn-outline btn-sm flex-1" @click="handleLandingLogout">Logout</button>
                    <RouterLink :to="workspaceRoute" class="btn btn-primary btn-sm flex-1">{{ auth.isAuthenticated ? 'Karya Saya' : 'Buka Scriptoria' }}
                    </RouterLink>
                </div>
            </div>
        </div>
    </div>
</template>
