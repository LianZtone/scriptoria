import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style.css'
import App from './App.vue'
import router from './router'

const THEME_STORAGE_KEY = 'scriptoria-theme-v1'
const savedTheme = localStorage.getItem(THEME_STORAGE_KEY)
const initialTheme = savedTheme === 'scriptorialight' || savedTheme === 'scriptorianight' ? savedTheme : 'scriptorialight'
document.documentElement.setAttribute('data-theme', initialTheme)

const SITE_URL_ENV = String(import.meta.env.VITE_SITE_URL || '').trim()

function normalizeBaseUrl(value) {
  if (!value) return ''
  try {
    const url = new URL(value)
    url.pathname = url.pathname.replace(/\/+$/, '')
    return url.toString().replace(/\/+$/, '')
  } catch {
    return ''
  }
}

function updateCanonicalMeta() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return

  const safeBase = normalizeBaseUrl(SITE_URL_ENV) || window.location.origin
  const path = `${window.location.pathname}${window.location.search}`
  const canonicalHref = new URL(path || '/', safeBase).toString()

  let canonicalEl = document.querySelector('link[rel="canonical"]')
  if (!canonicalEl) {
    canonicalEl = document.createElement('link')
    canonicalEl.setAttribute('rel', 'canonical')
    document.head.appendChild(canonicalEl)
  }
  canonicalEl.setAttribute('href', canonicalHref)

  let ogUrlEl = document.querySelector('meta[property="og:url"]')
  if (!ogUrlEl) {
    ogUrlEl = document.createElement('meta')
    ogUrlEl.setAttribute('property', 'og:url')
    document.head.appendChild(ogUrlEl)
  }
  ogUrlEl.setAttribute('content', canonicalHref)
}

updateCanonicalMeta()
router.afterEach(() => {
  updateCanonicalMeta()
})

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
