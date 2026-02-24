const API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787').replace(/\/+$/, '')

export class ApiError extends Error {
  constructor(message, status = 0, data = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

export async function apiRequest(path, { method = 'GET', token = '', body, signal } = {}) {
  const headers = {
    'Content-Type': 'application/json',
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  })

  const raw = await response.text()
  let data = null

  if (raw) {
    try {
      data = JSON.parse(raw)
    } catch {
      data = null
    }
  }

  if (!response.ok) {
    const message = data?.message || `Permintaan gagal (${response.status}).`
    throw new ApiError(message, response.status, data)
  }

  return data
}

export { API_BASE_URL }
