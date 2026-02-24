<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TopNavbar from '../components/scriptoria/TopNavbar.vue'
import { useScriptoriaStore } from '../stores/scriptoria'
import { useAuthStore } from '../stores/auth'

const scriptoria = useScriptoriaStore()
const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const theme = ref('scriptorialight')
const THEME_STORAGE_KEY = 'scriptoria-theme-v1'
const SESSION_CHECK_INTERVAL_MS = 30 * 1000
const ACTIVITY_TOUCH_INTERVAL_MS = 15 * 1000
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'mousedown']

const toast = ref({ show: false, type: 'info', message: '' })
const confirmState = ref({
  open: false,
  title: '',
  message: '',
  confirmText: 'Lanjutkan',
  confirmClass: 'btn-primary',
  onConfirm: null,
})

let toastTimer = 0
let sessionWatcherTimer = 0
let lastActivityTouchAt = 0

function showToast(message, type = 'info') {
  toast.value = { show: true, type, message }
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.value.show = false
  }, 2600)
}

function openConfirm({ title, message, confirmText = 'Lanjutkan', confirmClass = 'btn-primary', onConfirm }) {
  confirmState.value = {
    open: true,
    title,
    message,
    confirmText,
    confirmClass,
    onConfirm,
  }
}

function closeConfirm() {
  confirmState.value.open = false
}

async function runConfirm() {
  try {
    if (typeof confirmState.value.onConfirm === 'function') {
      await confirmState.value.onConfirm()
    }
  } finally {
    closeConfirm()
  }
}

onMounted(() => {
  void initializeAuthSession()
})

async function initializeAuthSession() {
  const hasSession = await auth.ensureSessionValid()
  if (!hasSession) {
    scriptoria.clearState()
    router.replace({ name: 'login' })
    return
  }

  await auth.fetchMe()
  const init = await scriptoria.initialize()
  if (!init.ok) {
    showToast(init.message || 'Gagal memuat workspace Scriptoria dari backend.', 'error')
    if (!auth.session?.accessToken) {
      scriptoria.clearState()
      router.replace({ name: 'login' })
      return
    }
  }

  const saved = localStorage.getItem(THEME_STORAGE_KEY)
  if (saved === 'scriptorialight' || saved === 'scriptorianight') {
    theme.value = saved
  }
  document.documentElement.setAttribute('data-theme', theme.value)

  ACTIVITY_EVENTS.forEach((eventName) => {
    window.addEventListener(eventName, touchSessionActivity, { passive: true })
  })

  sessionWatcherTimer = window.setInterval(async () => {
    const stillValid = await auth.ensureSessionValid()
    if (!stillValid) {
      scriptoria.clearState()
      showToast('Sesi berakhir karena tidak aktif. Silakan login lagi.', 'warning')
      router.replace({ name: 'login' })
    }
  }, SESSION_CHECK_INTERVAL_MS)
}

watch(theme, (value) => {
  document.documentElement.setAttribute('data-theme', value)
  localStorage.setItem(THEME_STORAGE_KEY, value)
})

onBeforeUnmount(() => {
  clearTimeout(toastTimer)
  clearInterval(sessionWatcherTimer)
  ACTIVITY_EVENTS.forEach((eventName) => {
    window.removeEventListener(eventName, touchSessionActivity)
  })
})

function touchSessionActivity() {
  const now = Date.now()
  if (now - lastActivityTouchAt < ACTIVITY_TOUCH_INTERVAL_MS) return
  lastActivityTouchAt = now
  void auth.touchActivity()
}

function toggleTheme() {
  theme.value = theme.value === 'scriptorialight' ? 'scriptorianight' : 'scriptorialight'
}

async function handleUndo() {
  const result = await scriptoria.undoLastAction()
  showToast(result.message || (result.ok ? 'Berhasil undo aksi terakhir.' : 'Undo gagal.'), result.ok ? 'success' : 'error')
}

function handleLogout() {
  openConfirm({
    title: 'Keluar dari aplikasi?',
    message: 'Sesi login akan ditutup dan kamu akan diarahkan ke landing page.',
    confirmText: 'Logout',
    confirmClass: 'btn-error',
    onConfirm: () => {
      scriptoria.clearState()
      auth.logout()
      router.replace({ name: 'landing' })
    },
  })
}
</script>

<template>
  <div id="top" class="min-h-screen page-bg pb-10">
    <div class="mx-auto max-w-7xl p-4 md:p-8 space-y-6">
      <TopNavbar
        :theme="theme"
        :show-theme-toggle="true"
        :show-public-shortcut="true"
        logout-mode="emit"
        @toggle-theme="toggleTheme"
        @logout="handleLogout"
      />

      <RouterView v-slot="{ Component }">
        <transition name="route-inner" mode="out-in">
          <component :is="Component" :key="route.fullPath" />
        </transition>
      </RouterView>
    </div>

    <div v-if="toast.show" class="toast toast-end toast-top z-[70]">
      <div class="alert" :class="toast.type === 'error' ? 'alert-error' : toast.type === 'success' ? 'alert-success' : toast.type === 'warning' ? 'alert-warning' : 'alert-info'">
        <span>{{ toast.message }}</span>
      </div>
    </div>

    <transition name="fade-slide">
      <button
        v-if="scriptoria.canUndo"
        type="button"
        class="btn btn-primary btn-sm fixed bottom-5 right-5 z-[72] rounded-full anim-soft-pulse shadow-lg"
        @click="handleUndo"
      >
        <i class="bi bi-arrow-counterclockwise"></i>
        Undo Aksi
      </button>
    </transition>

    <dialog class="modal" :open="confirmState.open">
      <div class="modal-box">
        <h3 class="font-bold text-lg">{{ confirmState.title }}</h3>
        <p class="py-3 text-sm opacity-80">{{ confirmState.message }}</p>
        <div class="modal-action">
          <button class="btn" @click="closeConfirm">Batal</button>
          <button class="btn" :class="confirmState.confirmClass" @click="runConfirm">{{ confirmState.confirmText }}</button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop" @click.prevent="closeConfirm">
        <button>Batal</button>
      </form>
    </dialog>
  </div>
</template>
