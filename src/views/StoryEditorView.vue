<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { useScriptoriaStore } from '../stores/scriptoria'
import { buildReadUrl } from '../utils/reader'

const route = useRoute()
const router = useRouter()
const scriptoria = useScriptoriaStore()

const isLoading = ref(true)
const isSaving = ref(false)
const isPublishing = ref(false)
const isCompleting = ref(false)
const confirmState = ref({
    open: false,
    message: '',
    confirmLabel: 'Ya',
    cancelLabel: 'Batal',
})
const error = ref('')
const message = ref('')
const documentState = ref({
    chapters: [],
    publishedAt: null,
    updatedAt: '',
})
const hasUnsavedChanges = ref(false)
const lastSavedSignature = ref('')
const selectedChapterId = ref('')
const chapterContentRef = ref(null)
const wordImportInputRef = ref(null)
const isHydratingDocument = ref(false)

let messageTimer = 0
let confirmResolver = null

const storyId = computed(() => String(route.params.id || '').trim())
const story = computed(() => scriptoria.stories.find((entry) => entry.id === storyId.value) || null)

const selectedChapter = computed(() => {
    return documentState.value.chapters.find((chapter) => chapter.id === selectedChapterId.value) || null
})

const totalWords = computed(() => {
    const text = documentState.value.chapters
        .map((chapter) => `${chapter.title || ''}\n${chapter.content || ''}`)
        .join('\n\n')
        .trim()

    if (!text) return 0
    return text.split(/\s+/).filter(Boolean).length
})

const shareLink = computed(() => {
    if (!storyId.value) return ''

    const targetStory = story.value || {
        id: storyId.value,
        title: `novel-${storyId.value.slice(0, 8)}`,
    }

    return buildReadUrl(targetStory, 1)
})

function setMessage(next, timeout = 2200) {
    clearTimeout(messageTimer)
    message.value = next
    if (timeout > 0) {
        messageTimer = window.setTimeout(() => {
            if (message.value === next) {
                message.value = ''
            }
        }, timeout)
    }
}

function askConfirm(messageText, { confirmLabel = 'Ya', cancelLabel = 'Batal' } = {}) {
    if (confirmResolver) {
        confirmResolver(false)
        confirmResolver = null
    }

    confirmState.value = {
        open: true,
        message: String(messageText || ''),
        confirmLabel,
        cancelLabel,
    }

    return new Promise((resolve) => {
        confirmResolver = resolve
    })
}

function resolveConfirmChoice(confirmed) {
    if (confirmResolver) {
        confirmResolver(Boolean(confirmed))
        confirmResolver = null
    }
    confirmState.value.open = false
}

function buildDocumentSignature(document) {
    const source = Array.isArray(document?.chapters) ? document.chapters : []
    const compact = source.map((chapter) => ({
        id: String(chapter?.id || ''),
        title: String(chapter?.title || ''),
        content: String(chapter?.content || ''),
    }))
    return JSON.stringify(compact)
}

function refreshUnsavedFlag() {
    if (isLoading.value || isHydratingDocument.value) return
    hasUnsavedChanges.value = buildDocumentSignature(documentState.value) !== lastSavedSignature.value
}

function normalizeLineBreaks(text) {
    return String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function sanitizeFileName(rawName, fallback = 'novel') {
    const base = String(rawName || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80)
    return base || fallback
}

function escapeHtml(raw) {
    return String(raw || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

function buildWordHtmlFromDocument(document) {
    const chapters = Array.isArray(document?.chapters) ? document.chapters : []
    const chapterBlocks = chapters.map((chapter) => {
        const chapterTitle = escapeHtml(String(chapter?.title || '').trim() || 'Bab')
        const lines = normalizeLineBreaks(chapter?.content || '')
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)

        const paragraphs = lines.length
            ? lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('\n')
            : '<p><em>(Kosong)</em></p>'

        return `
          <section>
            <h2>${chapterTitle}</h2>
            ${paragraphs}
          </section>
        `
    })

    return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Export Bab</title>
    <style>
      body { font-family: Calibri, Arial, sans-serif; line-height: 1.6; padding: 24px; }
      h1 { margin: 0 0 6px; }
      h2 { margin-top: 28px; margin-bottom: 8px; }
      p { margin: 0 0 10px; white-space: pre-wrap; }
      .meta { color: #666; font-size: 12px; margin-bottom: 14px; }
      section { page-break-inside: avoid; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(story.value?.title || 'Novel')}</h1>
    <p class="meta">Export dari Scriptoria • ${new Date().toLocaleString('id-ID')}</p>
    ${chapterBlocks.join('\n')}
  </body>
</html>`
}

function stripChapterHeadingLines(text) {
    return normalizeLineBreaks(text)
        .split('\n')
        .filter((line) => {
            const clean = String(line || '').trim()
            if (!clean) return true
            return !/^bab\s*\d+([:\-.\s].*)?$/i.test(clean)
        })
        .join('\n')
        .trim()
}

function extractTextFromHtmlLikeInput(raw) {
    const parser = new DOMParser()
    const doc = parser.parseFromString(String(raw || ''), 'text/html')
    return normalizeLineBreaks(doc.body?.innerText || doc.body?.textContent || '')
}

async function exportDocumentToWord() {
    const chapters = Array.isArray(documentState.value?.chapters) ? documentState.value.chapters : []
    if (!chapters.length) {
        error.value = 'Belum ada bab untuk di-export.'
        return
    }

    const html = buildWordHtmlFromDocument(documentState.value)
    const blob = new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' })
    const link = document.createElement('a')
    const storySlug = sanitizeFileName(story.value?.title, `novel-${storyId.value.slice(0, 8)}`)
    const url = URL.createObjectURL(blob)
    link.href = url
    link.download = `${storySlug}-chapters.doc`
    link.click()
    URL.revokeObjectURL(url)
    setMessage('Export Word berhasil (judul bab + isi).')
}

function openImportWordPicker() {
    if (!selectedChapter.value) {
        error.value = 'Pilih bab dulu sebelum import.'
        return
    }
    wordImportInputRef.value?.click()
}

async function onImportWordFilePicked(event) {
    const file = event?.target?.files?.[0]
    event.target.value = ''
    if (!file || !selectedChapter.value) return

    const fileName = String(file.name || '').toLowerCase()
    if (fileName.endsWith('.docx')) {
        error.value = 'Import .docx belum didukung langsung. Simpan dulu dari Word ke format .doc atau .txt.'
        return
    }

    try {
        const raw = await file.text()
        const extracted = /<\/?[a-z][\s\S]*>/i.test(raw) ? extractTextFromHtmlLikeInput(raw) : normalizeLineBreaks(raw)
        const contentOnly = stripChapterHeadingLines(extracted)

        if (!contentOnly.trim()) {
            error.value = 'Isi file tidak terbaca atau kosong.'
            return
        }

        const confirmed = await askConfirm(
            `Import ke "${selectedChapter.value.title}" akan mengganti isi bab saat ini. Lanjutkan?`,
            { confirmLabel: 'Ya, import', cancelLabel: 'Batal' }
        )
        if (!confirmed) return

        selectedChapter.value.content = contentOnly
        setMessage('Import Word berhasil (hanya isi cerita).')
    } catch {
        error.value = 'Gagal membaca file Word.'
    }
}

function normalizeChapter(chapter, index) {
    const id = String(chapter?.id || '').trim() || crypto.randomUUID()
    const title = String(chapter?.title || '').trim() || `Bab ${index + 1}`
    const content = String(chapter?.content || '').replace(/\r\n/g, '\n')
    return { id, title, content }
}

function applyDocument(document) {
    isHydratingDocument.value = true
    const chapters = Array.isArray(document?.chapters) ? document.chapters.map(normalizeChapter) : []
    if (!chapters.length) {
        chapters.push({ id: crypto.randomUUID(), title: 'Bab 1', content: '' })
    }

    documentState.value = {
        chapters,
        publishedAt: document?.publishedAt || null,
        updatedAt: document?.updatedAt || '',
    }

    if (!chapters.some((chapter) => chapter.id === selectedChapterId.value)) {
        selectedChapterId.value = chapters[0].id
    }

    lastSavedSignature.value = buildDocumentSignature(documentState.value)
    hasUnsavedChanges.value = false
    isHydratingDocument.value = false
}

async function loadDocument() {
    isLoading.value = true
    error.value = ''

    if (!storyId.value) {
        error.value = 'ID cerita tidak valid.'
        isLoading.value = false
        return
    }

    const result = await scriptoria.fetchStoryDocument(storyId.value, { force: true })
    if (!result.ok) {
        error.value = result.message
        isLoading.value = false
        return
    }

    applyDocument(result.document)
    isLoading.value = false
}

function addChapter() {
    const next = {
        id: crypto.randomUUID(),
        title: `Bab ${documentState.value.chapters.length + 1}`,
        content: '',
    }

    documentState.value.chapters.push(next)
    selectedChapterId.value = next.id
}

function removeChapter(chapterId) {
    if (documentState.value.chapters.length <= 1) return

    const index = documentState.value.chapters.findIndex((chapter) => chapter.id === chapterId)
    if (index < 0) return

    documentState.value.chapters.splice(index, 1)

    if (selectedChapterId.value === chapterId) {
        const fallback = documentState.value.chapters[Math.max(0, index - 1)] || documentState.value.chapters[0]
        selectedChapterId.value = fallback.id
    }
}

function focusEditorWithSelection(start, end = start) {
    const textarea = chapterContentRef.value
    if (!textarea) return

    window.requestAnimationFrame(() => {
        textarea.focus()
        textarea.setSelectionRange(start, end)
    })
}

function wrapSelection(prefix, suffix, placeholder) {
    if (!selectedChapter.value) return

    const textarea = chapterContentRef.value
    const current = String(selectedChapter.value.content || '')

    if (!textarea) {
        selectedChapter.value.content = `${current}${prefix}${placeholder}${suffix}`
        return
    }

    const start = textarea.selectionStart ?? current.length
    const end = textarea.selectionEnd ?? current.length
    const selectedText = current.slice(start, end)
    const body = selectedText || placeholder
    const next = `${current.slice(0, start)}${prefix}${body}${suffix}${current.slice(end)}`

    selectedChapter.value.content = next
    const nextStart = start + prefix.length
    const nextEnd = nextStart + body.length
    focusEditorWithSelection(nextStart, nextEnd)
}

async function saveDocument({ force = false, withMessage = true } = {}) {
    if (!storyId.value) return

    isSaving.value = true
    error.value = ''

    const result = await scriptoria.saveStoryDocument(storyId.value, documentState.value, { force })
    isSaving.value = false

    if (!result.ok) {
        if (result.needsForce && !force) {
            const meta = result.conflictMeta || {}
            const confirmed = await askConfirm(
                `${result.message}\n\nBab server: ${meta.existingChapterCount || 0}\nBab yang akan disimpan: ${meta.incomingChapterCount || 0}\n\nLanjut timpa data lama?`,
                { confirmLabel: 'Ya, timpa data', cancelLabel: 'Batal' }
            )
            if (confirmed) {
                return saveDocument({ force: true, withMessage })
            }
        }
        error.value = result.message
        return false
    }

    applyDocument(result.document)
    if (withMessage) {
        setMessage(result.message || 'Konten cerita tersimpan.')
    }
    return true
}

async function publishStory() {
    if (!storyId.value) return

    const hasCover = String(story.value?.coverImage || '').trim().length > 0
    if (!hasCover) {
        error.value = 'Cover wajib di-upload sebelum cerita dipublikasikan.'
        return
    }

    isPublishing.value = true
    error.value = ''

    const saveResult = await saveDocument({ withMessage: false })
    if (!saveResult) {
        isPublishing.value = false
        return
    }

    const publishResult = await scriptoria.publishStory(storyId.value, 'Publish dari editor Scriptoria.')
    isPublishing.value = false

    if (!publishResult.ok) {
        error.value = publishResult.message
        return
    }

    await loadDocument()
    setMessage(publishResult.message || 'Cerita berhasil dipublikasikan.')
}

async function markAsCompleted() {
    if (!storyId.value || !story.value) return

    const hasCover = String(story.value?.coverImage || '').trim().length > 0
    if (!hasCover) {
        error.value = 'Cover wajib di-upload sebelum cerita ditandai Completed.'
        return
    }

    const confirmText = story.value.status === 'Published'
        ? 'Tandai novel ini sebagai Completed (Tamat)?'
        : `Status saat ini "${story.value.status}". Ubah ke Completed (Tamat)?`
    const confirmed = await askConfirm(confirmText, { confirmLabel: 'Ya, tandai tamat', cancelLabel: 'Batal' })
    if (!confirmed) return

    isCompleting.value = true
    error.value = ''

    const saveResult = await saveDocument({ withMessage: false })
    if (!saveResult) {
        isCompleting.value = false
        return
    }

    const result = await scriptoria.updateStory(storyId.value, { status: 'Completed' })
    isCompleting.value = false

    if (!result.ok) {
        error.value = result.message
        return
    }

    setMessage('Novel berhasil ditandai sebagai Completed (Tamat).')
}

async function copyShareLink() {
    if (!shareLink.value) return
    try {
        await navigator.clipboard.writeText(shareLink.value)
        setMessage('Link publik berhasil disalin.')
    } catch {
        setMessage('Gagal menyalin link. Salin manual dari field.', 2800)
    }
}

onMounted(() => {
    window.addEventListener('beforeunload', handleBeforeUnload)
    void loadDocument()
})

onBeforeUnmount(() => {
    window.removeEventListener('beforeunload', handleBeforeUnload)
    clearTimeout(messageTimer)
    if (confirmResolver) {
        confirmResolver(false)
        confirmResolver = null
    }
})

watch(
    () => documentState.value.chapters,
    () => {
        refreshUnsavedFlag()
    },
    { deep: true }
)

onBeforeRouteLeave(async (_to, _from, next) => {
    if (!hasUnsavedChanges.value || isSaving.value || isPublishing.value || isCompleting.value) {
        next()
        return
    }

    const leave = await askConfirm('Ada perubahan yang belum disimpan. Tetap keluar dari editor?', {
        confirmLabel: 'Keluar',
        cancelLabel: 'Tetap di Editor',
    })
    next(leave)
})

function handleBeforeUnload(event) {
    if (!hasUnsavedChanges.value || isSaving.value || isPublishing.value || isCompleting.value) return
    event.preventDefault()
    event.returnValue = ''
}
</script>

<template>
    <section class="space-y-4">
        <Transition
            enter-active-class="transition duration-200 ease-out"
            enter-from-class="-translate-y-4 opacity-0"
            enter-to-class="translate-y-0 opacity-100"
            leave-active-class="transition duration-150 ease-in"
            leave-from-class="translate-y-0 opacity-100"
            leave-to-class="-translate-y-4 opacity-0"
        >
            <div v-if="confirmState.open" class="fixed inset-x-0 top-3 z-[90] flex justify-center px-4">
                <div class="alert alert-warning max-w-2xl shadow-xl">
                    <span>{{ confirmState.message }}</span>
                    <div class="flex gap-2">
                        <button type="button" class="btn btn-xs btn-ghost" @click="resolveConfirmChoice(false)">
                            {{ confirmState.cancelLabel }}
                        </button>
                        <button type="button" class="btn btn-xs btn-primary" :disabled="isCompleting" @click="resolveConfirmChoice(true)">
                            {{ confirmState.confirmLabel }}
                        </button>
                    </div>
                </div>
            </div>
        </Transition>

        <header class="reveal-up flex flex-wrap items-center justify-between gap-2">
            <div>
                <h1 class="text-2xl font-bold md:text-3xl">Editor Bab</h1>
                <p class="text-sm opacity-70">{{ story ? story.title : 'Memuat cerita...' }}</p>
            </div>
            <div class="flex gap-2">
                <button class="btn btn-ghost btn-sm" @click="router.push({ name: 'stories' })">
                    <i class="bi bi-arrow-left"></i>
                    Kembali
                </button>
            </div>
        </header>

        <div v-if="error" class="alert alert-error">
            <span>{{ error }}</span>
        </div>

        <div v-if="message" class="alert alert-success">
            <span>{{ message }}</span>
        </div>

        <section v-if="!isLoading" class="grid gap-4 lg:grid-cols-[280px_1fr]">
            <aside class="card border border-base-300 bg-base-100 shadow-sm">
                <div class="card-body gap-3">
                    <div class="flex items-center justify-between">
                        <h2 class="font-semibold">Daftar Bab</h2>
                        <button class="btn btn-xs btn-outline" @click="addChapter">
                            <i class="bi bi-plus"></i>
                            Tambah
                        </button>
                    </div>

                    <div class="space-y-2 max-h-ful overflow-y-auto pr-1">
                        <div v-for="chapter in documentState.chapters" :key="chapter.id"
                            class="w-full rounded-lg border px-3 py-2 text-sm transition"
                            :class="chapter.id === selectedChapterId ? 'border-primary bg-primary/8' : 'border-base-300 bg-base-100 hover:bg-base-200/60'">
                            <div class="flex items-center justify-between gap-2">
                                <button type="button" class="min-w-0 flex-1 truncate text-left font-medium"
                                    @click="selectedChapterId = chapter.id">
                                    {{ chapter.title }}
                                </button>
                                <button type="button" class="btn btn-ghost btn-xs"
                                    :disabled="documentState.chapters.length <= 1" @click="removeChapter(chapter.id)">
                                    <i class="bi bi-trash3"></i>
                                </button>
                            </div>
                        </div>
                    </div>

                    <div class="rounded-xl border border-base-300 bg-base-200/60 p-3 text-xs">
                        <p>Total kata dokumen: <strong>{{ totalWords }}</strong></p>
                        <p>Status cerita: <strong>{{ story?.status || 'Draft' }}</strong></p>
                        <p v-if="hasUnsavedChanges" class="text-warning">Perubahan belum disimpan.</p>
                    </div>
                </div>
            </aside>

            <main class="card border border-base-300 bg-base-100 shadow-sm">
                <div class="card-body gap-3">
                    <input
                        ref="wordImportInputRef"
                        type="file"
                        class="hidden"
                        accept=".doc,.txt,.html,.htm,.docx"
                        @change="onImportWordFilePicked"
                    />
                    <section v-if="selectedChapter" class="space-y-3">
                        <fieldset class="fieldset">
                            <legend class="fieldset-legend">Judul Bab</legend>
                            <input
                                v-model="selectedChapter.title"
                                type="text"
                                class="input input-bordered w-full"
                                placeholder="Ketik judul bab di sini"
                            />
                            <p class="label">Opsional, bisa diganti kapan saja</p>
                        </fieldset>

                        <div
                            class="flex flex-wrap items-center gap-2 rounded-xl border border-base-300 bg-base-200/60 p-2">
                            <button class="btn btn-xs btn-outline" type="button"
                                @click="wrapSelection('**', '**', 'teks tebal')">
                                <i class="bi bi-type-bold"></i>
                                Bold
                            </button>
                            <button class="btn btn-xs btn-outline" type="button"
                                @click="wrapSelection('*', '*', 'teks miring')">
                                <i class="bi bi-type-italic"></i>
                                Italic
                            </button>
                        </div>

                        <fieldset class="fieldset">
                            <legend class="fieldset-legend">Isi Cerita</legend>
                            <textarea
                                ref="chapterContentRef"
                                v-model="selectedChapter.content"
                                class="textarea textarea-bordered min-h-[420px] w-full text-base leading-relaxed"
                                placeholder="Tulis cerita kamu di sini..."
                            ></textarea>
                            <p class="label">Gunakan tombol Bold/Italic jika dibutuhkan</p>
                        </fieldset>
                    </section>

                    <div class="flex flex-wrap items-center justify-between gap-3">
                        <div class="flex flex-wrap gap-2">
                            <button
                                class="btn btn-outline btn-sm"
                                :disabled="isSaving || isPublishing || isCompleting"
                                @click="exportDocumentToWord"
                            >
                                <i class="bi bi-file-earmark-word"></i>
                                Export Word
                            </button>
                            <button
                                class="btn btn-outline btn-sm"
                                :disabled="isSaving || isPublishing || isCompleting || !selectedChapter"
                                @click="openImportWordPicker"
                            >
                                <i class="bi bi-file-earmark-arrow-up"></i>
                                Import Word
                            </button>
                        </div>

                        <div class="flex flex-wrap justify-end gap-3">
                        <button class="btn btn-primary" :disabled="isSaving || isPublishing || isCompleting" @click="saveDocument">
                            <span v-if="isSaving" class="loading loading-spinner loading-xs"></span>
                            Simpan
                        </button>
                        <button class="btn btn-success" :disabled="isPublishing || isSaving || isCompleting" @click="publishStory">
                            <span v-if="isPublishing" class="loading loading-spinner loading-xs"></span>
                            Publish
                        </button>
                        <button
                            class="btn btn-accent"
                            :disabled="isCompleting || isSaving || isPublishing || story?.status === 'Completed'"
                            @click="markAsCompleted"
                        >
                            <span v-if="isCompleting" class="loading loading-spinner loading-xs text-info"></span>
                            {{ story?.status === 'Completed' ? 'Sudah Tamat' : 'Tandai Tamat' }}
                        </button>
                        </div>
                    </div>
                </div>
            </main>
        </section>

        <section v-else class="card border border-base-300 bg-base-100 shadow-sm">
            <div class="card-body">
                <div class="flex items-center gap-2 text-sm opacity-70">
                    <span class="loading loading-spinner loading-sm"></span>
                    Memuat dokumen cerita...
                </div>
            </div>
        </section>
    </section>
</template>
