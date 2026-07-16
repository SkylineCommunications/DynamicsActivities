import { useState, useEffect, useCallback, useRef } from 'react'
import { useMsal } from '@azure/msal-react'
import {
  searchActivities,
  searchAccounts,
  searchContacts,
  extractAttendees,
  noteTypeLabel,
  noteDate,
  getDynamicsUrl,
  getUserCanManageLeads,
  ACTIVITY_TYPES,
  ESCALATION_STATUSES,
} from '../api/dataverse'
import { summarizeActivities } from '../api/activitySummary'
import AutocompletePicker from './AutocompletePicker'
import { navigate } from '../hooks/useHashRoute'
import { useLicenseTest, resolveCanManageLeads } from '../context/LicenseTestContext'

// Derive icon and CSS class maps from ACTIVITY_TYPES
const TYPE_ICONS = Object.fromEntries(ACTIVITY_TYPES.map((t) => [t.label, t.iconLigature || t.icon]))
const TYPE_CLASSES = Object.fromEntries(ACTIVITY_TYPES.map((t) => [t.label, t.cssClass]))
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

// Fallbacks for activities not created by this app
TYPE_ICONS['Call'] ??= 'contact_phone'
TYPE_ICONS['Meeting'] ??= 'calendar_today'
TYPE_ICONS['Escalation'] ??= 'warning'
TYPE_ICONS['Note'] ??= 'edit_note'
TYPE_CLASSES['Call'] ??= 'type-call'
TYPE_CLASSES['Meeting'] ??= 'type-visit'

const BROWSE_VIEWS = [
  {
    id: 'activities',
    label: 'Activities',
    hint: 'Timeline with calls, appointments, emails, escalations, and notes.',
    typeIds: ['phonecall', 'appointment', 'email', 'escalation', 'note'],
    emptyTitle: 'No activities found',
  },
  {
    id: 'opportunities',
    label: 'Opportunities',
    hint: 'Select an account under Regarding to browse sales opportunities.',
    typeIds: ['opportunity'],
    emptyTitle: 'No opportunities found',
    // Team Member users (no native lead/opportunity access) can submit one via email.
    addFormId: 'opportunity',
    addLabel: 'Add opportunity',
    addIcon: 'lightbulb',
  },
  {
    id: 'leads',
    label: 'Leads',
    hint: 'Select an account under Regarding to browse lead records.',
    typeIds: ['lead'],
    emptyTitle: 'No leads found',
    // Team Member users (no native lead/opportunity access) can submit one via email.
    addFormId: 'lead',
    addLabel: 'Add lead',
    addIcon: 'person_add',
  },
  {
    id: 'support',
    label: 'Support',
    hint: 'Select an account under Regarding to browse support renewals.',
    typeIds: ['support'],
    emptyTitle: 'No support records found',
  },
]

// Persist the active browse view so it survives leaving for a standalone form
// (e.g. "Add lead") and returning — the user lands back on the view they were in.
const ACTIVE_VIEW_STORAGE_KEY = 'dm-activities-active-view'

function readStoredActiveView() {
  try {
    const stored = sessionStorage.getItem(ACTIVE_VIEW_STORAGE_KEY)
    return BROWSE_VIEWS.some((v) => v.id === stored) ? stored : 'activities'
  } catch {
    return 'activities'
  }
}

function fmtDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtIsoDate(d) {
  if (!d) return ''
  const parsed = new Date(d)
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString()
}

function stripHtmlTags(value) {
  const raw = String(value ?? '')
  if (!raw.trim()) return ''
  if (typeof DOMParser === 'undefined') {
    return raw.replace(/<[^>]+>/g, ' ')
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(raw, 'text/html')
  return doc.body.textContent || ''
}

function noteRecordId(note) {
  if (note?._entityType === 'slc_escalations') return note.slc_escalationid
  return note.activityid || note.annotationid
}

function toSummaryActivity(note) {
  const description = stripHtmlTags(note.notetext || note.description || '')
    .replace(/\s+/g, ' ')
    .trim()
  const regarding = note['_slc_accountid_value@OData.Community.Display.V1.FormattedValue']
    || note['_regardingobjectid_value@OData.Community.Display.V1.FormattedValue']
    || note['_parentaccountid_value@OData.Community.Display.V1.FormattedValue']
    || ''

  return {
    createdOnUtc: fmtIsoDate(noteDate(note)),
    type: noteTypeLabel(note),
    subject: note.subject || '',
    regarding,
    description: description.slice(0, 260),
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function sanitizeHtml(value) {
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') return escapeHtml(value)
  const parser = new DOMParser()
  const doc = parser.parseFromString(value, 'text/html')

  doc.querySelectorAll(UNSAFE_TAG_SELECTOR).forEach((node) => node.remove())
  doc.querySelectorAll('*').forEach((el) => {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase()
      const val = attr.value.trim()
      if (name.startsWith('on') || name === 'style') {
        el.removeAttribute(attr.name)
        continue
      }
      if (PRESENTATIONAL_ATTRS_TO_REMOVE.has(name)) {
        el.removeAttribute(attr.name)
        continue
      }
      if (name === 'href' || name === 'src' || name === 'xlink:href') {
        const lower = val.toLowerCase()
        const allowed = lower.startsWith('http://')
          || lower.startsWith('https://')
          || lower.startsWith('mailto:')
          || lower.startsWith('tel:')
          || (lower.startsWith('/') && !lower.startsWith('//'))
          || lower.startsWith('#')
        if (!allowed) el.removeAttribute(attr.name)
      }
    }
  })

  return doc.body.innerHTML
}

function formatPreviewHtml(value) {
  const raw = String(value ?? '')
  if (!raw.trim()) return ''
  if (!HTML_TAG_REGEX.test(raw)) return escapeHtml(raw).replace(/\r?\n/g, '<br />')
  return sanitizeHtml(raw)
}

function previewVisibleLength(value) {
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

function RichPreview({ html, clamped }) {
  const hostRef = useRef(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const shadowRoot = host.shadowRoot || host.attachShadow({ mode: 'open' })
    const styleEl = document.createElement('style')
    styleEl.textContent = RICH_PREVIEW_SHADOW_CSS

    const contentEl = document.createElement('div')
    contentEl.className = clamped ? 'content clamped' : 'content'
    contentEl.innerHTML = html

    shadowRoot.replaceChildren(styleEl, contentEl)
  }, [html, clamped])

  return <div className="note-text-shadow-host" ref={hostRef} />
}

function NoteCard({ note, expanded, onToggle }) {
  const label = noteTypeLabel(note)
  const date = noteDate(note)
  const attendees = extractAttendees(note)
  const accountName = note['_slc_accountid_value@OData.Community.Display.V1.FormattedValue']
    || note['_regardingobjectid_value@OData.Community.Display.V1.FormattedValue']
    || note['_parentaccountid_value@OData.Community.Display.V1.FormattedValue']
    || ''
  const rawPreview = note.notetext || note.description || ''
  const preview = rawPreview.replace(/^\[Linked to escalation]\n?/, '')
  const previewHtml = formatPreviewHtml(preview)
  const previewLength = previewVisibleLength(preview)
  const recordId = noteRecordId(note)
  const dynamicsUrl = recordId ? getDynamicsUrl(note._entityType, recordId) : null

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

      {preview ? (
        <div className="note-text">
          <RichPreview html={previewHtml} clamped={!expanded} />
        </div>
      ) : (
        <div className={`note-text ${expanded ? '' : 'clamped'}`}>
          <em className="empty-text">No note text</em>
        </div>
      )}

      {!expanded && previewLength > 140 && (
        <span className="show-more">Show more ▾</span>
      )}
    </div>
  )
}

export default function NotesList({ refreshKey, initialAccount, managedAccounts = [], tamLoading = false, currentUserId }) {
  const { instance } = useMsal()
  const { override } = useLicenseTest()
  const summaryRequestRef = useRef(0)
  const [notes, setNotes] = useState(null) // null = no search run yet
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [timelineSummary, setTimelineSummary] = useState(null)
  const [timelineSummaryLoading, setTimelineSummaryLoading] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [tamAutoApplied, setTamAutoApplied] = useState(false)
  const [activeViewId, setActiveViewId] = useState(readStoredActiveView)
  const [canManageLeads, setCanManageLeads] = useState(false)

  // Remember the active view so returning from a standalone form restores it.
  useEffect(() => {
    try { sessionStorage.setItem(ACTIVE_VIEW_STORAGE_KEY, activeViewId) } catch {}
  }, [activeViewId])

  // Team Member CAL users cannot create leads/opportunities natively in Dynamics,
  // so they get the email-based "Add lead" / "Add opportunity" forms instead.
  // Sales/Enterprise users manage these directly in Dynamics and don't see the buttons.
  const isTeamMember = !resolveCanManageLeads(override, canManageLeads)

  useEffect(() => {
    if (!currentUserId) return
    getUserCanManageLeads(instance, currentUserId)
      .then(setCanManageLeads)
      .catch(() => setCanManageLeads(false))
  }, [instance, currentUserId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Filter state
  const [accounts, setAccounts] = useState(initialAccount ? [initialAccount] : [])
  const [attendees, setAttendees] = useState([]) // [{ contactid, fullname }]
  const [selectedTypes, setSelectedTypes] = useState(new Set()) // empty = all
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const activeView = BROWSE_VIEWS.find((v) => v.id === activeViewId) || BROWSE_VIEWS[0]
  const allowedTypeIds = new Set(activeView.typeIds)
  const allowedTypes = ACTIVITY_TYPES.filter((t) => allowedTypeIds.has(t.id))

  useEffect(() => {
    setSelectedTypes(new Set())
  }, [activeViewId])

  // When initialAccount changes (e.g. after note creation), update the "Regarding" filter
  useEffect(() => {
    if (initialAccount) {
      setAccounts((prev) => {
        if (prev.some((a) => a.accountid === initialAccount.accountid)) return prev
        return [...prev, initialAccount]
      })
    }
  }, [initialAccount])

  // TAM auto-select: pre-fill managed accounts when they change
  useEffect(() => {
    if (tamLoading) return
    if (!managedAccounts.length) return
    if (initialAccount) return // don't override when navigated from Create
    setAccounts(managedAccounts)
    setTamAutoApplied(true)
  }, [tamLoading, managedAccounts, initialAccount])

  const runSearch = useCallback(() => {
    setLoading(true)
    setError(null)
    setTimelineSummary(null)
    setTimelineSummaryLoading(false)
    searchActivities(instance, {
      accountIds: accounts.map((a) => a.accountid),
      contactIds: attendees.map((a) => a.contactid),
      activityTypes: [...(selectedTypes.size ? [...selectedTypes].filter((t) => allowedTypeIds.has(t)) : activeView.typeIds)],
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
    })
      .then((results) => {
        setNotes(results)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [instance, accounts, attendees, selectedTypes, dateFrom, dateTo, activeViewId])

  // Auto-search when navigated here after note creation, or re-run on refresh
  useEffect(() => {
    if (initialAccount || notes !== null) runSearch()
  }, [refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-search after TAM accounts were auto-applied
  useEffect(() => {
    if (tamAutoApplied && accounts.length && notes === null) runSearch()
  }, [tamAutoApplied]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeViewId !== 'activities') {
      setTimelineSummary(null)
      setTimelineSummaryLoading(false)
      return
    }

    if (!Array.isArray(notes) || notes.length === 0) {
      setTimelineSummary(null)
      setTimelineSummaryLoading(false)
      return
    }

    const payload = {
      scopeLabel: accounts.length ? accounts.map((account) => account.name).join(', ') : 'All accounts',
      fromUtc: dateFrom ? new Date(dateFrom).toISOString() : null,
      untilUtc: dateTo ? new Date(dateTo).toISOString() : null,
      activities: notes.slice(0, 50).map(toSummaryActivity),
    }

    const requestId = summaryRequestRef.current + 1
    summaryRequestRef.current = requestId
    setTimelineSummaryLoading(true)
    setTimelineSummary(null)

    summarizeActivities(payload)
      .then((result) => {
        if (summaryRequestRef.current !== requestId) return
        const summaryText = typeof result?.summary === 'string' ? result.summary.trim() : ''
        if (!summaryText) {
          setTimelineSummary(null)
          return
        }

        const generatedBy = result.generatedBy === 'assistant' ? 'assistant' : 'fallback'
        const summaryHtmlRaw = typeof result?.summaryHtml === 'string' ? result.summaryHtml.trim() : ''
        setTimelineSummary({
          text: summaryText,
          html: formatPreviewHtml(summaryHtmlRaw || summaryText),
          generatedBy,
          warning: result.warning || null,
        })
      })
      .catch(() => {
        if (summaryRequestRef.current === requestId) setTimelineSummary(null)
      })
      .finally(() => {
        if (summaryRequestRef.current === requestId) setTimelineSummaryLoading(false)
      })
  }, [notes, activeViewId, dateFrom, dateTo, accounts])

  return (
    <div className="notes-container">
      {/* Filter panel */}
      <div className="filter-panel">
        {activeView.addFormId && isTeamMember && (
          <button
            type="button"
            className="btn btn-secondary filter-add-btn"
            onClick={() => navigate(`forms/${activeView.addFormId}`)}
          >
            <span className="icon icon-sm" aria-hidden="true">{activeView.addIcon}</span> {activeView.addLabel}
          </button>
        )}
        <div className="filter-field">
          <label className="filter-label">View</label>
          <div className="filter-mode-toggle">
            {BROWSE_VIEWS.map((view) => (
              <button
                key={view.id}
                type="button"
                className={`filter-mode-btn ${activeViewId === view.id ? 'active' : ''}`}
                onClick={() => setActiveViewId(view.id)}
              >
                {view.label}
              </button>
            ))}
          </div>
          <div className="filter-view-hint">{activeView.hint}</div>
        </div>

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
              placeholder="Search accounts…"
              minChars={2}
              clearOnPick
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
              value={null}
              onChange={(item) => {
                if (!item) return
                setAttendees((prev) => (prev.some((a) => a.contactid === item.contactid) ? prev : [...prev, item]))
              }}
              onEnter={runSearch}
              placeholder="Search contact…"
              minChars={2}
              clearOnPick
              autoSelectSingle
            />
          </div>
        </div>

        {(accounts.length > 0 || attendees.length > 0) && (
          <div className="filter-chips">
            {accounts.map((a) => (
              <span key={a.accountid} className="filter-chip">
                {a.name}
                <button
                  type="button"
                  className="chip-remove"
                  aria-label={`Remove ${a.name}`}
                  onClick={() => setAccounts((prev) => prev.filter((x) => x.accountid !== a.accountid))}
                >
                  <span className="icon icon-xs" aria-hidden="true">close</span>
                </button>
              </span>
            ))}
            {attendees.map((attendee) => (
              <span key={attendee.contactid} className="filter-chip">
                Attendee: {attendee.fullname}
                <button
                  type="button"
                  className="chip-remove"
                  aria-label={`Remove attendee ${attendee.fullname}`}
                  onClick={() => setAttendees((prev) => prev.filter((x) => x.contactid !== attendee.contactid))}
                >
                  <span className="icon icon-xs" aria-hidden="true">close</span>
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="filter-row filter-row-controls">
          {activeView.typeIds.length > 1 && (
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
                {allowedTypes.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`filter-type-btn ${selectedTypes.has(t.id) ? 'active' : ''}`}
                    aria-pressed={selectedTypes.has(t.id)}
                    onClick={() => setSelectedTypes((prev) => {
                      const next = new Set([...prev].filter((id) => allowedTypeIds.has(id)))
                      if (next.has(t.id)) next.delete(t.id)
                      else next.add(t.id)
                      return next
                    })}
                  >
                    <span className="icon icon-sm" aria-hidden="true">{TYPE_ICONS[t.label]}</span>{t.label}
                  </button>
                ))}
              </div>
            </div>
          )}
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
          <div className="empty-title">{activeView.emptyTitle}</div>
          <div className="empty-sub">Try adjusting your filters.</div>
        </div>
      )}

      {loading && <div className="loading-text">Searching…</div>}

      {notes !== null && notes.length > 0 && (
        <>
          {(timelineSummaryLoading || timelineSummary) && (
            <div className="timeline-summary-card">
              <div className="timeline-summary-title">
                <span className="icon icon-sm" aria-hidden="true">auto_awesome</span>
                Timeline highlights
              </div>
              {timelineSummaryLoading ? (
                <div className="timeline-summary-text">Generating summary…</div>
              ) : (
                <>
                  <div
                    className="timeline-summary-html"
                    dangerouslySetInnerHTML={{ __html: timelineSummary?.html || '' }}
                  />
                  <div className="timeline-summary-meta">
                    {timelineSummary?.generatedBy === 'assistant' ? 'Generated by Assistant DxM' : 'Generated by deterministic fallback'}
                  </div>
                  {timelineSummary?.warning && (
                    <div className="timeline-summary-warning">{timelineSummary.warning}</div>
                  )}
                </>
              )}
            </div>
          )}

          <div className="notes-list">
            {notes.map((n) => {
              const recordId = noteRecordId(n)

              return (
                <NoteCard
                  key={recordId}
                  note={n}
                  expanded={expandedId === recordId}
                  onToggle={() => setExpandedId((prev) => (prev === recordId ? null : recordId))}
                />
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
