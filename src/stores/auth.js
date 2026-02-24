import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { API_BASE_URL, ApiError, apiRequest } from '../utils/api'

const AUTH_KEY = 'scriptoria-auth-session-v2'
const REFRESH_MARGIN_MS = 30 * 1000

function parseJson(raw, fallback) {
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function loadSession() {
  const next = parseJson(localStorage.getItem(AUTH_KEY), null)
  if (next && typeof next === 'object' && next.accessToken && next.refreshToken) {
    return next
  }
  return null
}

export const useAuthStore = defineStore('auth', () => {
  const session = ref(loadSession())
  const lockUntil = ref(0)
  const clock = ref(Date.now())
  let refreshPromise = null

  if (typeof window !== 'undefined') {
    window.setInterval(() => {
      clock.value = Date.now()
    }, 1000)
  }

  const isLocked = computed(() => lockUntil.value > clock.value)
  const lockRemainingSeconds = computed(() => Math.max(0, Math.ceil((lockUntil.value - clock.value) / 1000)))
  const isAuthenticated = computed(() => {
    if (!session.value?.accessToken) return false
    return Number(session.value.expiresAt || 0) > clock.value
  })
  const currentUser = computed(() => session.value?.user || null)
  const role = computed(() => currentUser.value?.role || 'guest')

  function persistSession() {
    if (!session.value?.accessToken) {
      localStorage.removeItem(AUTH_KEY)
      return
    }

    localStorage.setItem(AUTH_KEY, JSON.stringify(session.value))
  }

  function clearSession() {
    session.value = null
    localStorage.removeItem(AUTH_KEY)
  }

  function applyAuthPayload(payload) {
    if (!payload?.accessToken || !payload?.refreshToken || !payload?.user) {
      return false
    }

    const expiresIn = Math.max(60, Number(payload.expiresIn) || 900)

    session.value = {
      accessToken: payload.accessToken,
      refreshToken: payload.refreshToken,
      expiresAt: Date.now() + expiresIn * 1000,
      user: payload.user,
    }

    persistSession()
    return true
  }

  async function login({ username, pin, password }) {
    const name = String(username || '').trim().toLowerCase()
    const secret = String(password || pin || '').trim()

    if (!name || !secret) {
      return { ok: false, message: 'Username dan password wajib diisi.' }
    }

    if (isLocked.value) {
      return {
        ok: false,
        message: `Login dikunci sementara. Coba lagi dalam ${lockRemainingSeconds.value} detik.`,
      }
    }

    try {
      const data = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: {
          username: name,
          password: secret,
        },
      })

      lockUntil.value = 0
      applyAuthPayload(data)
      return { ok: true }
    } catch (error) {
      if (error instanceof ApiError && error.status === 423) {
        const retryAfter = Math.max(1, Number(error.data?.retryAfter) || 60)
        lockUntil.value = Date.now() + retryAfter * 1000
      }

      let message = 'Login gagal. Coba lagi.'
      if (error instanceof ApiError) {
        message = error.message
      } else if (error instanceof TypeError) {
        message = `Tidak bisa terhubung ke Auth API (${API_BASE_URL}). Jalankan backend: npm run dev:server`
      }

      return {
        ok: false,
        message,
      }
    }
  }

  async function register({ username, password, confirmPassword }) {
    const name = String(username || '').trim().toLowerCase()
    const secret = String(password || '').trim()
    const confirm = String(confirmPassword || '').trim()

    if (!name || !secret) {
      return { ok: false, message: 'Username dan password wajib diisi.' }
    }

    try {
      const data = await apiRequest('/api/auth/register', {
        method: 'POST',
        body: {
          username: name,
          password: secret,
          confirmPassword: confirm,
        },
      })

      applyAuthPayload(data)
      return { ok: true, message: data?.message || 'Akun berhasil dibuat.' }
    } catch (error) {
      let message = 'Registrasi gagal. Coba lagi.'
      if (error instanceof ApiError) {
        message = error.message
      } else if (error instanceof TypeError) {
        message = `Tidak bisa terhubung ke Auth API (${API_BASE_URL}). Jalankan backend: npm run dev:server`
      }

      return {
        ok: false,
        message,
      }
    }
  }

  async function refreshSession() {
    if (!session.value?.refreshToken) return false
    if (refreshPromise) return refreshPromise

    refreshPromise = (async () => {
      try {
        const data = await apiRequest('/api/auth/refresh', {
          method: 'POST',
          body: {
            refreshToken: session.value?.refreshToken,
          },
        })

        return applyAuthPayload(data)
      } catch {
        clearSession()
        return false
      } finally {
        refreshPromise = null
      }
    })()

    return refreshPromise
  }

  async function ensureSessionValid({ force = false } = {}) {
    if (!session.value?.accessToken) return false

    const remaining = Number(session.value.expiresAt || 0) - Date.now()
    if (!force && remaining > REFRESH_MARGIN_MS) {
      return true
    }

    return refreshSession()
  }

  function touchActivity() {
    if (!session.value?.accessToken) return
    const remaining = Number(session.value.expiresAt || 0) - Date.now()
    if (remaining <= 2 * 60 * 1000) {
      void ensureSessionValid()
    }
  }

  function logout() {
    const refreshToken = session.value?.refreshToken
    clearSession()

    if (refreshToken) {
      void apiRequest('/api/auth/logout', {
        method: 'POST',
        body: { refreshToken },
      }).catch(() => {})
    }
  }

  async function fetchMe() {
    const hasSession = await ensureSessionValid()
    if (!hasSession || !session.value?.accessToken) return null

    try {
      const data = await apiRequest('/api/auth/me', {
        token: session.value.accessToken,
      })

      session.value = {
        ...session.value,
        user: data.user,
      }
      persistSession()
      return data.user
    } catch {
      return null
    }
  }

  return {
    session,
    currentUser,
    role,
    isAuthenticated,
    isLocked,
    lockRemainingSeconds,
    login,
    register,
    logout,
    refreshSession,
    ensureSessionValid,
    touchActivity,
    fetchMe,
  }
})
