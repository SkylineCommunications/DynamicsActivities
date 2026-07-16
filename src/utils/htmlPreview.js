const HTML_TAG_REGEX = /<\/?[a-z][\s\S]*>/i
const UNSAFE_TAG_SELECTOR = 'script,style,iframe,object,embed,link,meta,base,form,input,button,textarea,select,option,svg,math'
const PRESENTATIONAL_ATTRS_TO_REMOVE = new Set(['color', 'bgcolor', 'background', 'face'])

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function sanitizeHtml(value) {
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') return escapeHtml(value)
  const parser = new DOMParser()
  const doc = parser.parseFromString(String(value ?? ''), 'text/html')

  doc.querySelectorAll(UNSAFE_TAG_SELECTOR).forEach((node) => node.remove())
  doc.querySelectorAll('*').forEach((el) => {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase()
      const val = attr.value.trim().toLowerCase()
      if (name.startsWith('on') || name === 'style' || PRESENTATIONAL_ATTRS_TO_REMOVE.has(name)) {
        el.removeAttribute(attr.name)
        continue
      }
      if (name === 'href' || name === 'src' || name === 'xlink:href') {
        const allowed = val.startsWith('http://')
          || val.startsWith('https://')
          || val.startsWith('mailto:')
          || val.startsWith('tel:')
          || (val.startsWith('/') && !val.startsWith('//'))
          || val.startsWith('#')
        if (!allowed) el.removeAttribute(attr.name)
      }
    }

    if (el.tagName?.toLowerCase() === 'a' && (el.getAttribute('target') || '').toLowerCase() === '_blank') {
      const tokens = (el.getAttribute('rel') || '').split(/\s+/).filter(Boolean)
      if (!tokens.includes('noopener')) tokens.push('noopener')
      if (!tokens.includes('noreferrer')) tokens.push('noreferrer')
      el.setAttribute('rel', tokens.join(' '))
    }
  })

  return doc.body.innerHTML
}

export function formatPreviewHtml(value) {
  const raw = String(value ?? '')
  if (!raw.trim()) return ''
  if (!HTML_TAG_REGEX.test(raw)) return escapeHtml(raw).replace(/\r?\n/g, '<br />')
  return sanitizeHtml(raw)
}

export function previewVisibleLength(value) {
  const raw = String(value ?? '')
  if (!raw.trim()) return 0
  if (!HTML_TAG_REGEX.test(raw)) return raw.length
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return raw.replace(/<[^>]+>/g, '').length
  }
  const parser = new DOMParser()
  const doc = parser.parseFromString(raw, 'text/html')
  return (doc.body.textContent || '').trim().length
}
