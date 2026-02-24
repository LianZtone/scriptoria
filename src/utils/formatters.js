export function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('id-ID')
}

export function statusBadgeClass(story) {
  const status = String(story?.status || '').toLowerCase()
  if (status === 'completed') return 'badge-success'
  if (status === 'published') return 'badge-success'
  if (status === 'review') return 'badge-info'
  if (status === 'archived') return 'badge-neutral'
  return 'badge-warning'
}

export function storyProgressLabel(story) {
  const words = Number(story?.words || 0)
  const target = Number(story?.targetWords || 0)

  if (target <= 0) {
    if (words <= 0) return 'Belum mulai'
    return 'Progres bebas'
  }

  const ratio = words / target
  if (ratio >= 1.2) return 'Melampaui target'
  if (ratio >= 1) return 'Target tercapai'
  if (ratio >= 0.6) return 'On track'
  if (ratio > 0) return 'Perlu dorongan'
  return 'Belum mulai'
}

export function progressBadgeClass(story) {
  const words = Number(story?.words || 0)
  const target = Number(story?.targetWords || 0)

  if (target <= 0) return words > 0 ? 'badge-primary' : 'badge-ghost'
  if (words >= target) return 'badge-success'
  if (words >= target * 0.6) return 'badge-info'
  if (words > 0) return 'badge-warning'
  return 'badge-ghost'
}
