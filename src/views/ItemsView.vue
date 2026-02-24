<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useScriptoriaStore } from '../stores/scriptoria'
import { buildReadUrl } from '../utils/reader'
import { parseGenreList } from '../utils/genre'
import StoryToolbar from '../components/scriptoria/StoryToolbar.vue'
import StoryTable from '../components/scriptoria/StoryTable.vue'

const route = useRoute()
const router = useRouter()
const scriptoria = useScriptoriaStore()
const STORY_LIST_MODE_KEY = 'scriptoria-story-list-mode-v1'

const toolbar = ref({
    search: '',
    genre: 'all',
    status: 'all',
    sortBy: 'updatedAt',
    sortDir: 'desc',
})

const searching = ref(false)
const deleteTarget = ref(null)
const toast = ref({ show: false, type: 'info', message: '' })
const storyListMode = ref(
    typeof window !== 'undefined' && window.localStorage.getItem(STORY_LIST_MODE_KEY) === 'table' ? 'table' : 'card'
)

let searchTimer
let toastTimer
let countUpFrame = 0
let motionMediaQuery = null
let onMotionPreferenceChange = null
const numberFormatter = new Intl.NumberFormat('id-ID')
const hasPlayedCountUp = ref(false)
const displayTotalStories = ref(0)
const displayActiveGenres = ref(0)
const displayPublicStories = ref(0)
const displayTotalWords = ref(0)
const prefersReducedMotion = ref(
    typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
)

watch(
    () => toolbar.value.search,
    () => {
        searching.value = true
        clearTimeout(searchTimer)
        searchTimer = setTimeout(() => {
            searching.value = false
        }, 240)
    }
)

watch(
    () => [route.query.created, route.query.updated, route.query.title],
    async ([created, updated, title]) => {
        const createdFlag = String(created || '') === '1'
        const updatedFlag = String(updated || '') === '1'
        if (!createdFlag && !updatedFlag) return

        const cleanTitle = String(title || '').trim()
        if (createdFlag) {
            showToast(cleanTitle ? `Cerita "${cleanTitle}" berhasil dibuat.` : 'Cerita baru berhasil dibuat.', 'success')
        } else if (updatedFlag) {
            showToast(cleanTitle ? `Cerita "${cleanTitle}" berhasil diperbarui.` : 'Cerita berhasil diperbarui.', 'success')
        }

        const nextQuery = { ...route.query }
        delete nextQuery.created
        delete nextQuery.updated
        delete nextQuery.title
        await router.replace({ name: 'stories', query: nextQuery })
    },
    { immediate: true }
)

const viewStories = computed(() => {
    let next = [...scriptoria.stories]

    if (toolbar.value.genre !== 'all') {
        next = next.filter((story) => parseGenreList(story.genre).includes(toolbar.value.genre))
    }

    if (toolbar.value.status !== 'all') {
        next = next.filter((story) => story.status === toolbar.value.status)
    }

    const keyword = toolbar.value.search.trim().toLowerCase()
    if (keyword) {
        next = next.filter((story) => {
            const haystack = `${story.title} ${story.genre} ${story.status} ${story.summary || ''} ${story.audience || ''}`.toLowerCase()
            return haystack.includes(keyword)
        })
    }

    const dir = toolbar.value.sortDir === 'asc' ? 1 : -1
    const field = toolbar.value.sortBy

    next.sort((a, b) => {
        if (field === 'words' || field === 'targetWords') {
            return ((a[field] || 0) - (b[field] || 0)) * dir
        }

        if (field === 'updatedAt') {
            return (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()) * dir
        }

        const left = String(a[field] || '').toLowerCase()
        const right = String(b[field] || '').toLowerCase()
        return left.localeCompare(right, 'id') * dir
    })

    return next
})

const publicStoriesCount = computed(() =>
    scriptoria.stories.filter((story) => ['Published', 'Completed'].includes(String(story.status || ''))).length
)

function stopCountUpAnimation() {
    if (!countUpFrame) return
    cancelAnimationFrame(countUpFrame)
    countUpFrame = 0
}

function setDisplayStats(stories, genres, publicStories, words) {
    displayTotalStories.value = Math.max(0, Math.round(stories || 0))
    displayActiveGenres.value = Math.max(0, Math.round(genres || 0))
    displayPublicStories.value = Math.max(0, Math.round(publicStories || 0))
    displayTotalWords.value = Math.max(0, Math.round(words || 0))
}

function animateCountUpTo(stories, genres, publicStories, words) {
    if (prefersReducedMotion.value) {
        setDisplayStats(stories, genres, publicStories, words)
        hasPlayedCountUp.value = true
        return
    }

    stopCountUpAnimation()

    const startStories = displayTotalStories.value
    const startGenres = displayActiveGenres.value
    const startPublic = displayPublicStories.value
    const startWords = displayTotalWords.value

    const targetStories = Math.max(0, Math.round(stories || 0))
    const targetGenres = Math.max(0, Math.round(genres || 0))
    const targetPublic = Math.max(0, Math.round(publicStories || 0))
    const targetWords = Math.max(0, Math.round(words || 0))
    const duration = 820
    const startedAt = performance.now()

    const step = (now) => {
        const elapsed = Math.max(0, now - startedAt)
        const progress = Math.min(1, elapsed / duration)
        const eased = 1 - Math.pow(1 - progress, 3)

        setDisplayStats(
            startStories + (targetStories - startStories) * eased,
            startGenres + (targetGenres - startGenres) * eased,
            startPublic + (targetPublic - startPublic) * eased,
            startWords + (targetWords - startWords) * eased
        )

        if (progress < 1) {
            countUpFrame = requestAnimationFrame(step)
            return
        }

        setDisplayStats(targetStories, targetGenres, targetPublic, targetWords)
        hasPlayedCountUp.value = true
        countUpFrame = 0
    }

    countUpFrame = requestAnimationFrame(step)
}

function resetToolbar() {
    toolbar.value = {
        search: '',
        genre: 'all',
        status: 'all',
        sortBy: 'updatedAt',
        sortDir: 'desc',
    }
}

function showToast(message, type = 'info') {
    toast.value = { show: true, type, message }
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => {
        toast.value.show = false
    }, 2400)
}

function formatNumber(value) {
    return numberFormatter.format(Number(value) || 0)
}

function setStoryListMode(mode) {
    storyListMode.value = mode === 'table' ? 'table' : 'card'
    if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORY_LIST_MODE_KEY, storyListMode.value)
    }
}

function goToCreateStory() {
    router.push({ name: 'story-create' })
}

function goToEditStory(story) {
    if (!story?.id) return
    router.push({ name: 'story-edit', params: { id: story.id } })
}

function askDelete(story) {
    deleteTarget.value = story
}

function openEditor(story) {
    if (!story?.id) return
    router.push({ name: 'story-editor', params: { id: story.id } })
}

async function shareStory(story) {
    if (!story?.id) return
    if (!['Published', 'Completed'].includes(String(story.status || ''))) {
        showToast('Cerita harus berstatus Published atau Completed sebelum dibagikan.', 'error')
        return
    }

    const link = buildReadUrl(story, 1)
    try {
        await navigator.clipboard.writeText(link)
        showToast('Link publik berhasil disalin.', 'success')
    } catch {
        showToast(`Gagal menyalin link. Link: ${link}`, 'info')
    }
}

async function confirmDelete() {
    if (!deleteTarget.value) return

    const id = deleteTarget.value.id
    const title = deleteTarget.value.title
    const result = await scriptoria.deleteStory(id)
    if (!result.ok) {
        showToast(result.message || 'Gagal menghapus cerita.', 'error')
        deleteTarget.value = null
        return
    }

    deleteTarget.value = null
    showToast(result.message || `Cerita "${title}" berhasil dihapus.`, 'success')
}

onBeforeUnmount(() => {
    clearTimeout(searchTimer)
    clearTimeout(toastTimer)
    stopCountUpAnimation()

    if (motionMediaQuery && onMotionPreferenceChange) {
        if (typeof motionMediaQuery.removeEventListener === 'function') {
            motionMediaQuery.removeEventListener('change', onMotionPreferenceChange)
        } else {
            motionMediaQuery.removeListener(onMotionPreferenceChange)
        }
    }
})

onMounted(() => {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
        motionMediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
        prefersReducedMotion.value = motionMediaQuery.matches
        onMotionPreferenceChange = (event) => {
            prefersReducedMotion.value = event.matches
            if (event.matches) {
                stopCountUpAnimation()
                setDisplayStats(scriptoria.stories.length, scriptoria.genres.length, publicStoriesCount.value, scriptoria.totalWords)
                hasPlayedCountUp.value = true
            }
        }

        if (typeof motionMediaQuery.addEventListener === 'function') {
            motionMediaQuery.addEventListener('change', onMotionPreferenceChange)
        } else {
            motionMediaQuery.addListener(onMotionPreferenceChange)
        }
    }

    setDisplayStats(scriptoria.stories.length, scriptoria.genres.length, publicStoriesCount.value, scriptoria.totalWords)
})

watch(
    [() => scriptoria.stories.length, () => scriptoria.genres.length, () => publicStoriesCount.value, () => scriptoria.totalWords],
    ([stories, genres, publicStories, words]) => {
        const hasAnyData = stories > 0 || genres > 0 || publicStories > 0 || words > 0

        if (prefersReducedMotion.value) {
            stopCountUpAnimation()
            setDisplayStats(stories, genres, publicStories, words)
            hasPlayedCountUp.value = true
            return
        }

        if (!hasPlayedCountUp.value && hasAnyData) {
            animateCountUpTo(stories, genres, publicStories, words)
            return
        }

        stopCountUpAnimation()
        setDisplayStats(stories, genres, publicStories, words)
    },
    { immediate: true }
)
</script>

<template>
    <section class="space-y-6">
        <section class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <article class="stats bg-base-100 border border-base-300 shadow-sm anim-enter transition hover:-translate-y-0.5"
                style="--anim-delay: 40ms;">
                <div class="stat p-4">
                    <div class="stat-figure text-primary text-xl">
                        <i class="bi bi-archive-fill"></i>
                    </div>
                    <div class="stat-title text-xs md:text-sm">Total Cerita</div>
                    <div class="stat-value text-primary text-2xl md:text-4xl leading-none">{{ formatNumber(displayTotalStories) }}</div>
                    <div class="stat-desc text-xs">Semua status cerita</div>
                </div>
            </article>

            <article class="stats bg-base-100 border border-base-300 shadow-sm anim-enter transition hover:-translate-y-0.5"
                style="--anim-delay: 90ms;">
                <div class="stat p-4">
                    <div class="stat-figure text-secondary text-xl">
                        <i class="bi bi-tags-fill"></i>
                    </div>
                    <div class="stat-title text-xs md:text-sm">Genre Aktif</div>
                    <div class="stat-value text-secondary text-2xl md:text-4xl leading-none">{{ formatNumber(displayActiveGenres) }}</div>
                    <div class="stat-desc text-xs">Genre yang dipakai saat ini</div>
                </div>
            </article>

            <article class="stats bg-base-100 border border-base-300 shadow-sm anim-enter transition hover:-translate-y-0.5"
                style="--anim-delay: 140ms;">
                <div class="stat p-4">
                    <div class="stat-figure text-success text-xl">
                        <i class="bi bi-cloud-arrow-up-fill"></i>
                    </div>
                    <div class="stat-title text-xs md:text-sm">Public</div>
                    <div class="stat-value text-success text-2xl md:text-4xl leading-none">{{ formatNumber(displayPublicStories) }}</div>
                    <div class="stat-desc text-xs">Published + Completed</div>
                </div>
            </article>

            <article class="stats bg-base-100 border border-base-300 shadow-sm anim-enter transition hover:-translate-y-0.5"
                style="--anim-delay: 190ms;">
                <div class="stat p-4">
                    <div class="stat-figure text-info text-xl">
                        <i class="bi bi-file-text-fill"></i>
                    </div>
                    <div class="stat-title text-xs md:text-sm">Total Kata</div>
                    <div class="stat-value text-info text-2xl md:text-4xl leading-none">{{ formatNumber(displayTotalWords) }}</div>
                    <div class="stat-desc text-xs">Akumulasi semua cerita</div>
                </div>
            </article>
        </section>

        <section id="story-table" class="scriptoria-section-shell space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-3 px-1">
                <div>
                    <h2 class="text-lg font-semibold">Daftar Cerita</h2>
                    <span class="text-xs opacity-70">Cari, filter, dan pilih tampilan kartu atau tabel sesuai
                        kebutuhan.</span>
                </div>
                <div class="join">
                    <button type="button" class="btn btn-sm join-item"
                        :class="storyListMode === 'card' ? 'btn-primary' : 'btn-outline'"
                        @click="setStoryListMode('card')">
                        <i class="bi bi-grid-3x2-gap"></i>
                        Card
                    </button>
                    <button type="button" class="btn btn-sm join-item"
                        :class="storyListMode === 'table' ? 'btn-primary' : 'btn-outline'"
                        @click="setStoryListMode('table')">
                        <i class="bi bi-table"></i>
                        Table
                    </button>
                </div>
            </div>
            <StoryToolbar v-model="toolbar" :genres="scriptoria.genres" :searching="searching" @reset="resetToolbar" />
            <StoryTable :stories="viewStories" :search-query="toolbar.search" :active-genre="toolbar.genre"
                :active-status="toolbar.status" :view-mode="storyListMode" @create-new="goToCreateStory"
                @edit="goToEditStory" @delete="askDelete" @open-editor="openEditor" @share="shareStory"
                @reset-filters="resetToolbar" />
        </section>

        <dialog class="modal" :open="Boolean(deleteTarget)">
            <div class="modal-box">
                <h3 class="font-bold text-lg">Konfirmasi Hapus</h3>
                <p class="py-3">Hapus cerita <strong>{{ deleteTarget?.title }}</strong> dari workspace?</p>
                <div class="modal-action">
                    <button class="btn" @click="deleteTarget = null">Batal</button>
                    <button class="btn btn-error" @click="confirmDelete">Hapus</button>
                </div>
            </div>
            <form method="dialog" class="modal-backdrop" @click.prevent="deleteTarget = null">
                <button>Batal</button>
            </form>
        </dialog>

        <div v-if="toast.show" class="toast toast-end toast-top z-[70]">
            <div class="alert"
                :class="toast.type === 'error' ? 'alert-error' : toast.type === 'success' ? 'alert-success' : 'alert-info'">
                <span>{{ toast.message }}</span>
            </div>
        </div>
    </section>
</template>
