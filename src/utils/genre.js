function normalizeGenreLabel(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseGenreList(input) {
  const source = Array.isArray(input) ? input : String(input || '').split(/[,;|]+/)
  const seen = new Set()
  const genres = []

  source.forEach((entry) => {
    const label = normalizeGenreLabel(entry)
    if (!label) return

    const key = label.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    genres.push(label)
  })

  return genres
}

export function stringifyGenreList(input) {
  return parseGenreList(input).join(', ')
}

export function normalizeGenreValue(input) {
  return stringifyGenreList(input)
}

