<script setup>
import { onBeforeUnmount, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const isRouteLoading = ref(false)
const skeletonVariant = ref('dashboard')

let minLoadingTimer = 0

function resolveVariant(name) {
    if (name === 'landing') return 'landing'
    if (name === 'login') return 'login'
    if (name === 'register') return 'login'
    if (name === 'novel-detail') return 'landing'
    if (name === 'read-story') return 'landing'
    if (name === 'read-story-legacy') return 'landing'
    if (name === 'stories') return 'items'
    if (name === 'bookmarks') return 'items'
    if (name === 'story-create') return 'items'
    if (name === 'story-edit') return 'items'
    if (name === 'story-editor') return 'items'
    if (name === 'settings') return 'settings'
    return 'dashboard'
}

const removeBeforeEach = router.beforeEach((to, from, next) => {
    if (to.fullPath !== from.fullPath) {
        skeletonVariant.value = resolveVariant(to.name)
        isRouteLoading.value = true
        clearTimeout(minLoadingTimer)
    }
    next()
})

const removeAfterEach = router.afterEach(() => {
    minLoadingTimer = window.setTimeout(() => {
        isRouteLoading.value = false
    }, 260)
})

const removeOnError = router.onError(() => {
    clearTimeout(minLoadingTimer)
    isRouteLoading.value = false
})

onBeforeUnmount(() => {
    removeBeforeEach()
    removeAfterEach()
    removeOnError()
    clearTimeout(minLoadingTimer)
})
</script>

<template>
    <div class="relative">
        <RouterView v-slot="{ Component }">
            <transition name="route-shell" mode="out-in">
                <component :is="Component" :key="route.fullPath" />
            </transition>
        </RouterView>

        <transition name="route-skeleton-fade">
            <div v-if="isRouteLoading" class="route-skeleton" :class="`route-skeleton--${skeletonVariant}`"
                aria-hidden="true">
                <template v-if="skeletonVariant === 'landing'">
                    <div class="route-skeleton-line route-skeleton-line--hero"></div>
                    <div class="route-skeleton-hero-grid">
                        <div class="route-skeleton-block route-skeleton-block--hero"></div>
                        <div class="route-skeleton-block route-skeleton-block--media"></div>
                    </div>
                    <div class="route-skeleton-grid route-skeleton-grid--landing">
                        <div class="route-skeleton-block"></div>
                        <div class="route-skeleton-block"></div>
                        <div class="route-skeleton-block"></div>
                    </div>
                </template>

                <template v-else-if="skeletonVariant === 'login'">
                    <div class="route-skeleton-login-wrap">
                        <div class="route-skeleton-block route-skeleton-block--login-side"></div>
                        <div class="route-skeleton-block route-skeleton-block--login-form"></div>
                    </div>
                </template>

                <template v-else-if="skeletonVariant === 'items'">
                    <div class="route-skeleton-line route-skeleton-line--dashboard-nav"></div>
                    <div class="route-skeleton-row route-skeleton-row--toolbar">
                        <div class="route-skeleton-block route-skeleton-block--toolbar-search"></div>
                        <div class="route-skeleton-block route-skeleton-block--toolbar-filter"></div>
                        <div class="route-skeleton-block route-skeleton-block--toolbar-filter"></div>
                    </div>
                    <div class="route-skeleton-block route-skeleton-block--table-head"></div>
                    <div class="route-skeleton-stack">
                        <div class="route-skeleton-block route-skeleton-block--table-row"></div>
                        <div class="route-skeleton-block route-skeleton-block--table-row"></div>
                        <div class="route-skeleton-block route-skeleton-block--table-row"></div>
                        <div class="route-skeleton-block route-skeleton-block--table-row"></div>
                    </div>
                </template>

                <template v-else-if="skeletonVariant === 'settings'">
                    <div class="route-skeleton-line route-skeleton-line--dashboard-nav"></div>
                    <div class="route-skeleton-grid route-skeleton-grid--settings">
                        <div class="route-skeleton-block route-skeleton-block--settings-card"></div>
                        <div class="route-skeleton-block route-skeleton-block--settings-card"></div>
                    </div>
                    <div class="route-skeleton-stack">
                        <div class="route-skeleton-block route-skeleton-block--settings-row"></div>
                        <div class="route-skeleton-block route-skeleton-block--settings-row"></div>
                        <div class="route-skeleton-block route-skeleton-block--settings-row"></div>
                    </div>
                </template>

                <template v-else>
                    <div class="route-skeleton-line route-skeleton-line--dashboard-nav"></div>
                    <div class="route-skeleton-grid route-skeleton-grid--dashboard">
                        <div class="route-skeleton-block route-skeleton-block--stat"></div>
                        <div class="route-skeleton-block route-skeleton-block--stat"></div>
                        <div class="route-skeleton-block route-skeleton-block--stat"></div>
                        <div class="route-skeleton-block route-skeleton-block--stat"></div>
                    </div>
                    <div class="route-skeleton-block route-skeleton-block--dashboard-main"></div>
                    <div class="route-skeleton-block route-skeleton-block--dashboard-main short"></div>
                </template>
                <div class="route-skeleton-pulse-dot"></div>
            </div>
        </transition>
    </div>
</template>
