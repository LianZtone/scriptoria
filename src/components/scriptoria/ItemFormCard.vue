<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { parseGenreList, stringifyGenreList } from '../../utils/genre'

const props = defineProps({
    modelValue: {
        type: Object,
        required: true,
    },
    isEditing: {
        type: Boolean,
        default: false,
    },
    error: {
        type: String,
        default: '',
    },
    disabled: {
        type: Boolean,
        default: false,
    },
    genres: {
        type: Array,
        default: () => [],
    },
})

const emit = defineEmits(['submit', 'cancel'])
const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024
const FALLBACK_GENRES = ['Fantasy', 'Romance', 'Misteri', 'Thriller', 'Horor', 'Sci-Fi', 'Drama', 'Petualangan']

const draft = reactive({
    title: '',
    genre: '',
    status: 'Draft',
    summary: '',
    audience: '',
    coverImage: '',
    words: 0,
    targetWords: 0,
})

const imageError = ref('')
const uploadInputKey = ref(0)
const newGenre = ref('')
const coverPreview = computed(() => String(draft.coverImage || '').trim())

function normalizeGenres(values) {
    return parseGenreList(values)
}

const selectedGenres = computed(() => parseGenreList(draft.genre))
const genreOptions = computed(() => normalizeGenres([...props.genres, ...FALLBACK_GENRES, ...selectedGenres.value]))

watch(
    () => props.modelValue,
    (value) => {
        draft.title = value.title || ''
        draft.genre = value.genre || ''
        draft.status = value.status || 'Draft'
        draft.summary = value.summary || ''
        draft.audience = value.audience || ''
        draft.coverImage = value.coverImage || ''
        draft.words = Number(value.words) || 0
        draft.targetWords = Number(value.targetWords) || 0
        imageError.value = ''
        newGenre.value = ''
    },
    { immediate: true, deep: true }
)

function resetUploadInput() {
    uploadInputKey.value += 1
}

function clearCoverImage() {
    draft.coverImage = ''
    imageError.value = ''
    resetUploadInput()
}

function onCoverImageSelected(event) {
    if (props.disabled) return
    const file = event?.target?.files?.[0]
    if (!file) return

    imageError.value = ''

    if (!String(file.type || '').startsWith('image/')) {
        imageError.value = 'File harus berupa gambar (PNG, JPG, WEBP, dll).'
        resetUploadInput()
        return
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
        imageError.value = 'Ukuran gambar maksimal 2MB.'
        resetUploadInput()
        return
    }

    const reader = new FileReader()
    reader.onload = () => {
        draft.coverImage = String(reader.result || '')
        imageError.value = ''
    }
    reader.onerror = () => {
        imageError.value = 'Gagal membaca file gambar.'
    }
    reader.readAsDataURL(file)
}

function toggleGenre(genre) {
    if (props.disabled) return
    const selected = parseGenreList(draft.genre)
    const target = String(genre || '').trim()
    if (!target) return

    const key = target.toLowerCase()
    const exists = selected.some((entry) => entry.toLowerCase() === key)
    const next = exists ? selected.filter((entry) => entry.toLowerCase() !== key) : [...selected, target]
    draft.genre = stringifyGenreList(next)
}

function addCustomGenre() {
    if (props.disabled) return

    const value = String(newGenre.value || '').trim()
    if (!value) return

    const selected = parseGenreList(draft.genre)
    draft.genre = stringifyGenreList([...selected, value])
    newGenre.value = ''
}

function isGenreSelected(genre) {
    const key = String(genre || '').trim().toLowerCase()
    if (!key) return false
    return selectedGenres.value.some((entry) => entry.toLowerCase() === key)
}

function onSubmit() {
    if (props.disabled) return
    emit('submit', {
        title: draft.title,
        genre: stringifyGenreList(draft.genre),
        status: draft.status,
        summary: draft.summary,
        audience: draft.audience,
        coverImage: draft.coverImage,
        words: draft.words,
        targetWords: draft.targetWords,
    })
}

const progressPreview = computed(() => {
    const words = Number(draft.words) || 0
    const target = Number(draft.targetWords) || 0

    if (target <= 0) {
        if (!words) return { text: 'Belum mulai', tone: 'badge-ghost' }
        return { text: 'Progres bebas', tone: 'badge-primary' }
    }

    const percent = Math.round((words / target) * 100)

    if (percent >= 120) return { text: `${percent}% (melampaui target)`, tone: 'badge-success' }
    if (percent >= 100) return { text: `${percent}% (target tercapai)`, tone: 'badge-success' }
    if (percent >= 60) return { text: `${percent}% (on track)`, tone: 'badge-info' }
    if (percent > 0) return { text: `${percent}% (perlu dorongan)`, tone: 'badge-warning' }
    return { text: '0% (belum mulai)', tone: 'badge-ghost' }
})
</script>

<template>
    <article class="card interactive-card anim-hover-rise border border-base-300 bg-base-100 shadow-sm reveal-up"
        style="--delay: 120ms;">
        <div class="card-body">
            <div class="space-y-1">
                <h2 class="card-title">
                    <i class="bi bi-pencil-square text-primary"></i>{{ isEditing ? 'Edit Cerita' : 'Buat Cerita Baru' }}
                </h2>
                <p class="text-xs opacity-70">Lengkapi data cerita agar proses menulis dan publikasi lebih terstruktur.
                </p>
            </div>

            <div v-if="error" class="alert alert-error text-sm">
                <span>{{ error }}</span>
            </div>

            <div class="grid gap-3">
                <fieldset class="fieldset">
                    <legend class="fieldset-legend">Judul Cerita</legend>
                    <input v-model="draft.title" type="text" class="input input-bordered w-full"
                        placeholder="Contoh: Senja di Ujung Kota" :disabled="props.disabled" />
                    <p class="label">Wajib diisi</p>
                </fieldset>

                <div class="grid gap-3 md:grid-cols-2">
                    <fieldset class="fieldset">
                        <legend class="fieldset-legend">Genre</legend>
                        <div class="flex flex-wrap gap-2">
                            <button v-for="genre in genreOptions" :key="genre" type="button" class="btn btn-xs sm:btn-sm"
                                :class="isGenreSelected(genre) ? 'btn-primary' : 'btn-outline'" :disabled="props.disabled"
                                @click="toggleGenre(genre)">
                                {{ genre }}
                            </button>
                        </div>
                        <div class="join mt-2 w-full">
                            <input v-model="newGenre" type="text" class="input input-bordered join-item w-full"
                                placeholder="Genre tidak ada? Tambahkan baru..." :disabled="props.disabled"
                                @keydown.enter.prevent="addCustomGenre" />
                            <button type="button" class="btn btn-border join-item" :disabled="props.disabled || !newGenre.trim()"
                                @click="addCustomGenre">
                                <i class="bi bi-plus-lg"></i>
                                Tambah
                            </button>
                        </div>
                        <p class="label">
                            Pilih satu atau lebih genre. Jika belum ada, tambahkan genre baru.
                        </p>
                    </fieldset>

                    <fieldset class="fieldset">
                        <legend class="fieldset-legend">Status</legend>
                        <select v-model="draft.status" class="select select-bordered w-full" :disabled="props.disabled">
                            <option>Draft</option>
                            <option>Review</option>
                            <option>Published</option>
                            <option v-if="props.isEditing">Completed</option>
                            <option>Archived</option>
                        </select>
                        <p class="label">Completed hanya tersedia saat edit cerita yang sudah dipublikasikan</p>
                    </fieldset>
                </div>

                <fieldset class="fieldset">
                    <legend class="fieldset-legend">Ringkasan Cerita</legend>
                    <textarea v-model="draft.summary" class="textarea textarea-bordered min-h-24 w-full" maxlength="400"
                        placeholder="Tuliskan premis, tokoh utama, atau konflik inti cerita..."
                        :disabled="props.disabled"></textarea>
                    <p class="label">Opsional</p>
                </fieldset>

                <fieldset class="fieldset">
                    <legend class="fieldset-legend">Target Pembaca</legend>
                    <input v-model="draft.audience" type="text" class="input input-bordered w-full"
                        placeholder="Contoh: Remaja 15-20, pembaca fantasi" :disabled="props.disabled" />
                    <p class="label">Opsional</p>
                </fieldset>

                <fieldset class="fieldset">
                    <legend class="fieldset-legend">Gambar Cover</legend>
                    <input :key="uploadInputKey" type="file" accept="image/*"
                        class="file-input file-input-bordered w-full" :disabled="props.disabled"
                        @change="onCoverImageSelected" />
                    <p class="label">Opsional, maksimal 2MB</p>
                </fieldset>

                <p v-if="imageError" class="text-xs text-error">{{ imageError }}</p>

                <div v-if="coverPreview" class="space-y-2">
                    <div class="overflow-hidden rounded-xl border border-base-300 bg-base-200/40">
                        <img :src="coverPreview" alt="Preview cover cerita" class="h-48 w-full object-cover" />
                    </div>
                    <button type="button" class="btn btn-xs btn-outline" :disabled="props.disabled"
                        @click="clearCoverImage">
                        <i class="bi bi-trash3"></i>
                        Hapus Gambar
                    </button>
                </div>

                <div class="grid gap-3 md:grid-cols-2">
                    <fieldset class="fieldset">
                        <legend class="fieldset-legend">Jumlah Kata Saat Ini</legend>
                        <input v-model.number="draft.words" type="number" min="0" class="input input-bordered w-full"
                            :disabled="props.disabled" />
                        <p class="label">Minimal 0</p>
                    </fieldset>

                    <fieldset class="fieldset">
                        <legend class="fieldset-legend">Target Kata</legend>
                        <input v-model.number="draft.targetWords" type="number" min="0"
                            class="input input-bordered w-full" :disabled="props.disabled" />
                        <p class="label">Minimal 0</p>
                    </fieldset>
                </div>

                <div class="rounded-xl border border-base-300 bg-base-200/40 px-3 py-2 text-xs">
                    <div class="flex flex-wrap items-center gap-2">
                        <span class="font-semibold">Progres sekarang:</span>
                        <span class="badge badge-sm" :class="progressPreview.tone">{{ progressPreview.text }}</span>
                    </div>
                    <p class="mt-1 opacity-75">Status cerita bisa dipindah dari <strong>Draft</strong> ->
                        <strong>Review</strong> -> <strong>Published</strong> -> <strong>Completed</strong>.
                    </p>
                </div>
            </div>

            <div class="card-actions mt-2 gap-2 md:justify-end">
                <button class="btn btn-primary w-full md:w-auto" :disabled="props.disabled" @click="onSubmit">
                    <i class="bi bi-check2-circle"></i>
                    {{ isEditing ? 'Update Cerita' : 'Simpan Cerita' }}
                </button>
                <button v-if="isEditing" class="btn btn-ghost w-full md:w-auto" :disabled="props.disabled"
                    @click="$emit('cancel')">
                    <i class="bi bi-x-circle"></i>Batal
                </button>
            </div>
        </div>
    </article>
</template>
