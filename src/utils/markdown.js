import { marked } from 'marked'

marked.setOptions({
  gfm: true,
  breaks: true,
})

const ALLOWED_TAGS = new Set([
  'p',
  'br',
  'strong',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'hr',
  'blockquote',
  'ul',
  'ol',
  'li',
  'pre',
  'code',
  'a',
])

const BLOCKED_TAGS = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'option',
  'link',
  'meta',
  'base',
  'noscript',
])

function escapeHtml(raw) {
  return String(raw || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function isUnsafeUrl(value) {
  const url = String(value || '').trim().toLowerCase()
  if (!url) return false
  return url.startsWith('javascript:') || url.startsWith('data:text/html')
}

export function sanitizeHtml(rawHtml) {
  const html = String(rawHtml || '')
  if (!html) return ''

  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return escapeHtml(html)
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html')
  const root = doc.body.firstElementChild
  if (!root) return ''

  const nodes = Array.from(root.querySelectorAll('*'))
  nodes.forEach((node) => {
    const tag = node.tagName.toLowerCase()

    if (BLOCKED_TAGS.has(tag)) {
      node.remove()
      return
    }

    if (!ALLOWED_TAGS.has(tag)) {
      const fallback = doc.createTextNode(node.textContent || '')
      node.replaceWith(fallback)
      return
    }

    const attrs = Array.from(node.attributes)
    attrs.forEach((attr) => {
      const name = attr.name.toLowerCase()
      if (name.startsWith('on') || name === 'style' || name === 'srcdoc') {
        node.removeAttribute(attr.name)
        return
      }

      if (tag === 'a') {
        if (!['href', 'title'].includes(name)) {
          node.removeAttribute(attr.name)
          return
        }

        if (name === 'href' && isUnsafeUrl(attr.value)) {
          node.removeAttribute('href')
        }
        return
      }

      node.removeAttribute(attr.name)
    })

    if (tag === 'a' && node.getAttribute('href')) {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noopener noreferrer nofollow')
    }
  })

  return root.innerHTML
}

export function renderMarkdown(rawMarkdown) {
  const markdown = String(rawMarkdown || '')
  if (!markdown.trim()) return ''

  const parsed = marked.parse(markdown, { async: false })
  const rawHtml = typeof parsed === 'string' ? parsed : ''
  return sanitizeHtml(rawHtml)
}
