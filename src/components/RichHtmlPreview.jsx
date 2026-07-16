import { useEffect, useRef } from 'react'

const HTML_TAG_REGEX = /<\/?[a-z][\s\S]*>/i
const UNSAFE_TAG_SELECTOR = 'script,style,iframe,object,embed,link,meta,base,form,input,button,textarea,select,option,svg,math'
const PRESENTATIONAL_ATTRS_TO_REMOVE = new Set(['color', 'bgcolor', 'background', 'face'])
const RICH_PREVIEW_SHADOW_CSS = `
  :host { display: block; }
  .content {
    font-size: 14px;
    color: var(--color10);
    line-height: 24px;
    white-space: normal;
    word-break: break-word;
    overflow-wrap: anywhere;
  }
  .content p,
  .content ul,
  .content ol {
    margin: 0 0 8px;
  }
  .content p:last-child,
  .content ul:last-child,
  .content ol:last-child {
    margin-bottom: 0;
  }
  .content ul,
  .content ol {
    padding-left: 18px;
  }
  .content a {
    color: var(--hyperlink);
  }
  .content font[color],
  .content [color],
  .content [bgcolor],
  .content [background] {
    color: inherit !important;
    background-color: transparent !important;
  }
  .content table,
  .content tr,
  .content td,
  .content th {
    background-color: transparent !important;
    border-color: var(--color5) !important;
  }
  .content img {
    max-width: 100%;
    height: auto;
  }
  .content.clamped {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
`

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

export default function RichHtmlPreview({ html, fallback = '', clamped = false }) {
  const hostRef = useRef(null)
  const previewHtml = formatPreviewHtml(html || fallback)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const shadowRoot = host.shadowRoot || host.attachShadow({ mode: 'open' })
    const styleEl = document.createElement('style')
    styleEl.textContent = RICH_PREVIEW_SHADOW_CSS
    const contentEl = document.createElement('div')
    contentEl.className = clamped ? 'content clamped' : 'content'
    contentEl.innerHTML = previewHtml
    shadowRoot.replaceChildren(styleEl, contentEl)
  }, [previewHtml, clamped])

  return previewHtml
    ? <div className="note-text-shadow-host" ref={hostRef} />
    : <em>No preview available</em>
}
