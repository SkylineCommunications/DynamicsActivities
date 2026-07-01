import { useState, useEffect, useRef } from 'react'

/**
 * Reusable autocomplete picker.
 *
 * Props:
 *   searchFn(query) → Promise<item[]>   — called with debounce
 *   getKey(item)    → string             — unique key per item
 *   getLabel(item)  → string             — primary display text
 *   getSublabel(item) → string|null      — secondary display text (optional)
 *   value           — currently selected item or null
 *   onChange(item)  — called when item is selected (or null when cleared)
 *   placeholder     — input placeholder text
 *   clearOnPick     — if true, clears input after selection (for multi-add flows)
 *   minChars        — minimum chars before searching (default 2)
 *   debounce        — ms delay (default 300)
 */
export default function AutocompletePicker({
  searchFn,
  getKey,
  getLabel,
  getSublabel,
  value,
  onChange,
  onEnter,
  placeholder = 'Search…',
  clearOnPick = false,
  autoSelectSingle = false,
  minChars = 2,
  debounce = 300,
  showOnFocus = false,
}) {
  const [query, setQuery] = useState(value ? getLabel(value) : '')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const timer = useRef(null)
  const listRef = useRef(null)

  // Sync input label when value is set externally
  useEffect(() => {
    if (!clearOnPick) {
      setQuery(value ? getLabel(value) : '')
    }
  }, [value])

  function handleInput(e) {
    const q = e.target.value
    setQuery(q)
    if (!q && minChars > 0) {
      onChange(null)
      setResults([])
      setOpen(false)
      return
    }
    if (q.trim().length < minChars) {
      setResults([])
      setOpen(false)
      return
    }
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await searchFn(q.trim())
        if (res.length === 1 && autoSelectSingle) {
          pick(res[0])
        } else {
          setResults(res)
          setActiveIndex(-1)
          setOpen(res.length > 0)
        }
      } finally {
        setLoading(false)
      }
    }, debounce)
  }

  function pick(item) {
    onChange(item)
    setQuery(clearOnPick ? '' : getLabel(item))
    setOpen(false)
    setResults([])
    setActiveIndex(-1)
  }

  function handleKeyDown(e) {
    if (!open) {
      if (e.key === 'Enter' && onEnter) onEnter()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => {
        const next = Math.min(i + 1, results.length - 1)
        scrollItemIntoView(next)
        return next
      })
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => {
        const next = Math.max(i - 1, 0)
        scrollItemIntoView(next)
        return next
      })
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIndex >= 0 && activeIndex < results.length) {
        pick(results[activeIndex])
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
      setActiveIndex(-1)
    }
  }

  function scrollItemIntoView(index) {
    if (!listRef.current) return
    const item = listRef.current.children[index]
    if (item) item.scrollIntoView({ block: 'nearest' })
  }

  return (
    <div className="search-wrap">
      <input
        className="input"
        placeholder={placeholder}
        value={query}
        onChange={handleInput}
        onBlur={() => setTimeout(() => { setOpen(false); setActiveIndex(-1) }, 150)}
        onFocus={() => {
          if (results.length > 0) { setOpen(true); return }
          if (showOnFocus && !value && query.trim().length >= minChars) {
            // Trigger a search with current (possibly empty) query
            ;(async () => {
              setLoading(true)
              try {
                const res = await searchFn(query.trim())
                setResults(res)
                setActiveIndex(-1)
                setOpen(res.length > 0)
              } finally {
                setLoading(false)
              }
            })()
          }
        }}
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />
      {loading && <span className="search-loading">…</span>}
      {open && (
        <ul className="dropdown" ref={listRef}>
          {results.map((item, i) => (
            <li
              key={getKey(item)}
              className={i === activeIndex ? 'active' : ''}
              onMouseDown={() => pick(item)}
              onMouseEnter={() => setActiveIndex(i)}
            >
              <span>{getLabel(item)}</span>
              {getSublabel && getSublabel(item) && (
                <span className="dropdown-sub">{getSublabel(item)}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
