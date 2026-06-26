import { InteractionRequiredAuthError } from '@azure/msal-browser'
import { dataverseRequest } from '../authConfig'

const BASE_URL = (import.meta.env.VITE_DATAVERSE_URL || '').replace(/\/$/, '')
const API = `${BASE_URL}/api/data/v9.2`

const DV_HEADERS = {
  Accept: 'application/json',
  'Content-Type': 'application/json',
  'OData-MaxVersion': '4.0',
  'OData-Version': '4.0',
  Prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue",odata.maxpagesize=100',
}

// ─── Activity type definitions (shared across create form and browse) ─────────
// Maps to the three native Dynamics activity entities used in this app.
// tooltip: legacy QuickNotes terminology shown as a hover hint only.
export const ACTIVITY_TYPES = [
  {
    id: 'phonecall',
    label: 'Phone Call',
    icon: '📞',
    iconLigature: 'contact_phone',
    entity: 'phonecalls',
    cssClass: 'type-call',
    tooltip: 'Previously known as: Call',
  },
  {
    id: 'appointment',
    label: 'Appointment',
    icon: '📅',
    iconLigature: 'calendar_today',
    entity: 'appointments',
    cssClass: 'type-appt',
    tooltip: 'Previously known as: Visit, Tradeshow, Internal, Account Roundtable, Annual Business Review',
  },
  {
    id: 'email',
    label: 'Email',
    icon: '✉️',
    iconLigature: 'mail',
    entity: 'emails',
    cssClass: 'type-email',
    tooltip: 'Previously known as: Email / Chat',
  },
  {
    id: 'escalation',
    label: 'Escalation',
    icon: '🚨',
    iconLigature: 'warning',
    entity: 'slc_escalations',
    cssClass: 'type-escalation',
    tooltip: 'Escalation activity',
  },
  {
    id: 'note',
    label: 'Note',
    icon: '📝',
    iconLigature: 'edit_note',
    entity: 'annotations',
    cssClass: 'type-note',
    tooltip: 'Quick note or update',
  },
]

// Escalation status labels (for display in browse only — escalations are managed in Dynamics)
export const ESCALATION_STATUSES = [
  { value: 1, label: 'Active', cssClass: 'status-active' },
  { value: 2, label: 'Resolved', cssClass: 'status-resolved' },
]

// ─── Escalation helpers ──────────────────────────────────────────────────────

/**
 * Fetch the active escalation record for an account by querying slc_escalations directly.
 * Business rule: an account can have at most ONE escalation that is open (1) or in-progress (2).
 */
export async function getActiveEscalation(msalInstance, accountId) {
  if (!accountId) return null
  // Query for active escalation record (slc_status=1 means Active)
  const filter = `_regardingobjectid_value eq ${accountId} and slc_status eq 1`
  const data = await dvFetch(
    msalInstance,
    `/slc_escalations?$filter=${filter}&$select=activityid,subject,description,slc_status,slc_startdate,createdon&$orderby=createdon desc&$top=1`,
  ).catch(() => null)
  return data?.value?.[0] ?? null
}

// ─── Token helper ────────────────────────────────────────────────────────────
export async function getDvToken(msalInstance) {
  const account = msalInstance.getAllAccounts()[0]
  if (!account) throw new Error('Not authenticated')
  try {
    const r = await msalInstance.acquireTokenSilent({ ...dataverseRequest, account })
    return r.accessToken
  } catch (e) {
    if (e instanceof InteractionRequiredAuthError) {
      const r = await msalInstance.acquireTokenPopup({ ...dataverseRequest, account })
      return r.accessToken
    }
    throw e
  }
}

async function dvFetch(msalInstance, path, options = {}) {
  const token = await getDvToken(msalInstance)
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { ...DV_HEADERS, Authorization: `Bearer ${token}`, ...options.headers },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Dataverse ${options.method || 'GET'} ${path} → ${res.status}: ${text}`)
  }
  if (res.status === 204) return null
  return res.json()
}

// ─── Identity ─────────────────────────────────────────────────────────────────
export async function whoAmI(msalInstance) {
  return dvFetch(msalInstance, '/WhoAmI')
}

// ─── Accounts ────────────────────────────────────────────────────────────────
export async function searchAccounts(msalInstance, query) {
  if (!query || query.trim().length < 2) return []
  const q = encodeURIComponent(query.trim().replace(/'/g, "''"))
  const select = 'accountid,name,address1_country,address1_stateorprovince'
  // Return startswith matches first, then any contains matches, merged and deduped
  const [startsWith, contains] = await Promise.all([
    dvFetch(msalInstance, `/accounts?$filter=startswith(name,'${q}')&$select=${select}&$orderby=name asc&$top=10`).catch(() => null),
    dvFetch(msalInstance, `/accounts?$filter=contains(name,'${q}')&$select=${select}&$orderby=name asc&$top=10`).catch(() => null),
  ])
  const seen = new Set()
  const results = []
  for (const item of [...(startsWith?.value ?? []), ...(contains?.value ?? [])]) {
    if (!seen.has(item.accountid)) {
      seen.add(item.accountid)
      results.push(item)
    }
  }
  return results
}

// ─── Contacts ────────────────────────────────────────────────────────────────
export async function searchContacts(msalInstance, query, accountId = null) {
  if (!query || query.trim().length < 2) return []
  const q = encodeURIComponent(query.trim())
  let filter = `contains(fullname,'${q}')`
  if (accountId) filter += ` and _parentaccountid_value eq ${accountId}`
  const data = await dvFetch(
    msalInstance,
    `/contacts?$filter=${filter}&$select=contactid,fullname,emailaddress1&$top=10`,
  )
  return data?.value ?? []
}

export async function findContactByEmail(msalInstance, email) {
  if (!email) return null
  const enc = encodeURIComponent(email.toLowerCase())
  const data = await dvFetch(
    msalInstance,
    `/contacts?$filter=emailaddress1 eq '${enc}'&$select=contactid,fullname,emailaddress1&$top=1`,
  )
  return data?.value?.[0] ?? null
}

// ─── Activity creation ──────────────────────────────────────────────────────────
// Resolve attendees to Dynamics contacts (parallel)
export async function resolveAttendees(msalInstance, attendees) {
  return Promise.all(
    attendees.map(async (a) => {
      if (a.contactId) return a // already resolved
      const contact = await findContactByEmail(msalInstance, a.email)
      return contact ? { ...a, contactId: contact.contactid, name: contact.fullname } : a
    }),
  )
}

function buildParties(typeId, currentUserId, attendees) {
  const parties = []

  if (typeId === 'phonecall') {
    // Caller = current user (mask 1 = sender/from)
    parties.push({
      participationtypemask: 1,
      'partyid_systemuser@odata.bind': `/systemusers(${currentUserId})`,
    })
    attendees.forEach((a) => {
      if (a.contactId) {
        parties.push({ participationtypemask: 2, 'partyid_contact@odata.bind': `/contacts(${a.contactId})` })
      } else if (a.email) {
        parties.push({ participationtypemask: 2, addressused: a.email })
      }
    })
  } else if (typeId === 'appointment') {
    // Organizer = current user (mask 7), required attendees (mask 5)
    parties.push({
      participationtypemask: 7,
      'partyid_systemuser@odata.bind': `/systemusers(${currentUserId})`,
    })
    attendees.forEach((a) => {
      if (a.contactId) {
        parties.push({ participationtypemask: 5, 'partyid_contact@odata.bind': `/contacts(${a.contactId})` })
      } else if (a.email) {
        parties.push({ participationtypemask: 5, addressused: a.email })
      }
    })
  } else {
    // Email: from = current user (mask 1), to = attendees (mask 2)
    parties.push({
      participationtypemask: 1,
      'partyid_systemuser@odata.bind': `/systemusers(${currentUserId})`,
    })
    attendees.forEach((a) => {
      if (a.contactId) {
        parties.push({ participationtypemask: 2, 'partyid_contact@odata.bind': `/contacts(${a.contactId})` })
      } else if (a.email) {
        parties.push({ participationtypemask: 2, addressused: a.email })
      }
    })
  }

  return parties
}

export async function createActivity(msalInstance, { type, accountId, date, note, attendees, currentUserId, linkToEscalationId }) {
  const typeConfig = ACTIVITY_TYPES.find((t) => t.id === type)
  if (!typeConfig) throw new Error(`Unknown activity type: ${type}`)

  const dateStr = new Date(date).toISOString()
  const endStr = new Date(new Date(date).getTime() + 30 * 60 * 1000).toISOString()

  // Note (annotation) — links to escalation if linkToEscalationId, otherwise to account
  if (type === 'note') {
    const objectBind = linkToEscalationId
      ? { 'objectid_slc_escalation@odata.bind': `/slc_escalations(${linkToEscalationId})` }
      : { 'objectid_account@odata.bind': `/accounts(${accountId})` }
    const body = {
      subject: 'Note',
      notetext: note,
      ...objectBind,
    }
    return dvFetch(msalInstance, '/annotations', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { Prefer: 'return=representation' },
    })
  }

  const parties = buildParties(type, currentUserId, attendees)

  // If linking to an escalation, set regardingobjectid to the escalation instead of the account
  const regardingBind = linkToEscalationId
    ? { 'regardingobjectid_slc_escalation@odata.bind': `/slc_escalations(${linkToEscalationId})` }
    : { 'regardingobjectid_account@odata.bind': `/accounts(${accountId})` }

  const base = {
    description: note,
    subject: typeConfig.label,
    scheduledend: dateStr,
    ...regardingBind,
  }

  let entity, body

  if (type === 'phonecall') {
    entity = 'phonecalls'
    body = { ...base, directioncode: false, phonecall_activity_parties: parties }
  } else if (type === 'appointment') {
    entity = 'appointments'
    body = { ...base, scheduledstart: dateStr, appointment_activity_parties: parties }
  } else {
    // email
    entity = 'emails'
    body = { ...base, directioncode: false, email_activity_parties: parties }
  }

  return dvFetch(msalInstance, `/${entity}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { Prefer: 'return=representation' },
  })
}

// ─── Browse / search activities ───────────────────────────────────────────────
const PARTY_EXPAND = (prefix) =>
  `${prefix}_activity_parties($select=participationtypemask,addressused;$expand=partyid_contact($select=fullname,emailaddress1),partyid_systemuser($select=fullname))`

const BASE_SELECT = 'activityid,subject,description,createdon,scheduledend,scheduledstart,actualend,_regardingobjectid_value'

/**
 * Fetch IDs of all entities related to an account that activities might be filed against.
 * Covers the four relationship paths from the dataverse-api skill:
 *   1. Direct (handled by caller — accountId itself)
 *   2. Via opportunity  (_parentaccountid_value)
 *   3. Via contact      (_parentcustomerid_value)
 *   4. Via lead         (_parentaccountid_value)
 * Returns an array of GUID strings (does NOT include accountId itself).
 */
async function getAccountRelatedEntityIds(msalInstance, accountId) {
  const [opportunitiesData, contactsData, leadsData] = await Promise.all([
    dvFetch(
      msalInstance,
      `/opportunities?$filter=_parentaccountid_value eq ${accountId}&$select=opportunityid&$top=50`,
    ).catch(() => null),
    dvFetch(
      msalInstance,
      `/contacts?$filter=_parentcustomerid_value eq ${accountId}&$select=contactid&$top=50`,
    ).catch(() => null),
    dvFetch(
      msalInstance,
      `/leads?$filter=_parentaccountid_value eq ${accountId}&$select=leadid&$top=50`,
    ).catch(() => null),
  ])

  const ids = []
  for (const opp of opportunitiesData?.value ?? []) ids.push(opp.opportunityid)
  for (const c of contactsData?.value ?? []) ids.push(c.contactid)
  for (const lead of leadsData?.value ?? []) ids.push(lead.leadid)
  return ids
}

// ─── Dynamics deep link ───────────────────────────────────────────────────────
const ENTITY_SINGULAR = { phonecalls: 'phonecall', appointments: 'appointment', emails: 'email', slc_escalations: 'slc_escalation', annotations: 'annotation' }

export function getDynamicsUrl(entityType, activityid) {
  const etn = ENTITY_SINGULAR[entityType] || entityType
  return `${BASE_URL}/main.aspx?etn=${etn}&id=${activityid}&pagetype=entityrecord`
}

export async function deleteActivity(msalInstance, entityType, activityid) {
  return dvFetch(msalInstance, `/${entityType}(${activityid})`, { method: 'DELETE' })
}

// Note: Dataverse rejects combining $expand (one-to-many) with $top (error 0x80060888).
// Tasks carry no meaningful parties so they use $top without expand.
async function fetchFiltered(msalInstance, entity, partyKey, filterClauses) {
  const filterStr = filterClauses.length ? `&$filter=${filterClauses.join(' and ')}` : ''
  const expandOrTop = partyKey ? `&$expand=${PARTY_EXPAND(partyKey)}` : '&$top=50'
  const data = await dvFetch(
    msalInstance,
    `/${entity}?$select=${BASE_SELECT}${filterStr}${expandOrTop}&$orderby=createdon desc`,
  )
  return (data?.value ?? []).map((r) => ({ ...r, _entityType: entity }))
}

// Escalations have custom columns and no activity parties — fetch with extended select
const ESCALATION_SELECT = `${BASE_SELECT},slc_startdate,slc_resolveddate,slc_status`

async function fetchEscalations(msalInstance, filterClauses) {
  const filterStr = filterClauses.length ? `&$filter=${filterClauses.join(' and ')}` : ''
  const data = await dvFetch(
    msalInstance,
    `/slc_escalations?$select=${ESCALATION_SELECT}${filterStr}&$orderby=createdon desc`,
    { headers: { Prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue",odata.maxpagesize=100' } },
  )
  return (data?.value ?? []).map((r) => ({ ...r, _entityType: 'slc_escalations' }))
}

// Annotations (notes)
const ANNOTATION_SELECT = 'annotationid,subject,notetext,createdon,_objectid_value'

async function fetchAnnotations(msalInstance, filterClauses) {
  // Annotations use _objectid_value instead of _regardingobjectid_value
  const adjusted = filterClauses.map((c) => c.replace(/_regardingobjectid_value/g, '_objectid_value'))
  const filterStr = adjusted.length ? `&$filter=${adjusted.join(' and ')}` : ''
  const data = await dvFetch(
    msalInstance,
    `/annotations?$select=${ANNOTATION_SELECT}${filterStr}&$orderby=createdon desc`,
  ).catch(() => ({ value: [] }))

  return (data?.value ?? []).map((r) => ({
    ...r,
    activityid: r.annotationid,
    description: r.notetext,
    _regardingobjectid_value: r._objectid_value,
    '_regardingobjectid_value@OData.Community.Display.V1.FormattedValue': r['_objectid_value@OData.Community.Display.V1.FormattedValue'],
    _entityType: 'annotations',
  }))
}

/**
 * Search activities using server-side OData filters.
 * Returns [] immediately when no filters are provided (lazy-load pattern).
 * @param {{ accountId, contactId, activityType, dateFrom, dateTo }} filters
 */
export async function searchActivities(msalInstance, { accountId, contactId, activityType, dateFrom, dateTo }) {
  if (!accountId && !contactId && !activityType && !dateFrom && !dateTo) return []

  const base = []

  if (accountId) {
    // Fetch IDs of all related entities (opportunities, etc.) so their activities are included
    const relatedIds = await getAccountRelatedEntityIds(msalInstance, accountId)
    const allIds = Array.from(new Set([accountId, ...relatedIds])).slice(0, 50)
    const regardingFilter = allIds.map((id) => `_regardingobjectid_value eq ${id}`).join(' or ')
    base.push(allIds.length > 1 ? `(${regardingFilter})` : regardingFilter)
  }

  if (dateFrom) base.push(`createdon ge ${new Date(dateFrom).toISOString()}`)
  if (dateTo) {
    const d = new Date(dateTo)
    d.setDate(d.getDate() + 1)
    base.push(`createdon lt ${d.toISOString()}`)
  }

  const typeConfig = activityType ? ACTIVITY_TYPES.find((t) => t.id === activityType) : null
  const fetches = []

  const wantCalls = !typeConfig || typeConfig.entity === 'phonecalls'
  const wantAppts = !typeConfig || typeConfig.entity === 'appointments'
  const wantEmails = !typeConfig || typeConfig.entity === 'emails'
  const wantEscalations = !typeConfig || typeConfig.entity === 'slc_escalations'
  const wantAnnotations = !typeConfig || typeConfig.entity === 'annotations'

  if (wantCalls) {
    const clauses = [...base]
    if (contactId) clauses.push(`phonecall_activity_parties/any(p: p/_partyid_value eq ${contactId})`)
    fetches.push(fetchFiltered(msalInstance, 'phonecalls', 'phonecall', clauses))
  }

  if (wantAppts) {
    const clauses = [...base]
    if (contactId) clauses.push(`appointment_activity_parties/any(p: p/_partyid_value eq ${contactId})`)
    fetches.push(fetchFiltered(msalInstance, 'appointments', 'appointment', clauses))
  }

  if (wantEmails) {
    const clauses = [...base]
    if (contactId) clauses.push(`email_activity_parties/any(p: p/_partyid_value eq ${contactId})`)
    fetches.push(fetchFiltered(msalInstance, 'emails', 'email', clauses))
  }

  if (wantEscalations) {
    const clauses = [...base]
    fetches.push(fetchEscalations(msalInstance, clauses))
  }

  if (wantAnnotations) {
    fetches.push(fetchAnnotations(msalInstance, base))
  }

  const results = await Promise.all(fetches)
  const all = results.flat()
  all.sort((a, b) => new Date(b.createdon) - new Date(a.createdon))
  return all
}

// Normalise activity party records into a flat attendee list
export function extractAttendees(note) {
  // Escalations and annotations have no activity parties
  if (note._entityType === 'slc_escalations' || note._entityType === 'annotations') return []

  let key, skipMasks
  if (note._entityType === 'phonecalls') {
    key = 'phonecall_activity_parties'
    skipMasks = new Set([1, 9]) // skip caller (from) and owner
  } else if (note._entityType === 'appointments') {
    key = 'appointment_activity_parties'
    skipMasks = new Set([7, 9]) // skip organizer and owner
  } else if (note._entityType === 'slc_escalations') {
    key = 'slc_escalation_activity_parties'
    skipMasks = new Set([1, 9]) // skip sender and owner
  } else {
    key = 'email_activity_parties'
    skipMasks = new Set([1, 9]) // skip sender (from) and owner
  }

  const parties = note[key] ?? []
  const result = []

  for (const p of parties) {
    if (skipMasks.has(p.participationtypemask)) continue
    const contact = p.partyid_contact
    const user = p.partyid_systemuser
    if (contact) {
      result.push({ name: contact.fullname, email: contact.emailaddress1, type: 'contact' })
    } else if (user) {
      result.push({ name: user.fullname, type: 'user' })
    } else if (p.addressused) {
      result.push({ name: p.addressused, email: p.addressused, type: 'external' })
    }
  }
  return result
}

export function noteTypeLabel(note) {
  if (note._entityType === 'phonecalls') return 'Phone Call'
  if (note._entityType === 'emails') return 'Email'
  if (note._entityType === 'slc_escalations') return 'Escalation'
  if (note._entityType === 'annotations') return 'Note'
  return 'Appointment'
}

export function noteDate(note) {
  if (note._entityType === 'slc_escalations') return note.slc_startdate || note.createdon
  return note.scheduledstart || note.scheduledend || note.actualend || note.createdon
}
