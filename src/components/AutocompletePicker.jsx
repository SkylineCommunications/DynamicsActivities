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
  placeholder = 'Search…',
  clearOnPick = false,
  minChars = 2,
  debounce = 300,
}) {
  const [query, setQuery] = useState(value ? getLabel(value) : '')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const timer = useRef(null)

  // Sync input label when value is set externally
  useEffect(() => {
    if (!clearOnPick) {
      setQuery(value ? getLabel(value) : '')
    }
  }, [value])

  // Auto-select when exactly one result remains
  useEffect(() => {
    if (results.length === 1 && query.trim().length >= minChars) {
      pick(results[0])
    }
  }, [results])

  function handleInput(e) {
    const q = e.target.value
    setQuery(q)
    if (!q) {
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
        setResults(res)
        setOpen(res.length > 0)
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
  }

  return (
    <div className="search-wrap">
      <input
        className="input"
        placeholder={placeholder}
        value={query}
        onChange={handleInput}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onFocus={() => results.length > 0 && setOpen(true)}
        autoComplete="off"
      />
      {loading && <span className="search-loading">…</span>}
      {open && (
        <ul className="dropdown">
          {results.map((item) => (
            <li key={getKey(item)} onMouseDown={() => pick(item)}>
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
