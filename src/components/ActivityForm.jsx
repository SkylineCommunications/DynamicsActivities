import { useState, useEffect, useRef } from 'react'
import { useMsal } from '@azure/msal-react'
import {
  createContact,
  searchAccounts,
  searchContacts,
  findContactByEmail,
  resolveAttendees,
  createActivity,
  getActiveEscalation,
  getAccountLeads,
  getAccountOpportunities,
  ACTIVITY_TYPES,
  ACTIVITY_DESCRIPTION_LIMITS,
} from '../api/dataverse'
import { getRecentCalendarEvents } from '../api/graph'
import AutocompletePicker from './AutocompletePicker'
import CalendarPicker from './CalendarPicker'
import InboxTab from './InboxTab'
import { buildBrowseAccountFromRegarding } from '../services/postCreateBrowseAccount'

const ESCALATION_DESCRIPTION_PREFIX = '[Linked to escalation]\n'
const INTERNAL_EMAIL_DOMAINS = ['@skyline.be', '@dataminer.services']

function isInternalEmail(email) {
  const normalized = String(email || '').trim().toLowerCase()
  return INTERNAL_EMAIL_DOMAINS.some((domain) => normalized.endsWith(domain))
}

function calendarBodyText(event) {
  if (event.bodyHtml) {
    const container = document.createElement('div')
    container.innerHTML = event.bodyHtml
    container.querySelectorAll('style, script, head, meta, title').forEach((node) => node.remove())
    const comments = document.createTreeWalker(container, NodeFilter.SHOW_COMMENT)
    const commentNodes = []
    while (comments.nextNode()) commentNodes.push(comments.currentNode)
    commentNodes.forEach((node) => node.remove())
    container.querySelectorAll('br').forEach((breakNode) => breakNode.replaceWith('\n'))
    return (container.textContent || '').replace(/\u00a0/g, ' ').trim()
  }
  return String(event.bodyPreview || '').trim()
}

function toLocalInputValue(date) {
  if (!date) return ''
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function getDefaultDate() {
  const d = new Date()
  d.setSeconds(0, 0)
  return d.toISOString().slice(0, 16)
}

function splitCalendarParticipants(event) {
  const participants = []
  if (event.organizer?.email) {
    participants.push({
      role: 'organizer',
      roleLabel: 'Organizer',
      name: event.organizer.name || event.organizer.email,
      email: event.organizer.email,
    })
  }
  for (const attendee of event.attendees ?? []) {
    if (!attendee.email) continue
    const role = attendee.type === 'optional' ? 'optional' : 'required'
    participants.push({
      role,
      roleLabel: role === 'optional' ? 'Optional' : 'Required',
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

function getBestAccountFromAttendees(attendees) {
  const accountCounts = new Map()
  for (const attendee of attendees) {
    if (!attendee.accountId) continue
    const account = accountCounts.get(attendee.accountId) || {
      accountid: attendee.accountId,
      name: attendee.accountName || 'Account',
      externalCount: 0,
      count: 0,
    }
    account.count += 1
    if (!isInternalEmail(attendee.email)) account.externalCount += 1
    accountCounts.set(attendee.accountId, account)
  }

  const best = [...accountCounts.values()]
    .sort((a, b) => b.externalCount - a.externalCount || b.count - a.count)[0]
  return best ? { accountid: best.accountid, name: best.name } : null
}

function AttendeeChip({ attendee, onRemove, onCreateContact }) {
  const isLinked = !!attendee.contactId
  return (
    <span className={`chip ${isLinked ? 'chip-linked' : 'chip-unlinked'}`}>
      <span className="icon icon-sm">{isLinked ? 'check_circle' : 'radio_button_unchecked'}</span>
      <span>{attendee.name || attendee.email}</span>
      {!isLinked && onCreateContact && (
        <button type="button" className="chip-action" onClick={onCreateContact} aria-label="Create contact">
          <span className="icon icon-sm" aria-hidden="true">person_add</span>
        </button>
      )}
      <button type="button" className="chip-remove" onClick={onRemove} aria-label="Remove attendee">
        <span className="icon icon-sm" aria-hidden="true">close</span>
      </button>
    </span>
  )
}

export default function ActivityForm({ currentUserId, onNoteCreated, managedAccounts = [], tamLoading = false }) {
  const { instance } = useMsal()

  const [type, setType] = useState('phonecall')
  const [emailMode, setEmailMode] = useState('create')
  const [account, setAccount] = useState(null)
  const [accountMode, setAccountMode] = useState('managed')
  const [date, setDate] = useState(getDefaultDate)
  const [endDate, setEndDate] = useState('')
  const [subject, setSubject] = useState('')
  const [location, setLocation] = useState('')
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
  const [accountOpportunities, setAccountOpportunities] = useState([])
  const [linkToOpportunityId, setLinkToOpportunityId] = useState('')
  const [calendarContactsByEmail, setCalendarContactsByEmail] = useState({})
  const [calendarContactsLoading, setCalendarContactsLoading] = useState(false)
  const [calendarContactError, setCalendarContactError] = useState(null)
  const [calendarEvent, setCalendarEvent] = useState(null)
  const calendarSelectionRef = useRef(0)

  function handleTypeChange(nextType) {
    setType(nextType)
    if (!['phonecall', 'appointment'].includes(nextType) && calendarEvent) {
      calendarSelectionRef.current += 1
      setCalendarEvent(null)
      setCalendarContactsByEmail({})
      setCalendarContactError(null)
      setCalendarContactsLoading(false)
      setDate(getDefaultDate())
      setSubject('')
      setNote('')
      setAttendees([])
    }
    if (nextType !== 'appointment') {
      setEndDate('')
      setLocation('')
    } else if (calendarEvent) {
      setEndDate(calendarEvent.end ? toLocalInputValue(calendarEvent.end) : '')
      setLocation(calendarEvent.location || '')
    }
  }

  useEffect(() => {
    if (type !== 'email') setEmailMode('create')
  }, [type])

  // When account changes, check for active escalation and fetch leads
  useEffect(() => {
    if (!account?.accountid) {
      setActiveEscalation(null)
      setLinkToEscalation(false)
      setAccountIsEscalated(false)
      setAccountLeads([])
      setAccountOpportunities([])
      setLinkToLeadId('')
      setLinkToOpportunityId('')
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
    setAccountOpportunities([])
    setLinkToOpportunityId('')

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
    getAccountOpportunities(instance, account.accountid)
      .then((opportunities) => { if (active) setAccountOpportunities(opportunities) })
      .catch(() => { if (active) setAccountOpportunities([]) })

    return () => { active = false }
  }, [instance, account?.accountid]) // eslint-disable-line react-hooks/exhaustive-deps

  const isNote = type === 'note'
  const isEmail = type === 'email'
  const isAppointment = type === 'appointment'
  const isInboxImportMode = isEmail && emailMode === 'import'
  const isCalendarAssisted = !!calendarEvent
  const descriptionLimit = ACTIVITY_DESCRIPTION_LIMITS[type] ?? ACTIVITY_DESCRIPTION_LIMITS.note
  const noteLimit = Math.max(
    0,
    descriptionLimit - (type !== 'note' && linkToEscalation && !linkToLeadId
      ? ESCALATION_DESCRIPTION_PREFIX.length
      : 0),
  )
  const charsLeft = noteLimit - note.length
  const regardingType = linkToOpportunityId ? 'opportunity' : linkToLeadId ? 'lead' : 'account'
  const regardingId = linkToOpportunityId || linkToLeadId || account?.accountid
  const showDescriptionCounter = noteLimit <= 5000
  const canSubmit = isCalendarAssisted
    ? !!account && !submitting
    : !isInboxImportMode && !!account && note.trim().length > 0 && !submitting
  const hasManagedAccounts = managedAccounts.length > 0
  const useManagedAccounts = accountMode === 'managed' && hasManagedAccounts

  const dateLabel = type === 'appointment' ? 'Start Time' : 'Date & time'
  const attendeesLabel = type === 'phonecall' ? 'Call To' : type === 'email' ? 'To' : 'Required Attendees'

  // ─── Search functions for pickers ──────────────────────────────────────────
  function searchAccountsFn(q, paging) {
    if (useManagedAccounts) {
      paging = paging || {}
      const query = q.trim().toLowerCase()
      const matches = query
        ? managedAccounts.filter((a) => a.name?.toLowerCase().includes(query))
        : managedAccounts
      const top = paging.top ?? 25
      const skip = paging.skip ?? 0
      return Promise.resolve({
        items: matches.slice(skip, skip + top),
        hasMore: matches.length > skip + top,
      })
    }
    return searchAccounts(instance, q, paging)
  }

  function handleAccountModeChange(mode) {
    if (mode === accountMode) return
    setAccount(null)
    setAccountMode(mode)
  }
  function searchContactsFn(q, paging) {
    return searchContacts(instance, q, { ...paging, accountIds: account?.accountid ? [account.accountid] : [] })
  }

  async function handleCreateCalendarContact(participant) {
    setCalendarContactError(null)
    try {
      const nameParts = String(participant.name || '').trim().split(/\s+/)
      const contact = await createContact(instance, {
        firstname: nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : null,
        lastname: nameParts.length > 1 ? nameParts[nameParts.length - 1] : (nameParts[0] || participant.email),
        emailaddress1: participant.email,
        accountId: account?.accountid || null,
      })
      setCalendarContactsByEmail((current) => ({
        ...current,
        [participant.email.toLowerCase()]: contact,
      }))
      setAttendees((current) => current.map((attendee) => (
        attendee.email?.toLowerCase() === participant.email.toLowerCase()
          ? {
              ...attendee,
              contactId: contact.contactid,
              name: contact.fullname || attendee.name,
              accountId: account?.accountid || null,
              accountName: account?.name || null,
            }
          : attendee
      )))
    } catch (e) {
      setCalendarContactError(e.message)
    }
  }

  useEffect(() => {
    setNote((current) => current.slice(0, noteLimit))
  }, [noteLimit])

  useEffect(() => {
    if (!calendarEvent) return
    setSubject(calendarEvent.subject || '')
    setDate(calendarEvent.start ? toLocalInputValue(calendarEvent.start) : date)
    setEndDate(isAppointment && calendarEvent.end ? toLocalInputValue(calendarEvent.end) : '')
    setLocation(isAppointment ? calendarEvent.location || '' : '')
    setNote(calendarBodyText(calendarEvent).slice(0, noteLimit))
  }, [calendarEvent?.id, isAppointment]) // eslint-disable-line react-hooks/exhaustive-deps

  const calendarParticipants = calendarEvent ? splitCalendarParticipants(calendarEvent) : []

  useEffect(() => {
    if (!calendarEvent || !calendarParticipants.length) {
      setCalendarContactsByEmail({})
      return
    }
    let active = true
    setCalendarContactsLoading(true)
    setCalendarContactError(null)
    Promise.all(calendarParticipants.map(async (participant) => [
      participant.email.toLowerCase(),
      await findContactByEmail(instance, participant.email, account?.accountid || null),
    ]))
      .then((entries) => {
        if (active) {
          setCalendarContactsByEmail(Object.fromEntries(entries.filter(([, contact]) => contact)))
        }
      })
      .catch((e) => { if (active) setCalendarContactError(e.message) })
      .finally(() => { if (active) setCalendarContactsLoading(false) })
    return () => { active = false }
  }, [instance, calendarEvent?.id, account?.accountid]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleAttendeeSelected(contact) {
    if (!contact) return
    if (attendees.some((a) => a.contactId === contact.contactid)) return
    setAttendees((prev) => [
      ...prev,
      { name: contact.fullname, email: contact.emailaddress1, contactId: contact.contactid },
    ])
  }

  async function handleCalendarSelect(event) {
    const selectionId = ++calendarSelectionRef.current
    setShowCalendar(false)
    setCalendarEvent(event)
    setSubject(event.subject || '')
    setDate(event.start ? toLocalInputValue(event.start) : date)
    setEndDate(isAppointment && event.end ? toLocalInputValue(event.end) : '')
    setLocation(isAppointment ? event.location || '' : '')
    const body = calendarBodyText(event)
    if (body) setNote(body.slice(0, noteLimit))
    // Resolve attendees against Dynamics contacts
    const raw = [
      ...(event.organizer?.email ? [{ name: event.organizer.name, email: event.organizer.email, role: 'organizer' }] : []),
      ...(event.attendees ?? []).map((a) => ({
        name: a.name,
        email: a.email,
        role: a.type === 'optional' ? 'optional' : 'required',
      })),
    ]
    const resolved = await resolveAttendees(instance, raw)
    if (selectionId !== calendarSelectionRef.current) return
    setAttendees(resolved)
    const suggestedAccount = getBestAccountFromAttendees(resolved)
    if (suggestedAccount) {
      setAccount(suggestedAccount)
    }
  }

  function clearCalendarActivity() {
    calendarSelectionRef.current += 1
    setShowCalendar(false)
    setCalendarEvent(null)
    setAccount(null)
    setSubject('')
    setDate(getDefaultDate())
    setEndDate('')
    setLocation('')
    setNote('')
    setAttendees([])
    setLinkToLeadId('')
    setLinkToOpportunityId('')
    setLinkToEscalation(false)
    setCalendarContactsByEmail({})
    setCalendarContactError(null)
    setCalendarContactsLoading(false)
    setError(null)
  }

  function removeAttendee(idx) {
    setAttendees((prev) => prev.filter((_, i) => i !== idx))
  }

  function completePostCreateFlow(browseAccount = null) {
    onNoteCreated?.(browseAccount)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const calendarAttendees = isCalendarAssisted
        ? calendarParticipants.map((participant) => {
          const contact = calendarContactsByEmail[participant.email.toLowerCase()]
          return {
            ...participant,
            ...(contact ? {
              contactId: contact.contactid,
              accountId: contact._parentcustomerid_value || null,
              accountName: contact['_parentcustomerid_value@OData.Community.Display.V1.FormattedValue'] || null,
            } : {}),
          }
        })
        : attendees
      await createActivity(instance, {
        type,
        accountId: account?.accountid,
        date,
        end: isAppointment ? endDate : undefined,
        note: note.trim(),
        subject,
        location: isAppointment ? location : undefined,
        attendees: calendarAttendees,
        currentUserId,
        linkToEscalationId: !linkToOpportunityId && !linkToLeadId && linkToEscalation && activeEscalation
          ? activeEscalation.slc_escalationid
          : undefined,
        linkToLeadId: linkToLeadId || undefined,
        regardingType: regardingType !== 'account' ? regardingType : undefined,
        regardingId: regardingType !== 'account' ? regardingId : undefined,
        regardingAccountId: account?.accountid,
      })
      setSuccess(true)
      setNote('')
      setAttendees([])
      setSubject('')
      setLocation('')
      setCalendarEvent(null)
      setLinkToLeadId('')
      setLinkToOpportunityId('')
      setLinkToEscalation(false)
      setDate(getDefaultDate())
      setEndDate('')
      setTimeout(() => setSuccess(false), 3000)
      const browseAccount = isCalendarAssisted
        ? buildBrowseAccountFromRegarding({
          regardingType,
          regardingItem: regardingType === 'opportunity'
            ? accountOpportunities.find((opportunity) => opportunity.opportunityid === regardingId)
            : regardingType === 'lead'
              ? accountLeads.find((lead) => lead.leadid === regardingId)
              : account,
          resolvedAccount: account,
        })
        : account
      completePostCreateFlow(browseAccount)
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
          {ACTIVITY_TYPES.filter((t) => !['slc_escalations', 'leads', 'opportunities', 'support'].includes(t.entity)).map((t) => (
            <button
              key={t.id}
              type="button"
              className={`type-btn ${type === t.id ? 'active' : ''}`}
              onClick={() => handleTypeChange(t.id)}
              title={t.tooltip}
            >
              <span className="icon icon-sm">{t.iconLigature}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        {isEmail && (
          <div className="mode-row">
            <button
              type="button"
              className={`filter-type-btn ${emailMode === 'create' ? 'active' : ''}`}
              onClick={() => setEmailMode('create')}
            >
              Create New
            </button>
            <button
              type="button"
              className={`filter-type-btn ${emailMode === 'import' ? 'active' : ''}`}
              onClick={() => setEmailMode('import')}
            >
              Import from inbox
            </button>
          </div>
        )}

        {/* Calendar link — not shown for notes */}
        {(type === 'phonecall' || type === 'appointment') && !isInboxImportMode && (
        <div className="calendar-row">
          <button type="button" className="btn-ghost" onClick={() => setShowCalendar(true)}>
            <span className="icon icon-sm">calendar_today</span> Fill from calendar
          </button>
          <span className="hint-text">Auto-fills date &amp; attendees from your Outlook</span>
        </div>
        )}

        {!isInboxImportMode && (
        <>
        {/* Account (required) */}
        <div className="field">
          <div className="field-label-row">
            <label className="field-label">
              Account <span className="required">*</span>
            </label>
            {hasManagedAccounts && (
              <div className="filter-mode-toggle account-mode-toggle" role="group" aria-label="Account search scope">
                <button
                  type="button"
                  className={`filter-mode-btn ${accountMode === 'managed' ? 'active' : ''}`}
                  onClick={() => handleAccountModeChange('managed')}
                >
                  My accounts
                </button>
                <button
                  type="button"
                  className={`filter-mode-btn ${accountMode === 'all' ? 'active' : ''}`}
                  onClick={() => handleAccountModeChange('all')}
                >
                  All accounts
                </button>
              </div>
            )}
          </div>
          <AutocompletePicker
            searchFn={searchAccountsFn}
            getKey={(a) => a.accountid}
            getLabel={(a) => a.name}
            value={account}
            onChange={setAccount}
            placeholder={useManagedAccounts ? 'Search my accounts…' : 'Search accounts…'}
            autoSelectSingle
            showSelectedIndicator
            minChars={useManagedAccounts ? 0 : 2}
            loadOnFocus
            allowEmptySearch
          />
          {tamLoading && <p className="hint-text">Loading your managed accounts…</p>}
          {useManagedAccounts && (
            <p className="hint-text">Showing your managed accounts. Switch to All accounts to search everyone.</p>
          )}
        </div>

        {accountLeads.length > 0 && (
          <div className="lead-link-banner">
            <span className="icon icon-sm">trending_up</span>
            <label className="lead-link-select">
              <span>Link to lead</span>
              <select
                value={linkToLeadId}
                onChange={(e) => {
                  setLinkToLeadId(e.target.value)
                  if (e.target.value) {
                    setLinkToOpportunityId('')
                    setLinkToEscalation(false)
                  }
                }}
              >
                <option value="">None</option>
                {accountLeads.map((lead) => (
                  <option key={lead.leadid} value={lead.leadid}>
                    {lead.subject || '(Untitled)'} — {lead.statusLabel}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {accountOpportunities.length > 0 && (
          <div className="lead-link-banner">
            <span className="icon icon-sm">trending_up</span>
            <label className="lead-link-select">
              <span>Link to opportunity</span>
              <select
                value={linkToOpportunityId}
                onChange={(e) => {
                  setLinkToOpportunityId(e.target.value)
                  if (e.target.value) {
                    setLinkToLeadId('')
                    setLinkToEscalation(false)
                  }
                }}
              >
                <option value="">None</option>
                {accountOpportunities.map((opportunity) => (
                  <option key={opportunity.opportunityid} value={opportunity.opportunityid}>
                    {opportunity.name || '(Untitled)'} — {opportunity.statusLabel}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {/* Active escalation link banner */}
        {accountIsEscalated && (
          <div className="escalation-link-banner">
            <span className="icon">warning</span>
            <span>This account has an active escalation</span>
            <label className="escalation-link-toggle">
              <input
                type="checkbox"
                checked={linkToEscalation}
                onChange={(e) => {
                  setLinkToEscalation(e.target.checked)
                  if (e.target.checked) {
                    setLinkToLeadId('')
                    setLinkToOpportunityId('')
                  }
                }}
                disabled={!activeEscalation}
              />
              {activeEscalation ? 'Link to escalation' : 'Loading escalation…'}
            </label>
          </div>
        )}

        {/* Date — not shown for notes */}
        <div className="field">
          <label className="field-label">Subject</label>
          <input
            className="input"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={ACTIVITY_TYPES.find((t) => t.id === type)?.label || 'Subject'}
          />
        </div>

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

        {isAppointment && (
          <>
            <div className="field">
              <label className="field-label">End</label>
              <input type="datetime-local" className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="field">
              <label className="field-label">Location <span className="optional">(optional)</span></label>
              <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
          </>
        )}

        {/* Attendees — not shown for notes */}
        {!isNote && (
        <div className="field">
          <label className="field-label">{attendeesLabel} <span className="optional">(optional)</span></label>
          <div className="chip-list">
            {attendees.map((a, i) => {
              const linkedContact = a.contactId
                ? null
                : calendarContactsByEmail[a.email?.toLowerCase()]
              const displayAttendee = linkedContact
                ? { ...a, contactId: linkedContact.contactid, name: linkedContact.fullname || a.name }
                : a
              return (
              <AttendeeChip
                key={i}
                attendee={displayAttendee}
                onRemove={() => removeAttendee(i)}
                onCreateContact={isCalendarAssisted && !displayAttendee.contactId
                  ? () => handleCreateCalendarContact(a)
                  : undefined}
              />
              )
            })}
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
            minChars={0}
            loadOnFocus
            allowEmptySearch
            preferredIds={account?.accountid ? [account.accountid] : []}
          />
          {attendees.some((a) => !a.contactId) && (
            <p className="hint-text hint-warning">
              ○ Attendees from calendar without a Dynamics match are mentioned but not linked.
            </p>
          )}
          {calendarContactError && <div className="alert alert-error">{calendarContactError}</div>}
          {calendarContactsLoading && <p className="hint-text">Checking existing contacts…</p>}
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
            onChange={(e) => setNote(e.target.value.slice(0, noteLimit))}
            maxLength={noteLimit}
            rows={4}
          />
          {showDescriptionCounter && (
            <div className="char-counter">
              <span className="hint-text">Internal only · Short &amp; to the point · Not for project notes</span>
              <span className={`char-count ${charsLeft < 50 ? 'near-limit' : ''}`}>{note.length}/{noteLimit}</span>
            </div>
          )}
        </div>

        {/* Errors / success */}
        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success"><span className="icon icon-sm">check_circle</span> Activity saved</div>}

        {/* Form actions */}
        <div className="activity-form-actions">
          <button type="button" className="btn-ghost" onClick={clearCalendarActivity} disabled={submitting}>
            Clear activity
          </button>
          <button type="submit" className="btn-primary" disabled={!canSubmit}>
            {submitting ? 'Saving…' : 'Save'}
          </button>
        </div>
        </>
        )}

        {isInboxImportMode && (
          <div className="field">
            <label className="field-label">Inbox</label>
            <p className="hint-text">Import your email threads to Dynamics from here.</p>
            <InboxTab
              compact
              selectedAccount={account}
              onImported={(result) => completePostCreateFlow(result?.browseAccount || null)}
            />
          </div>
        )}
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
