<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useScriptoriaStore } from '../stores/scriptoria'

const scriptoria = useScriptoriaStore()
const MAX_IMPORT_SIZE_BYTES = 5 * 1024 * 1024
const MAX_IMPORT_STORIES = 5000
const MAX_IMPORT_ACTIVITIES = 20000

const form = reactive({
  defaultGenre: scriptoria.preferences.defaultGenre,
  defaultStatus: scriptoria.preferences.defaultStatus,
  editorFontSize: scriptoria.preferences.editorFontSize,
  publishVisibility: scriptoria.preferences.publishVisibility,
})

const savedMessage = ref('')
const saveError = ref('')
const dataMessage = ref('')
const dataError = ref('')
const isProcessingData = ref(false)
const importInputRef = ref(null)
const confirmState = ref({
  open: false,
  message: '',
  confirmLabel: 'Lanjutkan',
  cancelLabel: 'Batal',
})
let messageTimer = 0
let confirmResolver = null

watch(
  () => scriptoria.preferences,
  (next) => {
    form.defaultGenre = next.defaultGenre
    form.defaultStatus = next.defaultStatus
    form.editorFontSize = next.editorFontSize
    form.publishVisibility = next.publishVisibility
  },
  { deep: true }
)

const hasChanges = computed(() => {
  return (
    form.defaultGenre !== scriptoria.preferences.defaultGenre ||
    form.defaultStatus !== scriptoria.preferences.defaultStatus ||
    form.editorFontSize !== scriptoria.preferences.editorFontSize ||
    form.publishVisibility !== scriptoria.preferences.publishVisibility
  )
})

watch(
  () => [form.defaultGenre, form.defaultStatus, form.editorFontSize, form.publishVisibility],
  () => {
    if (savedMessage.value) savedMessage.value = ''
    if (saveError.value) saveError.value = ''
  }
)

onBeforeUnmount(() => {
  clearTimeout(messageTimer)
  if (confirmResolver) {
    confirmResolver(false)
    confirmResolver = null
  }
})

function setDataNotice(message, type = 'success') {
  clearTimeout(messageTimer)
  if (type === 'error') {
    dataError.value = message
    dataMessage.value = ''
  } else {
    dataMessage.value = message
    dataError.value = ''
  }

  messageTimer = window.setTimeout(() => {
    dataMessage.value = ''
    dataError.value = ''
  }, 2800)
}

function askConfirm(messageText, { confirmLabel = 'Lanjutkan', cancelLabel = 'Batal' } = {}) {
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

function resolveConfirm(confirmed) {
  if (confirmResolver) {
    confirmResolver(Boolean(confirmed))
    confirmResolver = null
  }
  confirmState.value.open = false
}

function buildExportRows() {
  const storyRows = scriptoria.stories.map((story) => ({
    title: story.title,
    genre: story.genre,
    status: story.status,
    words: story.words,
    targetWords: story.targetWords,
    summary: story.summary || '',
    audience: story.audience || '',
    coverImage: story.coverImage || '',
    updatedAt: story.updatedAt,
  }))

  return { storyRows }
}

function escapeCsvCell(value) {
  const text = String(value ?? '')
  if (!/[",\n\r]/.test(text)) return text
  return `"${text.replace(/"/g, '""')}"`
}

function rowsToCsv(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return ''

  const headers = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row || {}).forEach((key) => set.add(key))
      return set
    }, new Set())
  )

  const lines = [
    headers.map((header) => escapeCsvCell(header)).join(','),
    ...rows.map((row) => headers.map((header) => escapeCsvCell(row?.[header] ?? '')).join(',')),
  ]

  return lines.join('\n')
}

function parseCsvMatrix(text) {
  const input = String(text || '')
  const rows = []
  let row = []
  let cell = ''
  let inQuotes = false

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]
    const nextChar = input[i + 1]

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        cell += '"'
        i += 1
      } else if (char === '"') {
        inQuotes = false
      } else {
        cell += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
      continue
    }

    if (char === ',') {
      row.push(cell)
      cell = ''
      continue
    }

    if (char === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      continue
    }

    if (char === '\r') {
      continue
    }

    cell += char
  }

  row.push(cell)
  rows.push(row)

  return rows.filter((entry) => entry.some((value) => String(value || '').trim()))
}

function csvTextToObjects(text) {
  const matrix = parseCsvMatrix(text)
  if (!matrix.length) return []

  const headers = matrix[0].map((header) => String(header || '').trim())
  return matrix.slice(1).map((values) => {
    const row = {}
    headers.forEach((header, index) => {
      row[header || `column_${index + 1}`] = values[index] ?? ''
    })
    return row
  })
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

async function exportWorkspace(format = 'json') {
  isProcessingData.value = true
  try {
    const date = new Date().toISOString().slice(0, 10)

    if (format === 'json') {
      const json = scriptoria.exportWorkspace()
      downloadBlob(new Blob([json], { type: 'application/json' }), `scriptoria-workspace-${date}.json`)
      setDataNotice('Export JSON berhasil.')
      return
    }

    const { storyRows } = buildExportRows()

    if (format === 'csv') {
      const csv = rowsToCsv(storyRows)
      downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `scriptoria-stories-${date}.csv`)
      setDataNotice('Export CSV berhasil.')
      return
    }

    setDataNotice('Format export tidak dikenali.', 'error')
  } catch {
    setDataNotice('Gagal export data workspace.', 'error')
  } finally {
    isProcessingData.value = false
  }
}

function normalizeKey(rawKey) {
  return String(rawKey || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '')
}

function pickValue(row, aliases) {
  const entries = Object.entries(row || {})
  const found = entries.find(([key]) => aliases.includes(normalizeKey(key)))
  return found ? found[1] : undefined
}

function mapStoryRows(rows) {
  return rows.map((row) => ({
    title: pickValue(row, ['title', 'judul', 'name']),
    genre: pickValue(row, ['genre', 'kategori', 'category']),
    status: pickValue(row, ['status']),
    words: pickValue(row, ['words', 'jumlahkata', 'wordcount', 'stock']),
    targetWords: pickValue(row, ['targetwords', 'targetkata', 'goalwords', 'minstock']),
    summary: pickValue(row, ['summary', 'ringkasan', 'sinopsis', 'source']),
    audience: pickValue(row, ['audience', 'targetpembaca', 'supplier']),
    coverImage: pickValue(row, ['coverimage', 'cover', 'image', 'thumbnail']),
    updatedAt: pickValue(row, ['updatedat', 'lastupdate', 'tanggalupdate']),
  }))
}

async function performImportFile(file) {
  try {
    const filename = file.name.toLowerCase()
    let payload = null

    if (filename.endsWith('.json')) {
      payload = JSON.parse(await file.text())
    } else if (filename.endsWith('.csv')) {
      const storyRows = mapStoryRows(csvTextToObjects(await file.text()))
      payload = {
        stories: storyRows,
        activities: [],
      }
    } else {
      setDataNotice('Format file belum didukung. Gunakan JSON atau CSV.', 'error')
      return
    }

    if (Array.isArray(payload?.stories) && payload.stories.length > MAX_IMPORT_STORIES) {
      setDataNotice(`Import ditolak: maksimal ${MAX_IMPORT_STORIES} baris cerita.`, 'error')
      return
    }

    if (Array.isArray(payload?.activities) && payload.activities.length > MAX_IMPORT_ACTIVITIES) {
      setDataNotice(`Import ditolak: maksimal ${MAX_IMPORT_ACTIVITIES} baris riwayat.`, 'error')
      return
    }

    const result = await scriptoria.importWorkspace(payload)
    setDataNotice(result.message, result.ok ? 'success' : 'error')
  } catch {
    setDataNotice('Gagal membaca file backup.', 'error')
  }
}

function openImportPicker() {
  importInputRef.value?.click()
}

async function onImportFilePicked(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return

  if (file.size > MAX_IMPORT_SIZE_BYTES) {
    setDataNotice(`Ukuran file terlalu besar. Maksimal ${Math.floor(MAX_IMPORT_SIZE_BYTES / (1024 * 1024))}MB.`, 'error')
    return
  }

  const agreed = await askConfirm(
    'Import akan menimpa data cerita, riwayat, dan preferensi saat ini. Lanjutkan?',
    { confirmLabel: 'Ya, Import', cancelLabel: 'Batal' }
  )
  if (!agreed) return

  isProcessingData.value = true
  try {
    await performImportFile(file)
  } finally {
    isProcessingData.value = false
  }
}

async function restoreAutoBackup() {
  const agreed = await askConfirm(
    'Pulihkan auto-backup terakhir? Data saat ini akan diganti.',
    { confirmLabel: 'Ya, Pulihkan', cancelLabel: 'Batal' }
  )
  if (!agreed) return

  isProcessingData.value = true
  try {
    const result = await scriptoria.restoreAutoBackup()
    setDataNotice(result.message, result.ok ? 'success' : 'error')
  } finally {
    isProcessingData.value = false
  }
}

async function save() {
  if (!String(form.defaultGenre || '').trim()) {
    saveError.value = 'Genre default tidak boleh kosong.'
    return
  }

  const result = await scriptoria.updatePreferences({
    defaultGenre: String(form.defaultGenre || '').trim(),
    defaultStatus: form.defaultStatus,
    editorFontSize: form.editorFontSize,
    publishVisibility: form.publishVisibility,
  })

  if (!result.ok) {
    saveError.value = result.message
    savedMessage.value = ''
    return
  }

  saveError.value = ''
  savedMessage.value = result.message || 'Preferensi berhasil disimpan.'
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
            <button type="button" class="btn btn-xs btn-ghost" @click="resolveConfirm(false)">
              {{ confirmState.cancelLabel }}
            </button>
            <button type="button" class="btn btn-xs btn-primary" @click="resolveConfirm(true)">
              {{ confirmState.confirmLabel }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <header class="reveal-up">
      <h1 class="text-2xl font-bold md:text-3xl">Pengaturan Scriptoria</h1>
      <p class="text-sm opacity-70">Atur pengalaman menulis dan kelola backup workspace dari satu tempat.</p>
    </header>

    <div class="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
      <section class="card interactive-card border border-base-300 bg-base-100 shadow-sm reveal-up" style="--delay: 80ms;">
        <div class="card-body">
          <h2 class="card-title">Preferensi Workspace</h2>
          <p class="text-sm opacity-70">Pengaturan ini dipakai sebagai default saat membuat cerita baru.</p>

          <div class="grid gap-3 md:grid-cols-2">
            <label class="form-control">
              <div class="label"><span class="label-text">Genre Default</span></div>
              <input v-model="form.defaultGenre" class="input input-bordered" placeholder="Fiksi, Romance" />
              <div class="label pt-1">
                <span class="label-text-alt">Bisa lebih dari satu, pisahkan dengan koma.</span>
              </div>
            </label>

            <label class="form-control">
              <div class="label"><span class="label-text">Status Awal</span></div>
              <select v-model="form.defaultStatus" class="select select-bordered">
                <option>Draft</option>
                <option>Review</option>
                <option>Published</option>
                <option>Archived</option>
              </select>
            </label>
          </div>

          <div class="grid gap-3 md:grid-cols-2">
            <label class="form-control">
              <div class="label"><span class="label-text">Ukuran Teks Editor</span></div>
              <select v-model="form.editorFontSize" class="select select-bordered">
                <option value="sm">Kecil</option>
                <option value="base">Sedang</option>
                <option value="lg">Besar</option>
              </select>
            </label>

            <label class="form-control">
              <div class="label"><span class="label-text">Visibilitas Publish</span></div>
              <select v-model="form.publishVisibility" class="select select-bordered">
                <option value="public">Publik</option>
                <option value="community">Komunitas</option>
                <option value="private">Privat</option>
              </select>
            </label>
          </div>

          <div class="rounded-xl border border-base-300 bg-base-200 p-3 text-sm">
            <p class="mb-1 font-medium">Ringkasan Default</p>
            <p>- Cerita baru: <strong>{{ form.defaultGenre }}</strong> | status <strong>{{ form.defaultStatus }}</strong></p>
            <p>- Editor: ukuran font <strong>{{ form.editorFontSize }}</strong></p>
            <p>- Visibilitas publish: <strong>{{ form.publishVisibility }}</strong></p>
          </div>

          <div class="card-actions items-center justify-between">
            <p class="text-xs opacity-70">{{ hasChanges ? 'Ada perubahan belum disimpan.' : 'Tidak ada perubahan.' }}</p>
            <button class="btn btn-primary" :disabled="!hasChanges" @click="save">Simpan Preferensi</button>
          </div>
          <p v-if="saveError" class="text-sm text-error">{{ saveError }}</p>
          <p v-if="savedMessage" class="text-sm text-success">{{ savedMessage }}</p>
        </div>
      </section>

      <aside class="card border border-base-300 bg-base-100 shadow-sm reveal-up" style="--delay: 150ms;">
        <div class="card-body">
          <h3 class="card-title text-base">Tips Cepat</h3>
          <ul class="space-y-2 text-sm opacity-80">
            <li>Gunakan status <strong>Draft</strong> untuk menulis bebas tanpa tekanan publish.</li>
            <li>Pindahkan ke <strong>Review</strong> saat struktur cerita mulai stabil.</li>
            <li>Gunakan <strong>Completed</strong> saat novel sudah tamat agar tampil di rak Novel Selesai.</li>
            <li>Lakukan backup rutin setiap selesai revisi besar.</li>
          </ul>

          <div class="rounded-lg border border-base-300 bg-base-200 p-3 text-xs opacity-80">
            Tip: simpan backup JSON untuk arsip lengkap, CSV untuk rekap cepat cerita.
          </div>
        </div>
      </aside>
    </div>

    <section id="data-workspace" class="card border border-base-300 bg-base-100 shadow-sm reveal-up" style="--delay: 190ms;">
      <div class="card-body gap-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="card-title">
            <i class="bi bi-database text-primary"></i>
            Data Workspace
          </h2>
          <span class="badge badge-outline">Backup & Restore</span>
        </div>

        <p class="text-sm opacity-75">Kelola export/import workspace langsung dari halaman pengaturan.</p>

        <input
          ref="importInputRef"
          type="file"
          class="hidden"
          accept=".json,.csv,application/json,text/csv"
          @change="onImportFilePicked"
        />

        <div class="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <button class="btn btn-outline" :disabled="isProcessingData" @click="exportWorkspace('json')">
            <i class="bi bi-filetype-json"></i>
            Export JSON
          </button>
          <button class="btn btn-outline" :disabled="isProcessingData" @click="exportWorkspace('csv')">
            <i class="bi bi-filetype-csv"></i>
            Export CSV
          </button>
          <button class="btn btn-primary" :disabled="isProcessingData" @click="openImportPicker">
            <i class="bi bi-upload"></i>
            Import File
          </button>
          <button class="btn btn-warning" :disabled="isProcessingData" @click="restoreAutoBackup">
            <i class="bi bi-clock-history"></i>
            Restore Backup
          </button>
        </div>

        <p v-if="dataMessage" class="text-sm text-success">{{ dataMessage }}</p>
        <p v-if="dataError" class="text-sm text-error">{{ dataError }}</p>
      </div>
    </section>

    <section id="panduan" class="card border border-info/35 bg-gradient-to-br from-base-100 to-info/10 shadow-sm reveal-up" style="--delay: 210ms;">
      <div class="card-body gap-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="card-title">
            <i class="bi bi-journal-check text-info"></i>
            Panduan Workflow Scriptoria
          </h2>
          <span class="badge badge-info">Quick Guide</span>
        </div>

        <div class="grid gap-3 md:grid-cols-2">
          <div class="rounded-xl border border-info/25 bg-base-100/80 p-3 text-sm">
            <p class="font-semibold flex items-center gap-2"><span class="badge badge-info badge-sm">1</span>Buat Cerita</p>
            <p class="mt-1 opacity-80">Masuk ke menu <strong>Cerita</strong>, isi judul, genre, ringkasan, dan cover.</p>
          </div>
          <div class="rounded-xl border border-info/25 bg-base-100/80 p-3 text-sm">
            <p class="font-semibold flex items-center gap-2"><span class="badge badge-info badge-sm">2</span>Tulis per Bab</p>
            <p class="mt-1 opacity-80">Buka editor untuk menyusun bab, lalu simpan progres secara berkala.</p>
          </div>
          <div class="rounded-xl border border-info/25 bg-base-100/80 p-3 text-sm">
            <p class="font-semibold flex items-center gap-2"><span class="badge badge-info badge-sm">3</span>Publikasikan</p>
            <p class="mt-1 opacity-80">Setelah siap, publish cerita dan bagikan link bacanya ke pembaca.</p>
          </div>
          <div class="rounded-xl border border-info/25 bg-base-100/80 p-3 text-sm">
            <p class="font-semibold flex items-center gap-2"><span class="badge badge-info badge-sm">4</span>Backup Rutin</p>
            <p class="mt-1 opacity-80">Gunakan menu data workspace di atas untuk export/import kapan saja.</p>
          </div>
        </div>
      </div>
    </section>
  </section>
</template>
