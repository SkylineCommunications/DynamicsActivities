import { useEffect, useMemo, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { getRecentCalendarEvents } from '../api/graph'
import {
  createContact,
  createInboxAppointmentActivity,
  findContactByEmail,
  resolveAccountForRegarding,
  searchAccounts,
  searchLeads,
  searchOpportunities,
} from '../api/dataverse'
import AutocompletePicker from './AutocompletePicker'
import { buildBrowseAccountFromRegarding } from '../services/postCreateBrowseAccount'

const REGARDING_TYPES = [
  { id: 'account', label: 'Account' },
  { id: 'opportunity', label: 'Opportunity' },
  { id: 'lead', label: 'Lead' },
]
const INTERNAL_DOMAINS = ['@skyline.be', '@dataminer.services']

function fmtDate(d) {
  if (!d) return ''
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function fmtDateShort(d) {
  if (!d) return ''
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function splitParticipants(event) {
  const participants = []
  if (event.organizer?.email) {
    participants.push({
      role: 'Organizer',
      name: event.organizer.name || event.organizer.email,
      email: event.organizer.email,
    })
  }
  for (const attendee of event.attendees ?? []) {
    if (!attendee.email) continue
    participants.push({
      role: attendee.type === 'optional' ? 'Optional' : 'Required',
      name: attendee.name || attendee.email,
      email: attendee.email,
    })
  }
  const seen = new Set()
  return participants.filter((p) => {
    const key = p.email.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function getImportRegardingPayload(regardingType, regardingItem) {
  if (!regardingItem) return { regardingId: null, regardingAccountId: null }
  const isEscalationLink = ['escalation', 'slc_escalation', 'slc_escalations'].includes(regardingType)
  return {
    regardingId: isEscalationLink
      ? regardingItem.slc_escalationid || regardingItem.activityid || null
      : regardingItem[`${regardingType}id`] || null,
    regardingAccountId: isEscalationLink
      ? regardingItem._regardingobjectid_value || regardingItem.accountid || null
      : null,
  }
}

function isInternalEmail(email) {
  const normalized = String(email || '').trim().toLowerCase()
  return INTERNAL_DOMAINS.some((domain) => normalized.endsWith(domain))
}

function splitNameParts(displayName, fallbackEmail) {
  const trimmed = String(displayName || '').trim()
  if (!trimmed) {
    return { firstname: null, lastname: fallbackEmail || 'Unknown' }
  }
  const parts = trimmed.split(/\s+/)
  if (parts.length === 1) {
    return { firstname: null, lastname: parts[0] }
  }
  return {
    firstname: parts.slice(0, -1).join(' '),
    lastname: parts[parts.length - 1],
  }
}

function CalendarAddModal({ event, onClose, onImported, selectedAccount = null }) {
  const { instance } = useMsal()
  const [regardingType, setRegardingType] = useState('account')
  const [regardingItem, setRegardingItem] = useState(() => (
    selectedAccount?.accountid ? { accountid: selectedAccount.accountid, name: selectedAccount.name } : null
  ))
  const [contactsByEmail, setContactsByEmail] = useState({})
  const [loadingContacts, setLoadingContacts] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const participants = useMemo(() => splitParticipants(event), [event])

  useEffect(() => {
    let cancelled = false
    setLoadingContacts(true)
    setContactsByEmail({})
    Promise.all(
      participants.map(async (p) => {
        const contact = await findContactByEmail(instance, p.email, selectedAccount?.accountid || null)
        return [p.email.toLowerCase(), contact]
      }),
    )
      .then((entries) => {
        if (cancelled) return
        setContactsByEmail(Object.fromEntries(entries.filter(([, c]) => c)))
      })
      .catch((e) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoadingContacts(false) })
    return () => { cancelled = true }
  }, [instance, participants, selectedAccount?.accountid])

  const suggestedAccount = useMemo(() => {
    if (regardingType !== 'account') return null
    const externalCounts = new Map()
    const internalCounts = new Map()
    for (const [email, contact] of Object.entries(contactsByEmail)) {
      const accountId = contact?._parentcustomerid_value
      const accountType = contact?.['_parentcustomerid_value@Microsoft.Dynamics.CRM.lookuplogicalname']
      if (!accountId || accountType !== 'account') continue
      const accountName =
        contact?.['_parentcustomerid_value@OData.Community.Display.V1.FormattedValue'] || 'Suggested account'
      const bucket = isInternalEmail(email) ? internalCounts : externalCounts
      const current = bucket.get(accountId) || { accountid: accountId, name: accountName, count: 0 }
      current.count += 1
      bucket.set(accountId, current)
    }
    const preferredBucket = externalCounts.size ? externalCounts : internalCounts
    const best = [...preferredBucket.values()].sort((a, b) => b.count - a.count)[0]
    return best ? { accountid: best.accountid, name: best.name } : null
  }, [contactsByEmail, regardingType])

  const regardingConfig = {
    account: {
      searchFn: (q) => searchAccounts(instance, q),
      getKey: (a) => a.accountid,
      getLabel: (a) => a.name,
      placeholder: 'Search account…',
      sublabel: null,
    },
    opportunity: {
      searchFn: (q) => searchOpportunities(instance, q),
      getKey: (o) => o.opportunityid,
      getLabel: (o) => o.name,
      placeholder: 'Search opportunity…',
      sublabel: null,
    },
    lead: {
      searchFn: (q) => searchLeads(instance, q),
      getKey: (l) => l.leadid,
      getLabel: (l) => l.fullname || '(No name)',
      placeholder: 'Search lead…',
      sublabel: (l) => l.companyname || '',
    },
  }[regardingType]

  async function handleCreateContact(participant) {
    setError(null)
    try {
      const resolvedAccountId = regardingType === 'account' ? regardingItem?.accountid || null : null
      const { firstname, lastname } = splitNameParts(participant.name, participant.email)
      const contact = await createContact(instance, {
        firstname,
        lastname,
        emailaddress1: participant.email,
        accountId: resolvedAccountId,
      })
      setContactsByEmail((prev) => ({ ...prev, [participant.email.toLowerCase()]: contact }))
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleImport() {
    if (!regardingItem) return
    const { regardingId, regardingAccountId } = getImportRegardingPayload(regardingType, regardingItem)
    setSaving(true)
    setError(null)
    try {
      const imported = await createInboxAppointmentActivity(instance, {
        event,
        regardingType,
        regardingId,
        regardingAccountId,
        contactsByEmail,
      })
      const resolvedAccount = regardingType === 'account'
        ? null
        : await resolveAccountForRegarding(instance, { regardingType, regardingId })
      const browseAccount = buildBrowseAccountFromRegarding({
        regardingType,
        regardingItem,
        resolvedAccount,
      })
      onImported?.({ activity: imported, browseAccount })
      onClose()
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay inbox-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal inbox-modal">
        <div className="modal-header">
          <h3 className="modal-title">Import appointment to Dynamics</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="modal-body inbox-modal-body">
          <div className="inbox-message-summary">
            <div className="inbox-message-subject">{event.subject}</div>
            <div className="inbox-message-meta">
              <span>{fmtDate(event.start)}</span>
              {event.location && <span>{event.location}</span>}
            </div>
            {event.bodyPreview && <div className="inbox-message-preview">{event.bodyPreview}</div>}
          </div>

          <div className="inbox-modal-actions inbox-modal-actions-top">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="button" className="btn-primary" onClick={handleImport} disabled={!regardingItem || saving}>
              {saving ? 'Importing…' : 'Import appointment'}
            </button>
          </div>

          <div className="inbox-section">
            <div className="inbox-section-label">Link appointment to</div>
            <div className="filter-type-btns inbox-regarding-types">
              {REGARDING_TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`filter-type-btn ${regardingType === t.id ? 'active' : ''}`}
                  onClick={() => {
                    setRegardingType(t.id)
                    setRegardingItem(null)
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <AutocompletePicker
              searchFn={regardingConfig.searchFn}
              getKey={regardingConfig.getKey}
              getLabel={regardingConfig.getLabel}
              getSublabel={regardingConfig.sublabel}
              value={regardingItem}
              onChange={setRegardingItem}
              placeholder={regardingConfig.placeholder}
              autoSelectSingle
            />

            {regardingType === 'account' && !regardingItem && suggestedAccount && (
              <button type="button" className="suggestion-chip" onClick={() => setRegardingItem(suggestedAccount)}>
                💡 Suggested: {suggestedAccount.name}
              </button>
            )}
          </div>

          <div className="inbox-section">
            <div className="inbox-section-label">Contacts</div>
            <div className="inbox-participants">
              {participants.map((participant) => {
                const contact = contactsByEmail[participant.email.toLowerCase()]
                return (
                  <div key={participant.email} className="inbox-participant">
                    <div>
                      <div className="inbox-participant-role">{participant.role}</div>
                      <div className="inbox-participant-name">{participant.name}</div>
                      <div className="inbox-participant-email">{participant.email}</div>
                    </div>
                    {contact ? (
                      <span className="chip-sm chip-linked">✓ Linked contact</span>
                    ) : (
                      <button type="button" className="btn-ghost btn-sm" onClick={() => handleCreateContact(participant)}>
                        Create contact
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
            {loadingContacts && <div className="hint-text">Checking existing contacts…</div>}
          </div>

          {error && <div className="alert alert-error">{error}</div>}
        </div>
      </div>
    </div>
  )
}

export default function CalendarImportTab({ compact = false, onImported, selectedAccount = null }) {
  const { instance } = useMsal()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')
  const [timeFilter, setTimeFilter] = useState('future')
  const [selectedEventId, setSelectedEventId] = useState(null)
  const [addingEvent, setAddingEvent] = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    setSelectedEventId(null)
    getRecentCalendarEvents(instance)
      .then(setEvents)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [instance])

  const filteredEvents = useMemo(() => {
    const q = query.trim().toLowerCase()
    const now = new Date()
    const scoped = events.filter((ev) => {
      const eventTime = ev.start?.getTime?.()
      if (!eventTime) return timeFilter === 'past'
      return timeFilter === 'future' ? eventTime >= now.getTime() : eventTime < now.getTime()
    })
    if (!q) return scoped
    return scoped.filter((ev) => {
      const attendeeNames = (ev.attendees ?? []).map((a) => `${a.name} ${a.email}`.toLowerCase()).join(' ')
      return (
        ev.subject.toLowerCase().includes(q) ||
        (ev.location || '').toLowerCase().includes(q) ||
        attendeeNames.includes(q)
      )
    })
  }, [events, query, timeFilter])

  const selectedEvent = useMemo(
    () => filteredEvents.find((event) => event.id === selectedEventId) || null,
    [filteredEvents, selectedEventId],
  )

  useEffect(() => {
    if (!selectedEventId && filteredEvents.length) {
      setSelectedEventId(filteredEvents[0].id)
      return
    }
    if (selectedEventId && !filteredEvents.some((event) => event.id === selectedEventId)) {
      setSelectedEventId(filteredEvents[0]?.id || null)
    }
  }, [filteredEvents, selectedEventId])

  const containerClass = compact ? 'inbox-container inbox-container-embedded' : 'inbox-container'

  return (
    <div className={containerClass}>
      <div className="filter-panel inbox-toolbar">
        <div className="filter-row">
          <div className="filter-field inbox-search-field">
            <label className="filter-label">Search appointments</label>
            <input
              className="input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by subject, attendee or location…"
            />
          </div>
          <div className="filter-field inbox-toggle-field">
            <div className="inbox-toggle-buttons">
              <button
                type="button"
                className={`filter-type-btn ${timeFilter === 'future' ? 'active' : ''}`}
                onClick={() => setTimeFilter('future')}
              >
                Future
              </button>
              <button
                type="button"
                className={`filter-type-btn ${timeFilter === 'past' ? 'active' : ''}`}
                onClick={() => setTimeFilter('past')}
              >
                Past
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && <div className="alert alert-error inbox-alert">{error}</div>}

      <div className="inbox-body">
        <div className="mail-list-pane">
          {loading && <div className="loading-text inbox-loading-text">Loading calendar…</div>}

          {!loading && filteredEvents.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">📅</div>
              <div className="empty-title">No appointments found</div>
              <div className="empty-sub">Try another filter or search text.</div>
            </div>
          )}

          {filteredEvents.map((event) => {
            const active = selectedEventId === event.id
            return (
              <button
                key={event.id}
                type="button"
                className={`inbox-card inbox-thread-card ${active ? 'active' : ''}`}
                onClick={() => setSelectedEventId(event.id)}
              >
                <div className="inbox-card-head">
                  <div className="inbox-card-sender">
                    <span>{event.organizer?.name || event.organizer?.email || 'No organizer'}</span>
                  </div>
                  <div className="inbox-card-head-right">
                    <span className="inbox-card-date">{fmtDateShort(event.start)}</span>
                  </div>
                </div>
                <div className="inbox-card-subject">{event.subject}</div>
                <div className="inbox-thread-subline">
                  <span>{(event.attendees ?? []).length} attendee{(event.attendees ?? []).length === 1 ? '' : 's'}</span>
                  {event.location && <span>{event.location}</span>}
                </div>
              </button>
            )
          })}
        </div>

        <div className="mail-detail-pane">
          {selectedEvent ? (
            <div className="mail-detail">
              <div className="mail-detail-subject">{selectedEvent.subject}</div>
              <div className="mail-detail-top-actions">
                <button type="button" className="btn-primary" onClick={() => setAddingEvent(selectedEvent)}>
                  Import appointment to Dynamics
                </button>
              </div>
              <div className="mail-detail-meta">
                <div className="mail-detail-meta-row">
                  <span className="mail-detail-meta-label">Start</span>
                  <span>{fmtDate(selectedEvent.start)}</span>
                </div>
                <div className="mail-detail-meta-row">
                  <span className="mail-detail-meta-label">End</span>
                  <span>{fmtDate(selectedEvent.end)}</span>
                </div>
                <div className="mail-detail-meta-row">
                  <span className="mail-detail-meta-label">Location</span>
                  <span>{selectedEvent.location || '—'}</span>
                </div>
              </div>
              <div className="mail-detail-body">{selectedEvent.bodyPreview || <em>No preview available</em>}</div>
              {(selectedEvent.attendees ?? []).length > 0 && (
                <div className="inbox-section">
                  <div className="inbox-section-label">Attendees</div>
                  <div className="inbox-participants">
                    {selectedEvent.attendees.map((a, index) => {
                      const attendeeKey = `${a.email || 'no-email'}-${a.name || 'no-name'}-${index}`
                      return (
                      <div key={attendeeKey} className="inbox-participant">
                        <div>
                          <div className="inbox-participant-role">{a.type === 'optional' ? 'Optional' : 'Required'}</div>
                          <div className="inbox-participant-name">{a.name || a.email}</div>
                          <div className="inbox-participant-email">{a.email}</div>
                        </div>
                      </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="empty-state inbox-empty-state">
              <div className="empty-icon">📆</div>
              <div className="empty-title">No appointment selected</div>
              <div className="empty-sub">Select an appointment from the list to preview and import.</div>
            </div>
          )}
        </div>
      </div>

      {addingEvent && (
        <CalendarAddModal
          event={addingEvent}
          selectedAccount={selectedAccount}
          onClose={() => setAddingEvent(null)}
          onImported={(imported) => {
            onImported?.(imported)
            setAddingEvent(null)
          }}
        />
      )}
    </div>
  )
}
