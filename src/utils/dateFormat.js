// Shared date formatting helpers used across the app's views.
// Accept either a Date instance or a parseable date value (ISO string, number),
// so callers don't need to normalise before formatting.

// Full date and time, e.g. "22 Jul 2026, 14:00".
// `fallback` is the string returned when `value` is empty (null/undefined/'') or
// cannot be parsed into a valid date. It defaults to '' so callers get a blank
// instead of "Invalid Date"; pass a custom string (e.g. { fallback: 'Never' }) to
// show a placeholder for records that have no date yet.
export function fmtDate(value, { fallback = '' } = {}) {
  if (!value) return fallback
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  return date.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// Compact format: time only when the value is today, otherwise a short date.
export function fmtDateShort(value) {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// Normalise a date value to an ISO/UTC string, or '' when empty/unparseable.
export function fmtIsoDate(value) {
  if (!value) return ''
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString()
}

// Today's date as a local `YYYY-MM-DD` string, suitable for <input type="date">.
export function todayInputDate() {
  const now = new Date()
  const offsetMs = now.getTimezoneOffset() * 60 * 1000
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10)
}


