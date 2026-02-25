<script setup>
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import loginArt from '../assets/scriptoria.png'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const form = reactive({
  username: '',
  password: '',
  confirmPassword: '',
})

const error = ref('')
const isSubmitting = ref(false)
const showPassword = ref(false)
const showConfirmPassword = ref(false)

async function submit() {
  if (isSubmitting.value) return

  error.value = ''
  isSubmitting.value = true
  const result = await auth.register(form)
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

  router.replace({ name: 'stories' })
}

function fillSuggestion() {
  if (form.username) return
  const stamp = Date.now().toString().slice(-4)
  form.username = `penulis_${stamp}`
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
          <h1 class="text-3xl md:text-4xl font-black leading-tight max-w-lg">Buat Akun Penulis Baru</h1>
          <p class="mt-3 text-sm opacity-72 max-w-md">
            Akun baru otomatis mendapatkan ruang cerita pribadi. Data cerita tiap akun dipisahkan.
          </p>

          <div class="mt-6 space-y-3 text-sm">
            <div class="flex items-start gap-2.5">
              <i class="bi bi-check-circle-fill text-success mt-0.5"></i>
              <span>Dashboard cerita privat per akun</span>
            </div>
            <div class="flex items-start gap-2.5">
              <i class="bi bi-check-circle-fill text-success mt-0.5"></i>
              <span>Siap tulis novel, bab, dan publish ke landing</span>
            </div>
            <div class="flex items-start gap-2.5">
              <i class="bi bi-check-circle-fill text-success mt-0.5"></i>
              <span>Bisa login langsung setelah registrasi berhasil</span>
            </div>
          </div>

          <img :src="loginArt" alt="Register Illustration" class="mt-8 w-full max-w-md md:max-w-lg anim-enter" style="--anim-delay: 220ms;" />
        </aside>

        <main class="p-6 md:p-10 grid content-center anim-enter" style="--anim-delay: 160ms;">
          <div class="mx-auto w-full max-w-md rounded-2xl border border-base-300 bg-base-100/84 p-5 md:p-6 shadow-lg anim-hover-rise">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h2 class="text-2xl font-bold">Daftar Akun</h2>
              <span class="badge badge-outline badge-primary">New Writer</span>
            </div>
            <p class="mt-1 text-sm opacity-70">Isi data berikut untuk membuat akun Scriptoria.</p>

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
                    :type="showPassword ? 'text' : 'password'"
                    class="login-control login-input"
                    placeholder="Minimal 8 karakter"
                    autocomplete="new-password"
                  />
                  <button
                    type="button"
                    class="btn btn-ghost btn-xs login-visibility-btn"
                    :aria-label="showPassword ? 'Sembunyikan Password' : 'Lihat Password'"
                    @click="showPassword = !showPassword"
                  >
                    <i :class="['bi', showPassword ? 'bi-eye-slash' : 'bi-eye']"></i>
                  </button>
                </div>
                <span class="login-underline" aria-hidden="true"></span>
              </label>

              <label class="form-control login-field">
                <div class="label"><span class="label-text login-label">Konfirmasi Password</span></div>
                <div class="login-input-shell">
                  <i class="bi bi-shield-check login-icon" aria-hidden="true"></i>
                  <input
                    v-model="form.confirmPassword"
                    :type="showConfirmPassword ? 'text' : 'password'"
                    class="login-control login-input"
                    placeholder="Ulangi password"
                    autocomplete="new-password"
                  />
                  <button
                    type="button"
                    class="btn btn-ghost btn-xs login-visibility-btn"
                    :aria-label="showConfirmPassword ? 'Sembunyikan Password' : 'Lihat Password'"
                    @click="showConfirmPassword = !showConfirmPassword"
                  >
                    <i :class="['bi', showConfirmPassword ? 'bi-eye-slash' : 'bi-eye']"></i>
                  </button>
                </div>
                <span class="login-underline" aria-hidden="true"></span>
              </label>

              <div class="flex gap-2 pt-2">
                <button type="submit" class="btn btn-primary flex-1 anim-hover-rise" :disabled="isSubmitting">
                  {{ isSubmitting ? 'Memproses...' : 'Buat Akun' }}
                </button>
                <RouterLink :to="{ name: 'landing' }" class="btn btn-ghost anim-hover-rise">Landing</RouterLink>
              </div>

              <p class="text-sm opacity-75 pt-1">
                Sudah punya akun?
                <RouterLink :to="{ name: 'login' }" class="link link-primary font-medium">Login di sini</RouterLink>
              </p>

              <button type="button" class="btn btn-sm btn-outline w-full anim-hover-rise" @click="fillSuggestion">
                Isi Saran Username
              </button>
            </form>
          </div>
        </main>
      </div>
    </section>
  </div>
</template>
