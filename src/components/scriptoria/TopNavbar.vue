<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'

const props = defineProps({
    scrolled: {
        type: Boolean,
        default: false,
    },
    theme: {
        type: String,
        default: 'scriptorialight',
    },
    showThemeToggle: {
        type: Boolean,
        default: false,
    },
    showPublicShortcut: {
        type: Boolean,
        default: false,
    },
    logoutMode: {
        type: String,
        default: 'direct',
        validator: (value) => ['direct', 'emit'].includes(value),
    },
})

const emit = defineEmits(['toggle-theme', 'logout'])

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const isAuthenticated = computed(() => auth.isAuthenticated)
const isOnWorkspaceRoute = computed(() => route.path.startsWith('/app'))
const isProfileOpen = ref(false)
const mobileMenuRef = ref(null)

const authenticatedMenu = [
    { label: 'Beranda', to: { name: 'landing' } },
    { label: 'Novel saya', to: { name: 'stories' } },
    { label: 'Bookmark', to: { name: 'bookmarks' } },
    { label: 'Tulis Cerita', to: { name: 'story-create' } },
]

const desktopMenu = computed(() => (isAuthenticated.value ? authenticatedMenu : []))
const mobileMenu = computed(() => (isAuthenticated.value ? authenticatedMenu : []))

const brandRoute = computed(() => {
    if (isAuthenticated.value && isOnWorkspaceRoute.value) {
        return { name: 'stories' }
    }
    return { name: 'landing' }
})

const themeLabel = computed(() => (props.theme === 'scriptorialight' ? 'Dark' : 'Light'))
const themeIcon = computed(() => (props.theme === 'scriptorialight' ? 'bi-moon-stars' : 'bi-sun'))

function closeMobileMenu() {
    mobileMenuRef.value?.removeAttribute('open')
    isProfileOpen.value = false
}

function handleSearchNovel() {
    closeMobileMenu()

    const focusSearchInput = () => {
        window.setTimeout(() => {
            const searchInput = document.getElementById('novel-search-input')
            if (searchInput && typeof searchInput.focus === 'function') {
                searchInput.focus()
            }
        }, 180)
    }

    if (route.name !== 'landing') {
        void router.push({ name: 'landing', hash: '#search-discovery' }).then(focusSearchInput)
        return
    }

    window.location.hash = '#search-discovery'
    focusSearchInput()
}

function toggleProfile() {
    isProfileOpen.value = !isProfileOpen.value
}

function handleThemeToggle() {
    emit('toggle-theme')
    closeMobileMenu()
}

async function handleLogout() {
    if (props.logoutMode === 'emit') {
        emit('logout')
        closeMobileMenu()
        return
    }

    auth.logout()
    closeMobileMenu()
    await router.push({ name: 'landing' })
}
</script>

<template>
    <header class="sticky top-3 z-50 transition-all duration-300">
        <nav class="navbar gap-2 rounded-2xl border border-base-300 px-3 shadow-lg backdrop-blur-lg xl:px-4"
            :class="props.scrolled ? 'bg-base-100/88 shadow-xl' : 'bg-base-100/80 shadow-lg'"
            aria-label="Main navigation">
            <div class="navbar-start">
                <RouterLink :to="brandRoute" class="btn btn-ghost text-base font-bold tracking-tight">
                    <i class="bi bi-journal-text text-primary"></i>
                    Scriptoria
                </RouterLink>
            </div>

            <div v-if="desktopMenu.length" class="navbar-center hidden lg:flex">
                <ul class="menu menu-horizontal rounded-box bg-base-200/70 py-1 text-sm">
                    <li v-for="item in desktopMenu" :key="item.label">
                        <RouterLink :to="item.to" class="nav-link-anim" active-class="nav-link-active"
                            exact-active-class="nav-link-active">
                            <span>{{ item.label }}</span>
                        </RouterLink>
                    </li>
                </ul>
            </div>

            <div class="navbar-end shrink-0 gap-1.5 xl:gap-2">
                <details v-if="isAuthenticated" ref="mobileMenuRef" class="dropdown dropdown-end lg:hidden">
                    <summary class="btn btn-sm btn-ghost m-0" aria-label="Menu Navigasi">
                        <i class="bi bi-list text-lg"></i>
                    </summary>
                    <ul class="menu dropdown-content z-[80] mt-2 w-64 rounded-box border border-base-300 bg-base-100 p-2 shadow">
                        <li v-for="item in mobileMenu" :key="`mobile-${item.label}`">
                            <RouterLink :to="item.to" class="nav-link-mobile"
                                active-class="nav-link-mobile-active" exact-active-class="nav-link-mobile-active"
                                @click="closeMobileMenu">
                                {{ item.label }}
                            </RouterLink>
                        </li>

                        <template v-if="isAuthenticated">
                            <li class="menu-title"><span>Profile</span></li>
                            <li>
                                <RouterLink :to="{ name: 'settings' }" @click="closeMobileMenu">Pengaturan Akun</RouterLink>
                            </li>
                            <li>
                                <button type="button" @click="handleLogout">Logout</button>
                            </li>
                        </template>

                    </ul>
                </details>

                <button v-if="props.showThemeToggle" class="btn btn-xs btn-outline xl:btn-sm"
                    :title="`Mode ${themeLabel}`" @click="handleThemeToggle">
                    <i :class="['bi', themeIcon]"></i>
                    <span class="hidden sm:inline">{{ themeLabel }}</span>
                </button>

                <div v-if="props.showPublicShortcut" class="flex items-center gap-1">
                    <a href="#search-discovery" class="btn btn-xs btn-ghost xl:btn-sm" title="Cari Novel" @click.prevent="handleSearchNovel">
                        <i class="bi bi-search"></i>
                        <span class="hidden sm:inline">Search</span>
                    </a>
                </div>

                <div v-if="!isAuthenticated" class="flex items-center gap-1">
                    <RouterLink :to="{ name: 'register' }" class="btn btn-xs btn-outline xl:btn-sm">
                        <i class="bi bi-person-plus"></i>
                        Daftar
                    </RouterLink>
                    <RouterLink :to="{ name: 'login' }" class="btn btn-xs btn-primary xl:btn-sm">
                        <i class="bi bi-box-arrow-in-right"></i>
                        Login
                    </RouterLink>
                </div>

                <!-- <RouterLink v-if="props.showPublicShortcut" :to="{ name: 'landing', hash: '#novel-publik' }"
                    class="btn btn-xs btn-ghost hidden lg:inline-flex xl:btn-sm"
                    title="Novel Publik">
                    <i class="bi bi-book"></i>
                </RouterLink> -->

                <div v-if="isAuthenticated" class="relative hidden lg:block">
                    <button type="button"
                        class="btn btn-xs btn-ghost xl:btn-sm"
                        :aria-expanded="isProfileOpen ? 'true' : 'false'"
                        aria-haspopup="menu"
                        @click="toggleProfile">
                        <i class="bi bi-person-circle"></i>
                        Profile
                        <i class="bi" :class="isProfileOpen ? 'bi-chevron-up' : 'bi-chevron-down'"></i>
                    </button>

                    <div v-if="isProfileOpen" class="absolute right-0 mt-2 w-52 overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-xl"
                        role="menu">
                        <RouterLink :to="{ name: 'settings' }" class="block px-4 py-2 text-sm hover:bg-base-200"
                            role="menuitem" @click="isProfileOpen = false">
                            Pengaturan Akun
                        </RouterLink>
                        <button type="button" class="block w-full px-4 py-2 text-left text-sm hover:bg-base-200"
                            role="menuitem" @click="handleLogout">
                            Logout
                        </button>
                    </div>
                </div>
            </div>
        </nav>
    </header>
</template>
