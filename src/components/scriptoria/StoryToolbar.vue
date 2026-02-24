<script setup>
import { computed } from 'vue'

const props = defineProps({
    modelValue: {
        type: Object,
        default: () => ({
            search: '',
            genre: 'all',
            status: 'all',
            sortBy: 'updatedAt',
            sortDir: 'desc',
        }),
    },
    genres: {
        type: Array,
        default: () => [],
    },
    searching: {
        type: Boolean,
        default: false,
    },
})

const emit = defineEmits(['update:modelValue', 'reset'])

const value = computed(() => ({
    search: props.modelValue?.search ?? '',
    genre: props.modelValue?.genre ?? 'all',
    status: props.modelValue?.status ?? 'all',
    sortBy: props.modelValue?.sortBy ?? 'updatedAt',
    sortDir: props.modelValue?.sortDir ?? 'desc',
}))

function patch(next) {
    emit('update:modelValue', {
        ...props.modelValue,
        ...next,
    })
}

function applyPreset(type) {
    if (type === 'publish-ready') {
        patch({ status: 'Review', sortBy: 'words', sortDir: 'desc' })
        return
    }
    if (type === 'draft-recent') {
        patch({ status: 'Draft', sortBy: 'updatedAt', sortDir: 'desc' })
        return
    }
    if (type === 'title-az') {
        patch({ sortBy: 'title', sortDir: 'asc' })
        return
    }
    emit('reset')
}
</script>

<template>
    <section class="card border border-base-300 bg-base-100/80 shadow-sm backdrop-blur-sm reveal-up"
        style="--delay: 200ms;">
        <div class="card-body gap-4">
            <div class="grid items-end gap-3 lg:grid-cols-12">
                <label class="form-control w-full lg:col-span-4">
                    <div class="label pb-1">
                        <span class="label-text text-xs">Pencarian</span>
                    </div>
                    <div class="input input-bordered flex h-12 items-center gap-2"
                        :class="searching ? 'is-searching' : ''">
                        <i class="bi bi-search text-primary"></i>
                        <input type="text" class="grow" placeholder="Cari judul, genre, atau target pembaca..."
                            :value="value.search" @input="patch({ search: $event.target.value })" />
                    </div>
                </label>

                <label class="form-control w-full lg:col-span-2">
                    <div class="label pb-1">
                        <span class="label-text text-xs">Genre</span>
                    </div>
                    <select class="select select-bordered h-12 w-full" :value="value.genre"
                        @change="patch({ genre: $event.target.value })">
                        <option value="all">Semua Genre</option>
                        <option v-for="genre in genres" :key="genre" :value="genre">{{ genre }}</option>
                    </select>
                </label>

                <label class="form-control w-full lg:col-span-2">
                    <div class="label pb-1">
                        <span class="label-text text-xs">Status</span>
                    </div>
                    <select class="select select-bordered h-12 w-full" :value="value.status"
                        @change="patch({ status: $event.target.value })">
                        <option value="all">Semua Status</option>
                        <option value="Draft">Draft</option>
                        <option value="Review">Review</option>
                        <option value="Published">Published</option>
                        <option value="Completed">Completed</option>
                        <option value="Archived">Archived</option>
                    </select>
                </label>

                <div class="grid gap-2 sm:grid-cols-2 lg:col-span-4">
                    <label class="form-control w-full min-w-0">
                        <div class="label pb-1">
                            <span class="label-text text-xs">Sort By</span>
                        </div>
                        <select class="select select-bordered h-12 w-full" :value="value.sortBy"
                            @change="patch({ sortBy: $event.target.value })">
                            <option value="updatedAt">Terakhir Update</option>
                            <option value="title">Judul</option>
                            <option value="genre">Genre</option>
                            <option value="status">Status</option>
                            <option value="words">Jumlah Kata</option>
                            <option value="targetWords">Target Kata</option>
                        </select>
                    </label>

                    <label class="form-control w-full min-w-0">
                        <div class="label pb-1">
                            <span class="label-text text-xs">Urutan</span>
                        </div>
                        <select class="select select-bordered h-12 w-full" :value="value.sortDir"
                            @change="patch({ sortDir: $event.target.value })">
                            <option value="desc">Menurun</option>
                            <option value="asc">Menaik</option>
                        </select>
                    </label>
                </div>
            </div>

            <div class="flex flex-wrap items-center gap-2 text-xs">
                <span class="badge badge-outline">Genre: {{ value.genre === 'all' ? 'Semua' : value.genre }}</span>
                <span class="badge badge-outline">Status: {{ value.status === 'all' ? 'Semua' : value.status }}</span>
                <span class="badge badge-outline">Urut: {{ value.sortBy }} ({{ value.sortDir === 'asc' ? 'naik' :
                    'turun' }})</span>
            </div>

            <div class="flex flex-wrap gap-2">
                <button type="button" class="btn btn-xs btn-outline" @click="applyPreset('publish-ready')">
                    <i class="bi bi-send-check"></i>
                    Siap Publish
                </button>
                <button type="button" class="btn btn-xs btn-outline" @click="applyPreset('draft-recent')">
                    <i class="bi bi-pencil-square"></i>
                    Draft Terbaru
                </button>
                <button type="button" class="btn btn-xs btn-outline" @click="applyPreset('title-az')">
                    <i class="bi bi-sort-alpha-down"></i>
                    Judul A-Z
                </button>
                <button type="button" class="btn btn-xs btn-ghost" @click="applyPreset('reset')">
                    <i class="bi bi-arrow-counterclockwise"></i>
                    Reset Filter
                </button>
            </div>
        </div>
    </section>
</template>
