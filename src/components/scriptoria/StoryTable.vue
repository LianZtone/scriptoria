<script setup>
import { computed } from 'vue'
import defaultCover from '../../assets/cover.jpeg'
import { formatDate, progressBadgeClass, statusBadgeClass, storyProgressLabel } from '../../utils/formatters'

const props = defineProps({
    stories: {
        type: Array,
        required: true,
    },
    searchQuery: {
        type: String,
        default: '',
    },
    activeGenre: {
        type: String,
        default: 'all',
    },
    activeStatus: {
        type: String,
        default: 'all',
    },
    viewMode: {
        type: String,
        default: 'card',
    },
})

defineEmits(['create-new', 'edit', 'delete', 'open-editor', 'share', 'reset-filters'])

const isCardMode = computed(() => String(props.viewMode || 'card') !== 'table')

function getStoryCover(story) {
    const uploaded = String(story?.coverImage || '').trim()
    return uploaded || defaultCover
}

function handleCoverError(event) {
    const img = event?.target
    if (!img || img.dataset.fallbackApplied === '1') return
    img.dataset.fallbackApplied = '1'
    img.src = defaultCover
}
</script>

<template>
    <section class="card interactive-card border border-base-300 bg-base-100 shadow-sm reveal-up"
        style="--delay: 240ms;">
        <div class="card-body gap-4">
            <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                    <h2 class="card-title">
                        <i :class="['bi text-primary', isCardMode ? 'bi-grid-3x2-gap' : 'bi-table']"></i>
                        Daftar Cerita
                    </h2>
                    <div class="badge badge-outline badge-primary">{{ stories.length }} cerita tampil</div>
                </div>
                <button type="button" class="btn btn-sm btn-primary" @click="$emit('create-new')">
                    <i class="bi bi-plus-circle"></i>
                    Buat Cerita Baru
                </button>
            </div>

            <transition name="fade-slide" mode="out-in">
                <div v-if="stories.length === 0" key="empty" class="hero rounded-2xl bg-base-200 py-10">
                    <div class="hero-content text-center">
                        <div>
                            <h3 class="text-lg font-semibold">Cerita tidak ditemukan</h3>
                            <p class="mt-1 text-sm text-base-content/70">Coba ubah kata kunci pencarian, filter, atau
                                urutan data.</p>
                            <p v-if="searchQuery || activeGenre !== 'all' || activeStatus !== 'all'"
                                class="mt-2 text-xs opacity-75">
                                Filter aktif:
                                <span v-if="searchQuery">kata kunci "<strong>{{ searchQuery }}</strong>"</span>
                                <span v-if="activeGenre !== 'all'">, genre "<strong>{{ activeGenre }}</strong>"</span>
                                <span v-if="activeStatus !== 'all'">, status "<strong>{{ activeStatus
                                }}</strong>"</span>
                            </p>
                            <button v-if="searchQuery || activeGenre !== 'all' || activeStatus !== 'all'" type="button"
                                class="btn btn-sm btn-outline mt-3" @click="$emit('reset-filters')">
                                <i class="bi bi-arrow-counterclockwise"></i>
                                Reset Filter
                            </button>
                        </div>
                    </div>
                </div>

                <div v-else key="stories" class="space-y-3">
                    <div class="rounded-xl border border-base-300/75 bg-base-200/30 p-2.5 text-[11px] opacity-80">
                        {{ isCardMode
                            ? 'Mode kartu menonjolkan cover cerita dan metadata utama agar browsing lebih cepat.'
                            : 'Mode tabel cocok untuk manajemen cepat saat jumlah cerita sudah banyak.' }}
                    </div>

                    <TransitionGroup v-if="isCardMode" name="row-swap" tag="div" class="story-card-grid">
                        <article v-for="(story, index) in stories" :key="story.id"
                            class="story-card-item anim-row overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm"
                            :style="{ '--row-delay': `${Math.min(index * 30, 260)}ms` }">
                            <div class="relative aspect-[3/4] overflow-hidden bg-base-200">
                                <img :src="getStoryCover(story)" :alt="`Cover ${story.title}`"
                                    class="h-full w-full object-cover object-center" loading="lazy" decoding="async"
                                    @error="handleCoverError" />

                                <div class="absolute left-3 top-3 z-10 max-w-[72%] sm:max-w-[66%]">
                                    <span
                                        class="badge badge-sm h-auto max-w-full whitespace-normal break-words border-base-300 bg-base-100/90 px-2 py-1 text-[10px] font-medium leading-tight backdrop-blur"
                                        :title="story.genre"
                                    >
                                        {{ story.genre }}
                                    </span>
                                </div>
                                <div class="absolute right-3 top-3">
                                    <span class="badge badge-sm whitespace-nowrap" :class="statusBadgeClass(story)">{{
                                        story.status }}</span>
                                </div>
                            </div>

                            <div class="story-card-content space-y-3 p-3">
                                <div class="flex items-start justify-between gap-2">
                                    <h3 class="line-clamp-2 text-base font-semibold leading-tight">{{ story.title }}
                                    </h3>
                                </div>

                                <p class="line-clamp-2 sm:line-clamp-3 text-xs opacity-70">{{ story.summary || 'Belum ada ringkasan cerita.' }}</p>

                                <div class="grid gap-2 text-xs">
                                    <div class="rounded-lg bg-base-200/60 p-2">
                                        <p class="opacity-70">Kata / Target</p>
                                        <p class="font-semibold">{{ story.words }} / {{ story.targetWords || '-' }}</p>
                                    </div>
                                   
                                </div>

                                <div class="flex items-center justify-between text-[11px] opacity-70">
                                    
                                    <span>{{ formatDate(story.updatedAt) }}</span>
                                    <span class="badge badge-sm" :class="progressBadgeClass(story)">{{
                                        storyProgressLabel(story) }}</span>
                                </div>

                                <div class="mt-auto flex flex-wrap justify-end gap-2 border-t border-base-300/70 pt-2">
                                    <button class="btn btn-xs sm:btn-sm btn-outline" title="Buka editor bab"
                                        @click="$emit('open-editor', story)">
                                        <i class="bi bi-journal-text"></i>
                                    </button>
                                    <button class="btn btn-xs sm:btn-sm btn-outline" title="Salin link publik"
                                        :disabled="!['Published', 'Completed'].includes(String(story.status || ''))"
                                        @click="$emit('share', story)">
                                        <i class="bi bi-link-45deg"></i>
                                    </button>
                                    <button class="btn btn-xs sm:btn-sm btn-outline" title="Edit cerita"
                                        @click="$emit('edit', story)">
                                        <i class="bi bi-pencil"></i>
                                    </button>
                                    <button class="btn btn-xs sm:btn-sm btn-error btn-outline" title="Hapus cerita"
                                        @click="$emit('delete', story)">
                                        <i class="bi bi-trash3"></i>
                                    </button>
                                </div>
                            </div>
                        </article>
                    </TransitionGroup>

                    <div v-else class="space-y-3">
                        <div class="grid gap-3 lg:hidden">
                            <TransitionGroup name="row-swap" tag="div" class="grid gap-3">
                                <article v-for="(story, index) in stories" :key="story.id"
                                    class="anim-row rounded-xl border border-base-300 bg-base-100 p-3 shadow-sm"
                                    :style="{ '--row-delay': `${Math.min(index * 26, 240)}ms` }">
                                    <div class="flex items-start justify-between gap-2">
                                        <div>
                                            <p class="font-semibold leading-tight">{{ story.title }}</p>
                                            <p class="mt-0.5 text-xs opacity-70">{{ story.genre }} • {{ story.status }}
                                            </p>
                                        </div>
                                    </div>

                                    <div class="mt-2 grid grid-cols-2 gap-2 text-xs">
                                        <div class="rounded-lg bg-base-200/60 p-2">
                                            <p class="opacity-70">Kata / Target</p>
                                            <p class="font-semibold">{{ story.words }} / {{ story.targetWords || '-' }}
                                            </p>
                                        </div>
                                        <div class="rounded-lg bg-base-200/60 p-2">
                                            <p class="opacity-70">Progres</p>
                                            <p><span class="badge badge-sm" :class="progressBadgeClass(story)">{{
                                                    storyProgressLabel(story) }}</span></p>
                                        </div>
                                    </div>

                                    <div class="mt-2 text-xs">
                                        <p class="opacity-70">Ringkasan</p>
                                        <p class="line-clamp-2">{{ story.summary || '-' }}</p>
                                    </div>

                                    <div
                                        class="mt-2 flex items-center justify-between border-t border-base-300/70 pt-2">
                                        <span class="text-[11px] opacity-70">{{ formatDate(story.updatedAt) }}</span>
                                        <div class="flex flex-wrap justify-end gap-2">
                                            <button class="btn btn-xs btn-outline" @click="$emit('open-editor', story)">
                                                <i class="bi bi-journal-text"></i>
                                            </button>
                                            <button class="btn btn-xs btn-outline"
                                                :disabled="!['Published', 'Completed'].includes(String(story.status || ''))"
                                                @click="$emit('share', story)">
                                                <i class="bi bi-link-45deg"></i>
                                            </button>
                                            <button class="btn btn-xs btn-outline" @click="$emit('edit', story)">
                                                <i class="bi bi-pencil"></i>
                                            </button>
                                            <button class="btn btn-xs btn-error btn-outline"
                                                @click="$emit('delete', story)">
                                                <i class="bi bi-trash3"></i>
                                            </button>
                                        </div>
                                    </div>
                                </article>
                            </TransitionGroup>
                        </div>

                        <div class="hidden overflow-x-auto rounded-xl border border-base-300 lg:block">
                            <table class="table table-zebra table-sm">
                                <thead>
                                    <tr>
                                        <th>Judul</th>
                                        <th class="whitespace-nowrap">Genre</th>
                                        <th class="whitespace-nowrap">Status</th>
                                        <th class="whitespace-nowrap text-center">Kata</th>
                                        <th class="whitespace-nowrap text-center">Target</th>
                                        <th class="whitespace-nowrap">Progres</th>
                                        <th>Ringkasan</th>
                                        <th class="whitespace-nowrap">Update</th>
                                        <th class="whitespace-nowrap text-right">Aksi</th>
                                    </tr>
                                </thead>
                                <TransitionGroup name="row-swap" tag="tbody">
                                    <tr v-for="(story, index) in stories" :key="story.id" class="hover anim-row"
                                        :style="{ '--row-delay': `${Math.min(index * 22, 220)}ms` }">
                                        <td class="font-semibold whitespace-nowrap">{{ story.title }}</td>
                                        <td><span class="badge badge-ghost badge-sm">{{ story.genre }}</span></td>
                                        <td><span class="badge badge-sm whitespace-nowrap"
                                                :class="statusBadgeClass(story)">{{ story.status }}</span></td>
                                        <td class="text-center">{{ story.words }}</td>
                                        <td class="text-center">{{ story.targetWords || '-' }}</td>
                                        <td><span class="badge badge-sm whitespace-nowrap"
                                                :class="progressBadgeClass(story)">{{ storyProgressLabel(story)
                                                }}</span>
                                        </td>
                                        <td class="text-xs max-w-[260px]">
                                            <p class="line-clamp-2" :title="story.summary || '-'">{{ story.summary ||
                                                '-' }}
                                            </p>
                                        </td>
                                        <td class="text-xs whitespace-nowrap">{{ formatDate(story.updatedAt) }}</td>
                                        <td>
                                            <div class="flex justify-end gap-2">
                                                <button class="btn btn-sm btn-outline" title="Buka editor bab"
                                                    @click="$emit('open-editor', story)">
                                                    <i class="bi bi-journal-text"></i>
                                                </button>
                                                <button class="btn btn-sm btn-outline" title="Salin link publik"
                                                    :disabled="!['Published', 'Completed'].includes(String(story.status || ''))"
                                                    @click="$emit('share', story)">
                                                    <i class="bi bi-link-45deg"></i>
                                                </button>
                                                <button class="btn btn-sm btn-outline" @click="$emit('edit', story)">
                                                    <i class="bi bi-pencil"></i>
                                                </button>
                                                <button class="btn btn-sm btn-error btn-outline"
                                                    @click="$emit('delete', story)">
                                                    <i class="bi bi-trash3"></i>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                </TransitionGroup>
                            </table>
                        </div>
                    </div>
                </div>
            </transition>
        </div>
    </section>
</template>
