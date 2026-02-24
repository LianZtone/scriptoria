<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ItemFormCard from '../components/scriptoria/ItemFormCard.vue'
import { useScriptoriaStore } from '../stores/scriptoria'

const route = useRoute()
const router = useRouter()
const scriptoria = useScriptoriaStore()

const formError = ref('')
const isSubmitting = ref(false)

const isEditing = computed(() => route.name === 'story-edit')
const editingId = computed(() => String(route.params.id || '').trim())
const editingStory = computed(() => scriptoria.stories.find((story) => story.id === editingId.value) || null)

const storyForm = reactive({
  title: '',
  genre: scriptoria.preferences.defaultGenre,
  status: scriptoria.preferences.defaultStatus,
  summary: '',
  audience: '',
  coverImage: '',
  words: 0,
  targetWords: 0,
})

const headerTitle = computed(() => (isEditing.value ? 'Edit Cerita' : 'Buat Cerita Baru'))
const headerDescription = computed(() =>
  isEditing.value ? 'Perbarui metadata cerita sebelum lanjut menulis.' : 'Isi detail utama cerita sebelum masuk editor bab.'
)

function applyDefaultForm() {
  storyForm.title = ''
  storyForm.genre = scriptoria.preferences.defaultGenre
  storyForm.status = scriptoria.preferences.defaultStatus
  storyForm.summary = ''
  storyForm.audience = ''
  storyForm.coverImage = ''
  storyForm.words = 0
  storyForm.targetWords = 0
}

function applyEditingForm(story) {
  if (!story) return
  storyForm.title = story.title
  storyForm.genre = story.genre
  storyForm.status = story.status
  storyForm.summary = story.summary || ''
  storyForm.audience = story.audience || ''
  storyForm.coverImage = story.coverImage || ''
  storyForm.words = story.words
  storyForm.targetWords = story.targetWords
}

watch(
  () => [isEditing.value, editingStory.value?.id],
  () => {
    if (isEditing.value) {
      applyEditingForm(editingStory.value)
      if (!editingStory.value) {
        formError.value = 'Cerita tidak ditemukan.'
      } else {
        formError.value = ''
      }
      return
    }

    applyDefaultForm()
    formError.value = ''
  },
  { immediate: true }
)

function handleCancel() {
  router.push({ name: 'stories' })
}

function validatePayload(payload) {
  if (!String(payload.title || '').trim()) {
    return 'Judul cerita wajib diisi.'
  }
  if (!String(payload.genre || '').trim()) {
    return 'Genre wajib diisi.'
  }
  if (!String(payload.status || '').trim()) {
    return 'Status wajib dipilih.'
  }

  const status = String(payload.status || '').trim()
  if (!isEditing.value && status === 'Completed') {
    return 'Status Completed hanya bisa dipilih setelah cerita dipublikasikan.'
  }
  const hasCover = String(payload.coverImage || '').trim().length > 0
  if ((status === 'Published' || status === 'Completed') && !hasCover) {
    return 'Cover wajib di-upload sebelum status cerita diubah ke Published/Completed.'
  }

  const parsedWords = Number(payload.words)
  const parsedTarget = Number(payload.targetWords)
  if (!Number.isFinite(parsedWords) || parsedWords < 0) {
    return 'Jumlah kata harus angka 0 atau lebih.'
  }
  if (!Number.isFinite(parsedTarget) || parsedTarget < 0) {
    return 'Target kata harus angka 0 atau lebih.'
  }

  const normalizedTitle = String(payload.title || '').trim().toLowerCase()
  const duplicate = scriptoria.stories.some((story) => {
    if (isEditing.value && story.id === editingId.value) return false
    return String(story.title || '').trim().toLowerCase() === normalizedTitle
  })
  if (duplicate) {
    return 'Cerita dengan judul yang sama sudah ada.'
  }

  return ''
}

async function handleStorySubmit(payload) {
  if (isSubmitting.value) return

  formError.value = validatePayload(payload)
  if (formError.value) return

  if (isEditing.value && !editingStory.value) {
    formError.value = 'Cerita tidak ditemukan.'
    return
  }

  isSubmitting.value = true
  try {
    const result = isEditing.value
      ? await scriptoria.updateStory(editingId.value, payload)
      : await scriptoria.addStory(payload)

    if (!result.ok) {
      formError.value = result.message
      return
    }

    const query = isEditing.value
      ? { updated: '1', title: payload.title }
      : { created: '1', title: payload.title }

    await router.push({
      name: 'stories',
      query,
    })
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <section class="space-y-4">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold md:text-3xl">{{ headerTitle }}</h1>
        <p class="text-sm opacity-70">{{ headerDescription }}</p>
      </div>
      <button class="btn btn-ghost btn-sm" @click="handleCancel">
        <i class="bi bi-arrow-left"></i>
        Kembali ke Daftar
      </button>
    </header>

    <div v-if="isSubmitting" class="alert alert-info">
      <span class="loading loading-spinner loading-xs"></span>
      <span>Menyimpan cerita...</span>
    </div>

    <ItemFormCard
      :model-value="storyForm"
      :is-editing="isEditing"
      :error="formError"
      :disabled="isSubmitting"
      :genres="scriptoria.genres"
      @submit="handleStorySubmit"
      @cancel="handleCancel"
    />
  </section>
</template>
