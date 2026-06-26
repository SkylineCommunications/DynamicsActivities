import { useState, useEffect, useCallback } from 'react'
import { useMsal } from '@azure/msal-react'
import {
  searchActivities,
  searchAccounts,
  searchContacts,
  extractAttendees,
  noteTypeLabel,
  noteDate,
  getDynamicsUrl,
  deleteActivity,
  ACTIVITY_TYPES,
  ESCALATION_STATUSES,
} from '../api/dataverse'
import AutocompletePicker from './AutocompletePicker'

// Derive icon and CSS class maps from ACTIVITY_TYPES
const TYPE_ICONS = Object.fromEntries(ACTIVITY_TYPES.map((t) => [t.label, t.iconLigature || t.icon]))
const TYPE_CLASSES = Object.fromEntries(ACTIVITY_TYPES.map((t) => [t.label, t.cssClass]))

// Fallbacks for activities not created by this app
TYPE_ICONS['Call'] ??= 'contact_phone'
TYPE_ICONS['Meeting'] ??= 'calendar_today'
TYPE_ICONS['Escalation'] ??= 'warning'
TYPE_CLASSES['Call'] ??= 'type-call'
TYPE_CLASSES['Meeting'] ??= 'type-visit'
TYPE_CLASSES['Escalation'] ??= 'type-escalation'

const FILTER_TYPES = [{ value: '', label: 'All' }, ...ACTIVITY_TYPES.map((t) => ({ value: t.id, label: t.label }))]

function fmtDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function NoteCard({ note, expanded, onToggle, onDelete }) {
  const { instance } = useMsal()
  const label = noteTypeLabel(note)
  const date = noteDate(note)
  const attendees = extractAttendees(note)
  const accountName = note['_regardingobjectid_value@OData.Community.Display.V1.FormattedValue'] || ''
  const preview = note.description || ''
  const dynamicsUrl = getDynamicsUrl(note._entityType, note.activityid)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete(e) {
    e.stopPropagation()
    if (!confirmDelete) { setConfirmDelete(true); return }
    setDeleting(true)
    try {
      await deleteActivity(instance, note._entityType, note.activityid)
      onDelete(note.activityid)
    } catch (err) {
      alert('Delete failed: ' + err.message)
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  function cancelDelete(e) {
    e.stopPropagation()
    setConfirmDelete(false)
  }

  return (
    <div className={`note-card ${expanded ? 'expanded' : ''}`} onClick={onToggle}>
      <div className="note-card-header">
        <span className={`type-badge ${TYPE_CLASSES[label] || ''}`}>
          <span className="icon icon-sm">{TYPE_ICONS[label]}</span> {label}
        </span>
        <div className="note-card-header-right">
          <span className="note-date">{fmtDate(date)}</span>
          <a
            className="btn-card-action btn-open"
            href={dynamicsUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            Open in Dynamics <span className="icon icon-sm" aria-hidden="true">open_in_new</span>
          </a>
          {confirmDelete ? (
            <>
              <button
                type="button"
                className="btn-card-action btn-confirm-delete"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? 'Deleting…' : 'Confirm delete'}
              </button>
              <button
                type="button"
                className="btn-card-action btn-cancel"
                onClick={cancelDelete}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn-card-action btn-delete"
              onClick={handleDelete}
              title="Delete activity"
            >
              <span className="icon icon-sm">delete</span>
            </button>
          )}
        </div>
      </div>

      {note.subject && <div className="note-subject">{note.subject}</div>}
      {accountName && <div className="note-account"><span className="icon icon-sm">business_center</span> Regarding: {accountName}</div>}

      {/* Escalation status badge */}
      {note._entityType === 'slc_escalations' && note.slc_status && (
        <div className="note-escalation-status">
          <span className={`escalation-badge ${(ESCALATION_STATUSES.find((s) => s.value === note.slc_status) || {}).cssClass || ''}`}>
            {(ESCALATION_STATUSES.find((s) => s.value === note.slc_status) || {}).label || `Status ${note.slc_status}`}
          </span>
          {note.slc_startdate && (
            <span className="escalation-start">Started: {fmtDate(note.slc_startdate)}</span>
          )}
          {note.slc_resolveddate && (
            <span className="escalation-resolved">Resolved: {fmtDate(note.slc_resolveddate)}</span>
          )}
        </div>
      )}

      {attendees.length > 0 && (
        <div className="note-attendees">
          {attendees.map((a, i) => (
            <span key={i} className={`chip-sm ${a.type === 'external' ? 'chip-unlinked' : 'chip-linked'}`}>
              <span className="icon icon-sm">{a.type !== 'external' ? 'check_circle' : 'radio_button_unchecked'}</span> {a.name}
            </span>
          ))}
        </div>
      )}

      <div className={`note-text ${expanded ? '' : 'clamped'}`}>
        {preview || <em className="empty-text">No note text</em>}
      </div>

      {!expanded && preview.length > 140 && (
        <span className="show-more">Show more ▾</span>
      )}
    </div>
  )
}

export default function NotesList({ refreshKey }) {
  const { instance } = useMsal()
  const [notes, setNotes] = useState(null) // null = no search run yet
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [expandedId, setExpandedId] = useState(null)

  // Filter state
  const [account, setAccount] = useState(null)   // { accountid, name }
  const [attendee, setAttendee] = useState(null) // { contactid, fullname }
  const [activityType, setActivityType] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const runSearch = useCallback(() => {
    setLoading(true)
    setError(null)
    searchActivities(instance, {
      accountId: account?.accountid ?? null,
      contactId: attendee?.contactid ?? null,
      activityType: activityType || null,
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
    })
      .then(setNotes)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [instance, account, attendee, activityType, dateFrom, dateTo])

  // Re-run last search when a new note is created, but only if search was already done
  useEffect(() => {
    if (notes !== null) runSearch()
  }, [refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="notes-container">
      {/* Filter panel */}
      <div className="filter-panel">
        <div className="filter-row">
          <div className="filter-field">
            <label className="filter-label">Regarding</label>
            <AutocompletePicker
              searchFn={(q) => searchAccounts(instance, q)}
              getKey={(a) => a.accountid}
              getLabel={(a) => a.name}
              value={account}
              onChange={setAccount}
              onEnter={runSearch}
              placeholder="Search account…"
              minChars={2}
              autoSelectSingle
            />
          </div>
          <div className="filter-field">
            <label className="filter-label">Attendee</label>
            <AutocompletePicker
              searchFn={(q) => searchContacts(instance, q)}
              getKey={(c) => c.contactid}
              getLabel={(c) => c.fullname}
              getSublabel={(c) => c.emailaddress1}
              value={attendee}
              onChange={setAttendee}
              onEnter={runSearch}
              placeholder="Search contact…"
              minChars={2}
              autoSelectSingle
            />
          </div>
        </div>

        <div className="filter-row filter-row-controls">
          <div className="filter-field">
            <label className="filter-label">Activity Type</label>
            <div className="filter-type-btns">
          {FILTER_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  className={`filter-type-btn ${activityType === t.value ? 'active' : ''}`}
                  onClick={() => setActivityType(t.value)}
                >
                  {t.value && <span className="icon icon-sm">{TYPE_ICONS[t.label]}</span>}{t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="filter-field filter-field-date">
            <label className="filter-label">From</label>
            <input
              type="date"
              className="input"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runSearch()}
            />
          </div>
          <div className="filter-field filter-field-date">
            <label className="filter-label">To</label>
            <input
              type="date"
              className="input"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runSearch()}
            />
          </div>
          <button
            type="button"
            className="btn btn-primary filter-search-btn"
            onClick={runSearch}
            disabled={loading}
          >
            {loading ? 'Searching…' : 'Search'}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {notes === null && !loading && (
        <div className="empty-state">
          <div className="empty-icon"><span className="icon icon-lg">search</span></div>
          <div className="empty-title">Set filters to search activities</div>
          <div className="empty-sub">Use the filters above to find activities across the organisation.</div>
        </div>
      )}

      {notes !== null && !loading && notes.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon"><span className="icon icon-lg">checklist</span></div>
          <div className="empty-title">No activities found</div>
          <div className="empty-sub">Try adjusting your filters.</div>
        </div>
      )}

      {loading && <div className="loading-text">Searching…</div>}

      {notes !== null && notes.length > 0 && (
        <div className="notes-list">
          {notes.map((n) => (
            <NoteCard
              key={n.activityid}
              note={n}
              expanded={expandedId === n.activityid}
              onToggle={() => setExpandedId((prev) => (prev === n.activityid ? null : n.activityid))}
              onDelete={(id) => setNotes((prev) => prev.filter((x) => x.activityid !== id))}
            />
          ))}
        </div>
      )}
    </div>
  )
}
