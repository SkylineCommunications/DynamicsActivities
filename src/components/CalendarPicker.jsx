import { useState, useEffect, useMemo } from 'react'
import { useMsal } from '@azure/msal-react'
import { getRecentCalendarEvents } from '../api/graph'

const MAX_ATTENDEES_SHOWN = 4

function fmtEventDate(d) {
  if (!d) return ''
  const now = new Date()
  const diffDays = Math.round((d - now) / (1000 * 60 * 60 * 24))
  const timeStr = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

  if (diffDays === 0) return `Today ${timeStr}`
  if (diffDays === 1) return `Tomorrow ${timeStr}`
  if (diffDays === -1) return `Yesterday ${timeStr}`
  if (diffDays > 1 && diffDays <= 7) return `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${timeStr}`
  return `${dateStr} ${timeStr}`
}

export default function CalendarPicker({ onSelect, onClose }) {
  const { instance } = useMsal()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    getRecentCalendarEvents(instance)
      .then(setEvents)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [instance])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return events
    return events.filter((ev) => {
      const attendeeNames = ev.attendees.map((a) => (a.name || a.email).toLowerCase()).join(' ')
      return (
        ev.subject.toLowerCase().includes(q) ||
        (ev.location || '').toLowerCase().includes(q) ||
        attendeeNames.includes(q)
      )
    })
  }, [events, search])

  // Auto-select when search narrows to exactly one result
  useEffect(() => {
    if (filtered.length === 1 && search.trim()) {
      onSelect(filtered[0])
    }
  }, [filtered])

  // Group into upcoming vs past
  const now = new Date()
  const upcoming = filtered.filter((e) => e.start && e.start >= now)
  const past = filtered.filter((e) => !e.start || e.start < now)

  function renderEvent(ev) {
    const shownAttendees = ev.attendees.slice(0, MAX_ATTENDEES_SHOWN)
    const extraCount = ev.attendees.length - MAX_ATTENDEES_SHOWN

    return (
      <button
        key={ev.id}
        type="button"
        className="calendar-item"
        onClick={() => onSelect(ev)}
      >
        <div className="calendar-item-header">
          <span className="calendar-item-subject">{ev.subject}</span>
          <span className="calendar-item-date">{fmtEventDate(ev.start)}</span>
        </div>
        {ev.location && <div className="calendar-item-meta">📍 {ev.location}</div>}
        {ev.attendees.length > 0 && (
          <div className="calendar-item-meta">
            👥{' '}
            {shownAttendees.map((a) => a.name || a.email).join(', ')}
            {extraCount > 0 && <span className="calendar-item-extra"> +{extraCount} more</span>}
          </div>
        )}
      </button>
    )
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h3 className="modal-title">Pick from calendar</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="modal-search">
          <input
            className="input"
            placeholder="Search by title, attendee or location…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        <div className="modal-body">
          {loading && <p className="loading-text">Loading calendar…</p>}
          {error && (
            <div className="alert alert-error">
              <strong>Calendar not available.</strong><br />
              Make sure the app has <em>Calendars.Read</em> permission.<br />
              <small>{error}</small>
            </div>
          )}

          {!loading && !error && filtered.length === 0 && (
            <p className="empty-text">{search ? 'No events match your search.' : 'No calendar events found.'}</p>
          )}

          {upcoming.length > 0 && (
            <div className="calendar-group">
              <div className="calendar-group-label">Upcoming</div>
              {[...upcoming].reverse().map(renderEvent)}
            </div>
          )}

          {past.length > 0 && (
            <div className="calendar-group">
              <div className="calendar-group-label">Past (last 60 days)</div>
              {past.map(renderEvent)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
