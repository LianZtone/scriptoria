<script setup>
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import loginArt from '../assets/newsletter-subscriber_plsr.svg'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const form = reactive({
    username: '',
    password: '',
})

const error = ref('')
const showPin = ref(false)
const isSubmitting = ref(false)
const loginLocked = computed(() => auth.isLocked)

async function submit() {
    if (isSubmitting.value) return
    error.value = ''
    if (loginLocked.value) {
        error.value = `Login dikunci sementara. Coba lagi dalam ${auth.lockRemainingSeconds} detik.`
        return
    }
    isSubmitting.value = true
    const result = await auth.login(form)
    isSubmitting.value = false
    if (!result.ok) {
        error.value = result.message
        return
    }

    const redirect = String(route.query.redirect || '').trim()
    if (redirect.startsWith('/')) {
        router.replace(redirect)
        return
    }

    router.replace({ name: 'landing' })
}

function fillDemo() {
    form.username = form.username || 'admin'
    form.password = import.meta.env.VITE_APP_DEMO_PASSWORD || 'Admin@12345'
}
</script>

<template>
    <div class="min-h-screen page-bg p-4 md:p-8 grid place-items-center">
        <section
            class="anim-enter w-full max-w-6xl rounded-3xl border border-base-300 bg-base-100/78 shadow-2xl backdrop-blur-xl overflow-hidden"
            style="--anim-delay: 70ms;"
        >
            <div class="grid lg:grid-cols-[1.08fr_0.92fr]">
                <aside class="relative p-6 md:p-10 bg-base-200/52 anim-enter" style="--anim-delay: 120ms;">
                    <div class="badge badge-primary badge-outline mb-3 anim-soft-pulse">Scriptoria</div>
                    <h1 class="text-3xl md:text-4xl font-black leading-tight max-w-lg">Masuk ke Ruang Cerita
                        Scriptoria</h1>
                    <p class="mt-3 text-sm opacity-72 max-w-md">
                        Sebuah ruang digital pribadi untuk menulis dan membagikan cerita.
                    </p>

                    <div class="mt-6 space-y-3 text-sm">
                        <div class="flex items-start gap-2.5">
                            <i class="bi bi-check-circle-fill text-success mt-0.5"></i>
                            <span>Antarmuka menulis yang bersih dan fokus pada isi cerita</span>
                        </div>
                        <div class="flex items-start gap-2.5">
                            <i class="bi bi-check-circle-fill text-success mt-0.5"></i>
                            <span>Pengalaman membaca yang cepat dan nyaman di berbagai perangkat</span>
                        </div>
                        <div class="flex items-start gap-2.5">
                            <i class="bi bi-check-circle-fill text-success mt-0.5"></i>
                            <span>Mudah membagikan cerita ke pembaca lewat tautan sederhana</span>
                        </div>
                    </div>

                    <img :src="loginArt" alt="Login Illustration" class="mt-8 w-full max-w-md md:max-w-lg anim-enter" style="--anim-delay: 220ms;" />
                </aside>

                <main class="p-6 md:p-10 grid content-center anim-enter" style="--anim-delay: 160ms;">
                    <div
                        class="mx-auto w-full max-w-md rounded-2xl border border-base-300 bg-base-100/84 p-5 md:p-6 shadow-lg anim-hover-rise">
                        <div class="flex flex-wrap items-center justify-between gap-2">
                            <h2 class="text-2xl font-bold">Login Akun</h2>
                            <span class="badge badge-outline badge-primary">Secure Access</span>
                        </div>
                        <p class="mt-1 text-sm opacity-70">Masukkan kredensial untuk melanjutkan ke Scriptoria.</p>

                        <div v-if="error" class="alert alert-error text-sm mt-4">
                            <span>{{ error }}</span>
                        </div>

                        <form class="mt-5 space-y-3" @submit.prevent="submit">
                            <label class="form-control login-field">
                                <div class="label"><span class="label-text login-label">Username</span></div>
                                <div class="login-input-shell">
                                    <i class="bi bi-person login-icon" aria-hidden="true"></i>
                                    <input
                                        v-model="form.username"
                                        type="text"
                                        class="login-control login-input"
                                        placeholder="mis. penulis.scriptoria"
                                        autocomplete="username"
                                    />
                                </div>
                                <span class="login-underline" aria-hidden="true"></span>
                            </label>

                            <label class="form-control login-field">
                                <div class="label"><span class="label-text login-label">Password</span></div>
                                <div class="login-input-shell">
                                    <i class="bi bi-shield-lock login-icon" aria-hidden="true"></i>
                                    <input
                                        v-model="form.password"
                                        :type="showPin ? 'text' : 'password'"
                                        class="login-control login-input"
                                        placeholder="Masukkan password"
                                        autocomplete="current-password"
                                    />
                                    <button
                                        type="button"
                                        class="btn btn-ghost btn-xs login-visibility-btn"
                                        :aria-label="showPin ? 'Sembunyikan Password' : 'Lihat Password'"
                                        @click="showPin = !showPin"
                                    >
                                        <i :class="['bi', showPin ? 'bi-eye-slash' : 'bi-eye']"></i>
                                    </button>
                                </div>
                                <span class="login-underline" aria-hidden="true"></span>
                            </label>

                            <div class="flex gap-2 pt-2">
                                <button type="submit" class="btn btn-primary flex-1 anim-hover-rise" :disabled="loginLocked || isSubmitting">
                                    {{ loginLocked ? `Tunggu ${auth.lockRemainingSeconds} detik` : isSubmitting ? 'Memproses...' : 'Masuk Scriptoria' }}
                                </button>
                                <RouterLink :to="{ name: 'landing' }" class="btn btn-ghost anim-hover-rise">Landing</RouterLink>
                            </div>

                            <p class="text-sm opacity-75 pt-1">
                                Belum punya akun?
                                <RouterLink :to="{ name: 'register' }" class="link link-primary font-medium">Daftar sekarang</RouterLink>
                            </p>

                            <button type="button" class="btn btn-sm btn-outline w-full anim-hover-rise" @click="fillDemo">
                                Isi Demo Credential
                            </button>
                        </form>

                        <div class="mt-4 rounded-xl border border-base-300 bg-base-200/60 p-3 text-xs leading-relaxed opacity-85">
                            Demi keamanan, akses dibatasi dengan timeout sesi, refresh token, dan lock sementara saat password salah berulang.
                        </div>
                    </div>
                </main>
            </div>
        </section>
    </div>
</template>
