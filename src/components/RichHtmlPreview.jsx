import { useEffect, useRef } from 'react'
import { formatPreviewHtml } from '../utils/htmlPreview'
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

export { formatPreviewHtml, previewVisibleLength } from '../utils/htmlPreview'

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
