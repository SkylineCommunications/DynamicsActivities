import { useState, useEffect, useRef } from 'react'

/**
 * Reusable autocomplete picker.
 *
 * searchFn(query, paging) may return an item array or { items, hasMore }.
 * paging contains skip, top, and preferredIds.
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
  showSelectedIndicator = false,
  minChars = 2,
  debounce = 300,
  loadOnFocus = false,
  allowEmptySearch = false,
  preferredIds = [],
  pageSize = 25,
}) {
  const [query, setQuery] = useState(value ? getLabel(value) : '')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const timer = useRef(null)
  const listRef = useRef(null)
  const requestRef = useRef(0)

  useEffect(() => {
    if (!clearOnPick) setQuery(value ? getLabel(value) : '')
  }, [value])

  function normaliseResponse(response, requestedPageSize) {
    if (Array.isArray(response)) {
      return { items: response, hasMore: response.length >= requestedPageSize }
    }
    return {
      items: response?.items ?? response?.results ?? [],
      hasMore: response?.hasMore ?? false,
    }
  }

  async function loadResults({ reset = false, queryValue = query } = {}) {
    const q = queryValue.trim()
    if (q.length < minChars && !(allowEmptySearch && q.length === 0)) {
      if (reset) {
        setResults([])
        setHasMore(false)
        setOpen(false)
      }
      return
    }

    const requestId = ++requestRef.current
    setLoading(true)
    try {
      const response = await searchFn(q, {
        skip: reset ? 0 : results.length,
        top: pageSize,
        preferredIds,
      })
      if (requestId !== requestRef.current) return
      const { items, hasMore: more } = normaliseResponse(response, pageSize)
      if (reset && items.length === 1 && autoSelectSingle) {
        pick(items[0])
        return
      }
      setResults((current) => {
        if (reset) return items
        const seen = new Set(current.map((item) => getKey(item)))
        return [...current, ...items.filter((item) => !seen.has(getKey(item)))]
      })
      setHasMore(more)
      setActiveIndex(-1)
      setOpen(true)
    } finally {
      if (requestId === requestRef.current) setLoading(false)
    }
  }

  function scheduleSearch(queryValue, reset = true) {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => loadResults({ reset, queryValue }), debounce)
  }

  function handleInput(e) {
    const q = e.target.value
    setQuery(q)
    if (!q) {
      onChange(null)
      if (allowEmptySearch) scheduleSearch(q)
      else {
        clearTimeout(timer.current)
        setResults([])
        setHasMore(false)
        setOpen(false)
      }
      return
    }
    if (q.trim().length < minChars) {
      setResults([])
      setHasMore(false)
      setOpen(false)
      return
    }
    scheduleSearch(q)
  }

  function pick(item) {
    onChange(item)
    setQuery(clearOnPick ? '' : getLabel(item))
    setOpen(false)
    setResults([])
    setHasMore(false)
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
      if (activeIndex >= 0 && activeIndex < results.length) pick(results[activeIndex])
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

  function handleListScroll(e) {
    if (!hasMore || loading) return
    const element = e.currentTarget
    if (element.scrollTop + element.clientHeight < element.scrollHeight - 24) return
    loadResults({ queryValue: query, reset: false })
  }

  return (
    <div className={`search-wrap ${showSelectedIndicator && value ? 'has-selection' : ''}`}>
      <input
        className="input"
        placeholder={placeholder}
        value={query}
        onChange={handleInput}
        onBlur={() => setTimeout(() => { setOpen(false); setActiveIndex(-1) }, 150)}
        onFocus={() => {
          if (loadOnFocus) scheduleSearch(query)
          else if (results.length > 0) setOpen(true)
        }}
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />
      {showSelectedIndicator && value && (
        <span className="search-selected" title="Account selected" aria-label="Account selected">
          <span className="icon icon-sm" aria-hidden="true">check_circle</span>
        </span>
      )}
      {loading && <span className="search-loading">…</span>}
      {open && (
        <ul className="dropdown" ref={listRef} onScroll={handleListScroll}>
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
          {!loading && results.length === 0 && <li className="dropdown-empty">No matches</li>}
        </ul>
      )}
    </div>
  )
}
