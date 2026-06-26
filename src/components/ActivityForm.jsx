import { useState, useEffect } from 'react'
import { useMsal } from '@azure/msal-react'
import { searchAccounts, searchContacts, resolveAttendees, createActivity, getActiveEscalation, getAccountLeads, getUserCanManageLeads, ACTIVITY_TYPES } from '../api/dataverse'
import AutocompletePicker from './AutocompletePicker'
import CalendarPicker from './CalendarPicker'

const NOTE_LIMIT = 500


function AttendeeChip({ attendee, onRemove }) {
  const isLinked = !!attendee.contactId
  return (
    <span className={`chip ${isLinked ? 'chip-linked' : 'chip-unlinked'}`}>
      <span className="icon icon-sm">{isLinked ? 'check_circle' : 'radio_button_unchecked'}</span>
      <span>{attendee.name || attendee.email}</span>
      <button type="button" className="chip-remove" onClick={onRemove} aria-label="Remove attendee">
        <span className="icon icon-sm" aria-hidden="true">close</span>
      </button>
    </span>
  )
}

export default function ActivityForm({ currentUserId, onNoteCreated }) {
  const { instance } = useMsal()

  const [type, setType] = useState('phonecall')
  const [account, setAccount] = useState(null)
  const [date, setDate] = useState(() => {
    const d = new Date()
    d.setSeconds(0, 0)
    return d.toISOString().slice(0, 16)
  })
  const [note, setNote] = useState('')
  const [attendees, setAttendees] = useState([])
  const [showCalendar, setShowCalendar] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const [activeEscalation, setActiveEscalation] = useState(null)
  const [linkToEscalation, setLinkToEscalation] = useState(false)
  const [accountIsEscalated, setAccountIsEscalated] = useState(false)
  const [accountLeads, setAccountLeads] = useState([])
  const [linkToLeadId, setLinkToLeadId] = useState('')
  const [canManageLeads, setCanManageLeads] = useState(false)

  // Check if user has a sales license (can manage leads in Dynamics)
  useEffect(() => {
    if (!currentUserId) return
    getUserCanManageLeads(instance, currentUserId)
      .then(setCanManageLeads)
      .catch(() => setCanManageLeads(false))
  }, [instance, currentUserId]) // eslint-disable-line react-hooks/exhaustive-deps

  // When account changes, check for active escalation and fetch leads
  useEffect(() => {
    if (!account?.accountid) {
      setActiveEscalation(null)
      setLinkToEscalation(false)
      setAccountIsEscalated(false)
      setAccountLeads([])
      setLinkToLeadId('')
      return
    }
    // Reset lead/escalation state immediately so stale values from
    // a previous account are never visible while requests are in-flight.
    let active = true
    setLinkToLeadId('')
    setLinkToEscalation(false)
    setActiveEscalation(null)
    setAccountIsEscalated(false)
    setAccountLeads([])

    getActiveEscalation(instance, account.accountid)
      .then((esc) => {
        if (!active) return
        setActiveEscalation(esc)
        setAccountIsEscalated(!!esc)
        setLinkToEscalation(!!esc)
      })
      .catch(() => {
        if (!active) return
        setActiveEscalation(null)
        setAccountIsEscalated(false)
      })
    getAccountLeads(instance, account.accountid)
      .then((leads) => { if (active) setAccountLeads(leads) })
      .catch(() => { if (active) setAccountLeads([]) })

    return () => { active = false }
  }, [instance, account?.accountid]) // eslint-disable-line react-hooks/exhaustive-deps

  const isNote = type === 'note'
  const charsLeft = NOTE_LIMIT - note.length
  const canSubmit = account && note.trim().length > 0 && !submitting

  const dateLabel = type === 'appointment' ? 'Start Time' : 'Due Date'
  const attendeesLabel = type === 'phonecall' ? 'Call To' : type === 'email' ? 'To' : 'Required Attendees'

  // ─── Search functions for pickers ──────────────────────────────────────────
  function searchAccountsFn(q) { return searchAccounts(instance, q) }
  function searchContactsFn(q) { return searchContacts(instance, q) }

  function handleAttendeeSelected(contact) {
    if (!contact) return
    if (attendees.some((a) => a.contactId === contact.contactid)) return
    setAttendees((prev) => [
      ...prev,
      { name: contact.fullname, email: contact.emailaddress1, contactId: contact.contactid },
    ])
  }

  async function handleCalendarSelect(event) {
    setShowCalendar(false)
    setDate(event.start ? event.start.toISOString().slice(0, 16) : date)
    // Resolve attendees against Dynamics contacts
    const raw = event.attendees.map((a) => ({ name: a.name, email: a.email }))
    const resolved = await resolveAttendees(instance, raw)
    setAttendees(resolved)
  }

  function removeAttendee(idx) {
    setAttendees((prev) => prev.filter((_, i) => i !== idx))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      await createActivity(instance, {
        type,
        accountId: account.accountid,
        date,
        note: note.trim(),
        attendees,
        currentUserId,
        linkToEscalationId: (linkToEscalation && activeEscalation) ? activeEscalation.activityid : undefined,
        linkToLeadId: linkToLeadId || undefined,
      })
      setSuccess(true)
      setNote('')
      setAttendees([])
      setDate(() => {
        const d = new Date(); d.setSeconds(0, 0); return d.toISOString().slice(0, 16)
      })
      setTimeout(() => setSuccess(false), 3000)
      onNoteCreated?.(account)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="form-card">
      <form onSubmit={handleSubmit} noValidate>

        {/* Interaction type */}
        <div className="type-selector">
          {ACTIVITY_TYPES.filter((t) => !['slc_escalations', 'leads'].includes(t.entity)).map((t) => (
            <button
              key={t.id}
              type="button"
              className={`type-btn ${type === t.id ? 'active' : ''}`}
              onClick={() => setType(t.id)}
              title={t.tooltip}
            >
              <span className="icon icon-sm">{t.iconLigature}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        {/* Calendar link — not shown for notes */}
        {!isNote && (
        <div className="calendar-row">
          <button type="button" className="btn-ghost" onClick={() => setShowCalendar(true)}>
            <span className="icon icon-sm">calendar_today</span> Fill from calendar
          </button>
          <span className="hint-text">Auto-fills date &amp; attendees from your Outlook</span>
        </div>
        )}

        {/* Account (required) */}
        <div className="field">
          <label className="field-label">
            Account <span className="required">*</span>
          </label>
          <AutocompletePicker
            searchFn={searchAccountsFn}
            getKey={(a) => a.accountid}
            getLabel={(a) => a.name}
            value={account}
            onChange={setAccount}
            placeholder="Type to search accounts…"
            autoSelectSingle
          />
        </div>

        {/* Active escalation link banner */}
        {accountIsEscalated && (
          <div className="escalation-link-banner">
            <span className="icon">warning</span>
            <span>This account has an active escalation</span>
            <label className="escalation-link-toggle">
              <input
                type="checkbox"
                checked={linkToEscalation}
                onChange={(e) => { setLinkToEscalation(e.target.checked); if (e.target.checked) setLinkToLeadId('') }}
                disabled={!activeEscalation}
              />
              {activeEscalation ? 'Link to escalation' : 'Loading escalation…'}
            </label>
          </div>
        )}

        {/* BD Leads — show when account has open leads */}
        {accountLeads.length > 0 && (
          <div className="lead-link-banner">
            <span className="icon icon-sm">trending_up</span>
            <label className="lead-link-select">
              <span>Link to BD lead</span>
              <select
                value={linkToLeadId}
                onChange={(e) => { setLinkToLeadId(e.target.value); if (e.target.value) setLinkToEscalation(false) }}
              >
                <option value="">None</option>
                {accountLeads.map((l) => (
                  <option key={l.leadid} value={l.leadid}>
                    {l.subject || '(Untitled)'} — {l.statusLabel}
                  </option>
                ))}
              </select>
            </label>
            {canManageLeads && (
              <span className="lead-hint">
                <a href={`${import.meta.env.VITE_DATAVERSE_URL}main.aspx?pagetype=entitylist&etn=lead`} target="_blank" rel="noreferrer">
                  Manage leads <span className="icon icon-sm">open_in_new</span>
                </a>
              </span>
            )}
          </div>
        )}

        {/* Date — not shown for notes */}
        {!isNote && (
        <div className="field">
          <label className="field-label">{dateLabel}</label>
          <input
            type="datetime-local"
            className="input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        )}

        {/* Attendees — not shown for notes */}
        {!isNote && (
        <div className="field">
          <label className="field-label">{attendeesLabel} <span className="optional">(optional)</span></label>
          <div className="chip-list">
            {attendees.map((a, i) => (
              <AttendeeChip key={i} attendee={a} onRemove={() => removeAttendee(i)} />
            ))}
          </div>
          <AutocompletePicker
            searchFn={searchContactsFn}
            getKey={(c) => c.contactid}
            getLabel={(c) => c.fullname}
            getSublabel={(c) => c.emailaddress1}
            value={null}
            onChange={handleAttendeeSelected}
            placeholder="Search Dynamics contacts to add…"
            clearOnPick
            autoSelectSingle
          />
          {attendees.some((a) => !a.contactId) && (
            <p className="hint-text hint-warning">
              ○ Attendees from calendar without a Dynamics match are mentioned but not linked.
            </p>
          )}
        </div>
        )}

        {/* Note */}
        <div className="field">
          <label className="field-label">
            Description <span className="required">*</span>
          </label>
          <textarea
            className={`textarea ${charsLeft < 50 ? 'near-limit' : ''}`}
            placeholder="What did you learn / observe? Keep it short and to the point."
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, NOTE_LIMIT))}
            rows={4}
          />
          <div className="char-counter">
            <span className="hint-text">Internal only · Short &amp; to the point · Not for project notes</span>
            <span className={`char-count ${charsLeft < 50 ? 'near-limit' : ''}`}>{note.length}/{NOTE_LIMIT}</span>
          </div>
        </div>

        {/* Errors / success */}
        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success"><span className="icon icon-sm">check_circle</span> Activity saved</div>}

        {/* Submit */}
        <button type="submit" className="btn-primary" disabled={!canSubmit}>
          {submitting ? 'Saving…' : 'Save'}
        </button>
      </form>

      {showCalendar && (
        <CalendarPicker
          onSelect={handleCalendarSelect}
          onClose={() => setShowCalendar(false)}
        />
      )}
    </div>
  )
}
