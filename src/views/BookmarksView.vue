<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useReaderStore } from '../stores/reader'
import { buildReadRoute } from '../utils/reader'

const router = useRouter()
const reader = useReaderStore()

const toast = ref('')
let toastTimer = 0

const novelBookmarks = computed(() => reader.getNovelBookmarks())
const chapterBookmarks = computed(() => {
  return Object.values(reader.bookmarks)
    .slice()
    .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime())
})

const totalBookmarks = computed(() => novelBookmarks.value.length + chapterBookmarks.value.length)

function setToast(message) {
  toast.value = message
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    toast.value = ''
  }, 1800)
}

function formatSavedAt(value) {
  const date = new Date(String(value || ''))
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function openNovel(entry) {
  const slug = String(entry?.slug || entry?.storyId || '').trim()
  if (!slug) return
  router.push({ name: 'novel-detail', params: { slug } })
}

function openChapter(entry) {
  if (!entry?.storyId) return
  const targetStory = {
    id: entry.storyId,
    title: entry.storyTitle || entry.storyId,
  }
  router.push(buildReadRoute(targetStory, entry.chapter || 1))
}

function removeNovelBookmark(entry) {
  const result = reader.toggleNovelBookmark(entry)
  if (result.ok) setToast('Bookmark novel dihapus.')
}

function removeChapterBookmark(entry) {
  const result = reader.toggleBookmark(entry)
  if (result.ok) setToast('Bookmark bab dihapus.')
}

function clearNovelBookmarks() {
  const snapshots = novelBookmarks.value.slice()
  snapshots.forEach((entry) => {
    reader.toggleNovelBookmark(entry)
  })
  if (snapshots.length) setToast('Semua bookmark novel dihapus.')
}

function clearChapterBookmarks() {
  const snapshots = chapterBookmarks.value.slice()
  snapshots.forEach((entry) => {
    reader.toggleBookmark(entry)
  })
  if (snapshots.length) setToast('Semua bookmark bab dihapus.')
}

onBeforeUnmount(() => {
  clearTimeout(toastTimer)
})
</script>

<template>
  <section class="space-y-4">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold md:text-3xl">Bookmark</h1>
        <p class="text-sm opacity-70">Simpan novel atau bab favorit, lalu lanjutkan baca kapan saja.</p>
      </div>
      <div class="badge badge-primary badge-outline">{{ totalBookmarks }} bookmark</div>
    </header>

    <div v-if="toast" class="alert alert-success py-2 text-sm">
      <span>{{ toast }}</span>
    </div>

    <section class="grid gap-4 lg:grid-cols-2">
      <article class="card border border-base-300 bg-base-100 shadow-sm">
        <div class="card-body gap-3">
          <div class="flex items-center justify-between gap-2">
            <h2 class="card-title text-lg">
              <i class="bi bi-bookmark-heart text-primary"></i>
              Bookmark Novel
            </h2>
            <button
              v-if="novelBookmarks.length"
              type="button"
              class="btn btn-xs btn-ghost"
              @click="clearNovelBookmarks"
            >
              Hapus Semua
            </button>
          </div>

          <div v-if="!novelBookmarks.length" class="alert">
            <span>Belum ada bookmark novel.</span>
          </div>

          <div v-else class="space-y-2">
            <div
              v-for="entry in novelBookmarks"
              :key="`${entry.storyId}-novel`"
              class="rounded-xl border border-base-300 bg-base-200/40 p-3"
            >
              <p class="font-semibold line-clamp-1">{{ entry.storyTitle || 'Novel tanpa judul' }}</p>
              <p class="text-xs opacity-70">Disimpan: {{ formatSavedAt(entry.savedAt) }}</p>
              <div class="mt-2 flex flex-wrap justify-end gap-2">
                <button type="button" class="btn btn-xs btn-outline" @click="openNovel(entry)">
                  Buka Detail
                </button>
                <button type="button" class="btn btn-xs btn-error btn-outline" @click="removeNovelBookmark(entry)">
                  Hapus
                </button>
              </div>
            </div>
          </div>
        </div>
      </article>

      <article class="card border border-base-300 bg-base-100 shadow-sm">
        <div class="card-body gap-3">
          <div class="flex items-center justify-between gap-2">
            <h2 class="card-title text-lg">
              <i class="bi bi-bookmark-star text-primary"></i>
              Bookmark Bab
            </h2>
            <button
              v-if="chapterBookmarks.length"
              type="button"
              class="btn btn-xs btn-ghost"
              @click="clearChapterBookmarks"
            >
              Hapus Semua
            </button>
          </div>

          <div v-if="!chapterBookmarks.length" class="alert">
            <span>Belum ada bookmark bab.</span>
          </div>

          <div v-else class="space-y-2">
            <div
              v-for="entry in chapterBookmarks"
              :key="`${entry.storyId}-${entry.chapter}`"
              class="rounded-xl border border-base-300 bg-base-200/40 p-3"
            >
              <p class="font-semibold line-clamp-1">{{ entry.storyTitle || 'Novel tanpa judul' }}</p>
              <p class="text-xs opacity-75 line-clamp-1">Bab {{ entry.chapter }} · {{ entry.chapterTitle || '-' }}</p>
              <p class="text-xs opacity-70">Disimpan: {{ formatSavedAt(entry.savedAt) }}</p>
              <div class="mt-2 flex flex-wrap justify-end gap-2">
                <button type="button" class="btn btn-xs btn-outline" @click="openChapter(entry)">
                  Buka Bab
                </button>
                <button type="button" class="btn btn-xs btn-error btn-outline" @click="removeChapterBookmark(entry)">
                  Hapus
                </button>
              </div>
            </div>
          </div>
        </div>
      </article>
    </section>
  </section>
</template>
