import { createRouter, createWebHistory } from 'vue-router'
import AppLayout from '../layouts/AppLayout.vue'
import LandingView from '../views/LandingView.vue'
import LoginView from '../views/LoginView.vue'
import RegisterView from '../views/RegisterView.vue'
import ItemsView from '../views/ItemsView.vue'
import SettingsView from '../views/SettingsView.vue'
import StoryEditorView from '../views/StoryEditorView.vue'
import StoryFormView from '../views/StoryFormView.vue'
import ReadStoryView from '../views/ReadStoryView.vue'
import NovelDetailView from '../views/NovelDetailView.vue'
import BookmarksView from '../views/BookmarksView.vue'
import { useAuthStore } from '../stores/auth'

const SEARCH_QUERY_MAX_CHARS = 120

function firstQueryValue(raw) {
  if (Array.isArray(raw)) return raw[0] || ''
  return raw ?? ''
}

function sanitizeLandingQuery(query = {}) {
  const next = {}

  Object.entries(query).forEach(([key, value]) => {
    if (key === 'q') {
      const clean = String(firstQueryValue(value)).trim().slice(0, SEARCH_QUERY_MAX_CHARS)
      if (clean) next.q = clean
      return
    }

    if (key === 'genre') {
      const clean = String(firstQueryValue(value)).trim()
      if (clean && clean.toLowerCase() !== 'all') next.genre = clean
      return
    }

    next[key] = value
  })

  return next
}

function isShallowEqualObject(left = {}, right = {}) {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false

  return leftKeys.every((key) => String(left[key]) === String(right[key]))
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'landing',
      component: LandingView,
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView,
      meta: { guestOnly: true },
    },
    {
      path: '/register',
      alias: ['/daftar'],
      name: 'register',
      component: RegisterView,
      meta: { guestOnly: true },
    },
    {
      path: '/novel/:slug/:chapter(\\d+)',
      name: 'read-story',
      component: ReadStoryView,
    },
    {
      path: '/novel/:slug',
      name: 'novel-detail',
      component: NovelDetailView,
    },
    {
      path: '/read/:id/:chapter?',
      name: 'read-story-legacy',
      component: ReadStoryView,
    },
    {
      path: '/contoh/:slug?',
      redirect: { name: 'landing', hash: '#novel-publik' },
    },
    {
      path: '/app',
      component: AppLayout,
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          redirect: { name: 'stories' },
        },
        {
          path: 'dashboard',
          redirect: { name: 'stories' },
        },
        {
          path: 'cerita',
          name: 'stories',
          component: ItemsView,
        },
        {
          path: 'bookmark',
          name: 'bookmarks',
          component: BookmarksView,
        },
        {
          path: 'cerita/baru',
          name: 'story-create',
          component: StoryFormView,
        },
        {
          path: 'cerita/:id/edit',
          name: 'story-edit',
          component: StoryFormView,
        },
        {
          path: 'cerita/:id/editor',
          name: 'story-editor',
          component: StoryEditorView,
        },
        {
          path: 'pengaturan',
          name: 'settings',
          component: SettingsView,
        },
      ],
    },
  ],
})

router.beforeEach(async (to) => {
  if (to.name === 'landing') {
    const normalizedQuery = sanitizeLandingQuery(to.query)
    if (!isShallowEqualObject(to.query, normalizedQuery)) {
      return {
        name: 'landing',
        query: normalizedQuery,
        hash: to.hash || undefined,
        replace: true,
      }
    }
  }

  if (to.name === 'read-story' || to.name === 'read-story-legacy') {
    const rawChapter = String(to.params.chapter || '').trim()
    if (rawChapter) {
      const chapter = Number.parseInt(rawChapter, 10)
      const safeChapter = Number.isFinite(chapter) && chapter > 0 ? chapter : 1
      if (String(safeChapter) !== rawChapter) {
        return {
          name: to.name,
          params: {
            ...to.params,
            chapter: String(safeChapter),
          },
          query: to.query,
          hash: to.hash || undefined,
          replace: true,
        }
      }
    }
  }

  const auth = useAuthStore()
  const hasValidSession = await auth.ensureSessionValid()

  if (to.meta.requiresAuth && !hasValidSession) {
    return {
      name: 'login',
      query: {
        redirect: to.fullPath,
      },
    }
  }

  if (to.meta.guestOnly && hasValidSession) {
    return { name: 'landing' }
  }

  return true
})

export default router
