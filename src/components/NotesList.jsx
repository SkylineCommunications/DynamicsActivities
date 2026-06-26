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
TYPE_CLASSES['Call'] ??= 'type-call'
TYPE_CLASSES['Meeting'] ??= 'type-visit'

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
  const accountName = note['_regardingobjectid_value@OData.Community.Display.V1.FormattedValue']
    || note['_parentaccountid_value@OData.Community.Display.V1.FormattedValue']
    || ''
  const rawPreview = note.notetext || note.description || ''
  const preview = rawPreview.replace(/^\[Linked to escalation]\n?/, '')
  const recordId = note.activityid || note.annotationid
  const dynamicsUrl = recordId ? getDynamicsUrl(note._entityType, recordId) : null
  const isReadOnly = note._entityType === 'slc_escalations' || note._entityType === 'leads' || note._entityType === 'opportunities' || note._entityType === 'support'
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete(e) {
    e.stopPropagation()
    if (!confirmDelete) { setConfirmDelete(true); return }
    setDeleting(true)
    try {
      await deleteActivity(instance, note._entityType, recordId)
      onDelete(recordId)
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
          {dynamicsUrl && (
            <a
              className="btn-card-action btn-open"
              href={dynamicsUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              Open in Dynamics <span className="icon icon-sm" aria-hidden="true">open_in_new</span>
            </a>
          )}
          {!isReadOnly && (confirmDelete ? (
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
          ))}
        </div>
      </div>

      {note.subject && note.subject !== label && <div className="note-subject">{note.subject}</div>}
      {accountName && <div className="note-account"><span className="icon icon-sm">business_center</span> Regarding: {accountName}</div>}
      {note._linkedToEscalation && (
        <div className="note-escalation-link">
          <span className="icon icon-sm">link</span> Linked to escalation
        </div>
      )}
      {note._linkedToLead && (
        <div className="note-lead-link">
          <span className="icon icon-sm">trending_up</span> Linked to lead
        </div>
      )}

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

      {/* Lead status info */}
      {note._entityType === 'leads' && (
        <div className="note-lead-status">
          <span className={`lead-badge ${note.statecode === 0 ? 'lead-open' : note.statecode === 1 ? 'lead-qualified' : 'lead-disqualified'}`}>
            {note['statuscode@OData.Community.Display.V1.FormattedValue'] || (note.statecode === 0 ? 'Open' : note.statecode === 1 ? 'Qualified' : 'Disqualified')}
          </span>
          {note.schedulefollowup_prospect && (
            <span className="lead-followup">Follow-up: {fmtDate(note.schedulefollowup_prospect)}</span>
          )}
        </div>
      )}

      {/* Opportunity status info */}
      {(note._entityType === 'opportunities' || note._entityType === 'support') && (
        <div className="note-opportunity-status">
          <span className={`opp-badge ${note.statecode === 0 ? 'opp-open' : note.statecode === 1 ? 'opp-won' : 'opp-lost'}`}>
            {note['statuscode@OData.Community.Display.V1.FormattedValue'] || (note.statecode === 0 ? 'Open' : note.statecode === 1 ? 'Won' : 'Lost')}
          </span>
          {note.estimatedvalue != null && (
            <span className="opp-value">
              {note['estimatedvalue@OData.Community.Display.V1.FormattedValue'] || Number(note.estimatedvalue).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          )}
          {note.estimatedclosedate && (
            <span className="opp-close">Est. close: {fmtDate(note.estimatedclosedate)}</span>
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

export default function NotesList({ refreshKey, initialAccount }) {
  const { instance } = useMsal()
  const [notes, setNotes] = useState(null) // null = no search run yet
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [expandedId, setExpandedId] = useState(null)

  // Filter state
  const [accounts, setAccounts] = useState(initialAccount ? [initialAccount] : [])
  const [attendee, setAttendee] = useState(null) // { contactid, fullname }
  const [selectedTypes, setSelectedTypes] = useState(new Set()) // empty = all
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // When initialAccount changes (e.g. after note creation), update the "Regarding" filter
  useEffect(() => {
    if (initialAccount) {
      setAccounts((prev) => {
        if (prev.some((a) => a.accountid === initialAccount.accountid)) return prev
        return [...prev, initialAccount]
      })
    }
  }, [initialAccount])

  const runSearch = useCallback(() => {
    setLoading(true)
    setError(null)
    searchActivities(instance, {
      accountIds: accounts.map((a) => a.accountid),
      contactId: attendee?.contactid ?? null,
      activityTypes: selectedTypes.size ? [...selectedTypes] : null,
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
    })
      .then(setNotes)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [instance, accounts, attendee, selectedTypes, dateFrom, dateTo])

  // Auto-search when navigated here after note creation, or re-run on refresh
  useEffect(() => {
    if (initialAccount || notes !== null) runSearch()
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
              value={null}
              onChange={(item) => {
                if (item && !accounts.some((a) => a.accountid === item.accountid)) {
                  setAccounts((prev) => [...prev, item])
                }
              }}
              onEnter={runSearch}
              placeholder="Search account…"
              minChars={2}
              autoSelectSingle
              clearOnPick
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

        {accounts.length > 0 && (
          <div className="filter-chips">
            {accounts.map((a) => (
              <span key={a.accountid} className="filter-chip">
                {a.name}
<button type="button" className="chip-remove" aria-label={`Remove ${a.name}`} onClick={() => setAccounts((prev) => prev.filter((x) => x.accountid !== a.accountid))}>
  <span className="icon icon-xs" aria-hidden="true">close</span>
</button>
              </span>
            ))}
          </div>
        )}

        <div className="filter-row filter-row-controls">
          <div className="filter-field">
            <label className="filter-label">Type</label>
            <div className="filter-type-btns">
<button
  type="button"
  className={`filter-type-btn ${selectedTypes.size === 0 ? 'active' : ''}`}
  aria-pressed={selectedTypes.size === 0}
  onClick={() => setSelectedTypes(new Set())}
>
                All
              </button>
              {ACTIVITY_TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`filter-type-btn ${selectedTypes.has(t.id) ? 'active' : ''}`}
                  onClick={() => setSelectedTypes((prev) => {
                    const next = new Set(prev)
                    if (next.has(t.id)) next.delete(t.id)
                    else next.add(t.id)
                    return next
                  })}
                >
                  <span className="icon icon-sm">{TYPE_ICONS[t.label]}</span>{t.label}
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
