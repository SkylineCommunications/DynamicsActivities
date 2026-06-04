import { useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { searchAccounts, searchContacts, resolveAttendees, createActivity, ACTIVITY_TYPES } from '../api/dataverse'
import AutocompletePicker from './AutocompletePicker'
import CalendarPicker from './CalendarPicker'

const NOTE_LIMIT = 500


function AttendeeChip({ attendee, onRemove }) {
  const isLinked = !!attendee.contactId
  return (
    <span className={`chip ${isLinked ? 'chip-linked' : 'chip-unlinked'}`}>
      <span className="chip-icon">{isLinked ? '✓' : '○'}</span>
      <span>{attendee.name || attendee.email}</span>
      <button type="button" className="chip-remove" onClick={onRemove} aria-label="Remove attendee">×</button>
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
      })
      setSuccess(true)
      setNote('')
      setAttendees([])
      setDate(() => {
        const d = new Date(); d.setSeconds(0, 0); return d.toISOString().slice(0, 16)
      })
      setTimeout(() => setSuccess(false), 3000)
      onNoteCreated?.()
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
          {ACTIVITY_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`type-btn ${type === t.id ? 'active' : ''}`}
              onClick={() => setType(t.id)}
              title={t.tooltip}
            >
              <span className="type-icon">{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        {/* Calendar link */}
        <div className="calendar-row">
          <button type="button" className="btn-ghost btn-sm" onClick={() => setShowCalendar(true)}>
            📆 Fill from calendar
          </button>
          <span className="hint-text">Auto-fills date &amp; attendees from your Outlook</span>
        </div>

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
          />
        </div>

        {/* Date */}
        <div className="field">
          <label className="field-label">{dateLabel}</label>
          <input
            type="datetime-local"
            className="input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        {/* Attendees */}
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
          />
          {attendees.some((a) => !a.contactId) && (
            <p className="hint-text hint-warning">
              ○ Attendees from calendar without a Dynamics match are mentioned but not linked.
            </p>
          )}
        </div>

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
        {success && <div className="alert alert-success">✓ Activity saved</div>}

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
