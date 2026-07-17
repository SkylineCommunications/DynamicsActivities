import { InteractionRequiredAuthError } from '@azure/msal-browser'
import { dataverseRequest } from '../authConfig'
import { formatPreviewHtml } from '../utils/htmlPreview'

const BASE_URL = (import.meta.env.VITE_DATAVERSE_URL || '').replace(/\/$/, '')
const API = `${BASE_URL}/api/data/v9.2`

const DV_HEADERS = {
  Accept: 'application/json',
  'Content-Type': 'application/json',
  'OData-MaxVersion': '4.0',
  'OData-Version': '4.0',
  Prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue,Microsoft.Dynamics.CRM.lookuplogicalname",odata.maxpagesize=100',
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
  {
    id: 'lead',
    label: 'Lead',
    icon: '📈',
    iconLigature: 'trending_up',
    entity: 'leads',
    cssClass: 'type-lead',
    tooltip: 'Lead (managed in Dynamics)',
  },
  {
    id: 'opportunity',
    label: 'Opportunity',
    icon: '💼',
    iconLigature: 'work',
    entity: 'opportunities',
    cssClass: 'type-opportunity',
    tooltip: 'Sales opportunity (managed in Dynamics)',
  },
  {
    id: 'support',
    label: 'Support',
    icon: '🛡️',
    iconLigature: 'support_agent',
    entity: 'support',
    cssClass: 'type-support',
    tooltip: 'Support renewal (managed in Dynamics)',
  },
]

// Dataverse's native description/notetext limits. These are field limits, not
// UI recommendations; keep the form aligned with the entity being created.
export const ACTIVITY_DESCRIPTION_LIMITS = {
  phonecall: 2000,
  appointment: 1048576,
  email: 1073741823,
  note: 100000,
}

function compareNames(a, b) {
  const nameA = String(a?.fullname || a?.emailaddress1 || a?.name || '')
    .trim()
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
  const nameB = String(b?.fullname || b?.emailaddress1 || b?.name || '')
    .trim()
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
  if (!nameA && nameB) return 1
  if (nameA && !nameB) return -1
  if (nameA < nameB) return -1
  if (nameA > nameB) return 1
  return 0
}

function isUnnamedContact(contact) {
  const name = String(contact?.fullname || '').trim()
  const email = String(contact?.emailaddress1 || '').trim()
  return !name
    || !/[\p{L}\p{N}]/u.test(name)
    || (email && name.toLowerCase() === email.toLowerCase())
    || /^[^@\s]+@[^@\s]+$/.test(name)
}

function contactSortRank(contact, preferredContactIds) {
  if (preferredContactIds.has(String(contact?.contactid || '').toLowerCase())) return 0
  return isUnnamedContact(contact) ? 2 : 1
}

function limitActivityDescription(type, value) {
  const description = String(value || '')
  return description.slice(0, ACTIVITY_DESCRIPTION_LIMITS[type])
}

// Escalation status labels (for display in browse only — escalations are managed in Dynamics)
export const ESCALATION_STATUSES = [
  { value: 0, label: 'Active', cssClass: 'status-active' },
  { value: 1, label: 'Resolved', cssClass: 'status-resolved' },
]

// ─── Escalation helpers ──────────────────────────────────────────────────────
const ESCALATION_ACCOUNT_LOOKUP_FIELD = '_slc_accountid_value'

/**
 * Fetch the active escalation record for an account by querying slc_escalations directly.
 * Business rule: an account can have at most ONE active escalation.
 */
export async function getActiveEscalation(msalInstance, accountId) {
  if (!accountId) return null
  // Escalation uses status/state on a custom table. Keep query to stable logical names.
  const filter = `${ESCALATION_ACCOUNT_LOOKUP_FIELD} eq ${accountId} and statecode eq 0`
  const data = await dvFetch(
    msalInstance,
    `/slc_escalations?$filter=${filter}&$select=slc_escalationid,statecode,statuscode,slc_startdate,createdon&$orderby=createdon desc&$top=1`,
  ).catch(() => null)
  const record = data?.value?.[0]
  if (!record) return null
  return {
    ...record,
    slc_escalationid: record.slc_escalationid || null,
    slc_status: typeof record.statecode === 'number' ? record.statecode : null,
    slc_startdate: record.slc_startdate || null,
    slc_resolveddate: record.slc_resolveddate || null,
  }
}

// ─── Lead helpers ────────────────────────────────────────────────────────────

/**
 * Fetch open leads for an account.
 * Returns leads with statecode=0 (Open), ordered by creation date desc.
 */
export async function getAccountLeads(msalInstance, accountId) {
  if (!accountId) return []
  const data = await dvFetch(
    msalInstance,
    `/leads?$filter=_parentaccountid_value eq ${accountId} and statecode eq 0&$select=leadid,subject,statuscode,schedulefollowup_prospect&$orderby=createdon desc&$top=20`,
  ).catch(() => null)
  return (data?.value ?? []).map((l) => ({
    ...l,
    statusLabel: l['statuscode@OData.Community.Display.V1.FormattedValue'] || 'Open',
  }))
}

export async function getAccountOpportunities(msalInstance, accountId) {
  if (!accountId) return []
  const data = await dvFetch(
    msalInstance,
    `/opportunities?$filter=_parentaccountid_value eq ${accountId} and statecode eq 0&$select=opportunityid,name,statuscode&$orderby=createdon desc&$top=20`,
  ).catch(() => null)
  return (data?.value ?? []).map((opportunity) => ({
    ...opportunity,
    statusLabel: opportunity['statuscode@OData.Community.Display.V1.FormattedValue'] || 'Open',
  }))
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

export async function assertDataverseAppAccess(msalInstance) {
  await dvFetch(msalInstance, '/accounts?$select=accountid&$top=1')
}

export async function getUserCalType(msalInstance, userId) {
  if (!userId) return null
  const user = await dvFetch(msalInstance, `/systemusers(${userId})?$select=caltype`)
  return typeof user?.caltype === 'number' ? user.caltype : null
}

// CAL types that can create/manage leads in Dynamics Sales
const SALES_CAL_TYPES = new Set([7, 8, 9, 10, 11, 12]) // Enterprise, Device Enterprise, Sales, Service, Field Service, Project Service

/**
 * Check if the current user has a sales-capable license (not Team Member).
 * Team Member (caltype 0/Professional, 2/Basic, 5/Essential) cannot create leads.
 */
export async function getUserCanManageLeads(msalInstance, userId) {
  const calType = await getUserCalType(msalInstance, userId)
  return calType !== null && SALES_CAL_TYPES.has(calType)
}

// ─── Accounts ────────────────────────────────────────────────────────────────
export async function searchAccounts(msalInstance, query, paging = null) {
  const isPaged = !!paging
  const trimmed = query?.trim() ?? ''
  if ((!trimmed && !isPaged) || (trimmed && trimmed.length < 2)) return isPaged ? { items: [], hasMore: false } : []
  const skip = paging?.skip ?? 0
  const top = paging?.top ?? 25
  const fetchTop = Math.min(Math.max(skip + top + 1, top + 1), 101)
  const q = trimmed.replace(/'/g, "''")
  const select = 'accountid,name,address1_country,address1_stateorprovince'
  if (!trimmed) {
    const data = await dvFetch(
      msalInstance,
      `/accounts?$select=${select}&$orderby=name asc&$top=${fetchTop}`,
    )
    const items = data?.value ?? []
    return isPaged ? { items: items.slice(skip, skip + top), hasMore: items.length > skip + top } : items
  }
  // Return startswith matches first, then any contains matches, merged and deduped
  const [startsWith, contains] = await Promise.all([
    dvFetch(msalInstance, `/accounts?$filter=${encodeURIComponent(`startswith(name,'${q}')`)}&$select=${select}&$orderby=name asc&$top=${fetchTop}`).catch(() => null),
    dvFetch(msalInstance, `/accounts?$filter=${encodeURIComponent(`contains(name,'${q}')`)}&$select=${select}&$orderby=name asc&$top=${fetchTop}`).catch(() => null),
  ])
  const seen = new Set()
  const results = []
  for (const item of [...(startsWith?.value ?? []), ...(contains?.value ?? [])]) {
    if (!seen.has(item.accountid)) {
      seen.add(item.accountid)
      results.push(item)
    }
  }
  results.sort(compareNames)
  return isPaged
    ? { items: results.slice(skip, skip + top), hasMore: results.length > skip + top }
    : results
}



/**
 * Resolve an array of Skyline customers to Dataverse accounts.
 * Strategy: batch exact name matches with acronym exact/starts-with matches.
 * @param {Array<{ name: string, acronym: string }>} customers
 * @returns {Promise<Array<{ accountid: string, name: string }>>}
 */
export async function resolveAccountsByNames(msalInstance, customers) {
  if (!customers?.length) return []
  const clauses = []

  for (const { name, acronym } of customers) {
    if (name?.trim()) {
      clauses.push(`name eq '${name.trim().replace(/'/g, "''")}'`)
    }
    if (acronym?.trim()) {
      const safeAcronym = acronym.trim().replace(/'/g, "''")
      clauses.push(`name eq '${safeAcronym}'`)
      clauses.push(`startswith(name,'${safeAcronym}')`)
    }
  }

  if (!clauses.length) return []

  const filter = encodeURIComponent(clauses.join(' or '))
  const data = await dvFetch(
    msalInstance,
    `/accounts?$filter=${filter}&$select=accountid,name&$orderby=name asc&$top=100`,
  ).catch(() => null)

  const resolved = new Map()
  for (const account of data?.value ?? []) {
    if (!resolved.has(account.accountid)) resolved.set(account.accountid, account)
  }
  return Array.from(resolved.values())
}

export async function searchCountries(msalInstance, query) {
  if (!query || query.trim().length < 1) return []
  const q = encodeURIComponent(query.trim().replace(/'/g, "''"))
  const data = await dvFetch(
    msalInstance,
    `/accounts?$filter=contains(address1_country,'${q}') and address1_country ne null&$select=address1_country&$top=50`,
  ).catch(() => null)
  const seen = new Set()
  return (data?.value ?? [])
    .map((a) => a.address1_country)
    .filter((c) => c && !seen.has(c) && seen.add(c))
    .sort()
    .map((c) => ({ id: c, name: c }))
}

export async function searchRegions(msalInstance, query) {
  if (!query || query.trim().length < 1) return []
  const q = encodeURIComponent(query.trim().replace(/'/g, "''"))
  const data = await dvFetch(
    msalInstance,
    `/accounts?$filter=contains(address1_stateorprovince,'${q}') and address1_stateorprovince ne null&$select=address1_stateorprovince&$top=50`,
  ).catch(() => null)
  const seen = new Set()
  return (data?.value ?? [])
    .map((a) => a.address1_stateorprovince)
    .filter((r) => r && !seen.has(r) && seen.add(r))
    .sort()
    .map((r) => ({ id: r, name: r }))
}

// ─── Contacts ────────────────────────────────────────────────────────────────
export async function searchContacts(msalInstance, query, accountIdOrPaging = null, maybePaging = null) {
  const paging = maybePaging || (accountIdOrPaging && typeof accountIdOrPaging === 'object' ? accountIdOrPaging : null)
  const accountIds = paging?.accountIds
    || (accountIdOrPaging ? [accountIdOrPaging] : [])
  const legacyAccountId = !paging && typeof accountIdOrPaging === 'string' ? accountIdOrPaging : null
  const trimmed = query?.trim() ?? ''
  const isPaged = !!paging
  if ((trimmed && trimmed.length < 2) || (!trimmed && !isPaged)) return isPaged ? { items: [], hasMore: false } : []

  const skip = paging?.skip ?? 0
  const top = paging?.top ?? 25
  const fetchTop = Math.min(Math.max(skip + top + 1, top + 1), 101)
  const nameFilter = trimmed ? `contains(fullname,'${trimmed.replace(/'/g, "''")}')` : ''
  const select = 'contactid,fullname,emailaddress1,_parentcustomerid_value'
  const accountFilter = legacyAccountId
    ? `_parentcustomerid_value eq ${legacyAccountId}`
    : ''
  const preferredFilter = accountIds.length
    ? `(${accountIds.map((id) => `_parentcustomerid_value eq ${id}`).join(' or ')})`
    : ''
  const queryContacts = async (extraFilters = []) => {
    const filter = [nameFilter, accountFilter, ...extraFilters].filter(Boolean).join(' and ')
    const data = await dvFetch(
      msalInstance,
      `/contacts${filter ? `?$filter=${encodeURIComponent(filter)}&` : '?'}$select=${select}&$orderby=fullname asc&$top=${fetchTop}`,
    )
    return data?.value ?? []
  }

  const [preferredContacts, namedOtherContacts, unnamedOtherContacts] = await Promise.all([
    accountIds.length ? queryContacts([preferredFilter]) : Promise.resolve([]),
    queryContacts(['fullname ne null', "not contains(fullname,'@')"]),
    queryContacts(["contains(fullname,'@')"]),
  ])
  const otherContacts = [...namedOtherContacts, ...unnamedOtherContacts]
  const preferredContactIds = new Set(
    preferredContacts.map((contact) => String(contact.contactid || '').toLowerCase()),
  )
  const seen = new Set()
  const contacts = [...preferredContacts, ...otherContacts]
    .filter((contact) => {
      if (seen.has(contact.contactid)) return false
      seen.add(contact.contactid)
      return true
    })
    .sort((a, b) => {
      const rankDifference = contactSortRank(a, preferredContactIds) - contactSortRank(b, preferredContactIds)
      return rankDifference || compareNames(a, b)
    })
  return isPaged
    ? { items: contacts.slice(skip, skip + top), hasMore: contacts.length > skip + top }
    : contacts
}

export async function searchOpportunities(msalInstance, query) {
  if (!query || query.trim().length < 2) return []
  const q = encodeURIComponent(query.trim().replace(/'/g, "''"))
  const [startsWith, contains] = await Promise.all([
    dvFetch(msalInstance, `/opportunities?$filter=startswith(name,'${q}')&$select=opportunityid,name&$orderby=name asc&$top=10`).catch(() => null),
    dvFetch(msalInstance, `/opportunities?$filter=contains(name,'${q}')&$select=opportunityid,name&$orderby=name asc&$top=10`).catch(() => null),
  ])
  const seen = new Set()
  const results = []
  for (const item of [...(startsWith?.value ?? []), ...(contains?.value ?? [])]) {
    if (!seen.has(item.opportunityid)) {
      seen.add(item.opportunityid)
      results.push(item)
    }
  }
  return results
}

export async function searchLeads(msalInstance, query) {
  if (!query || query.trim().length < 2) return []
  const q = encodeURIComponent(query.trim().replace(/'/g, "''"))
  const [startsWith, contains] = await Promise.all([
    dvFetch(msalInstance, `/leads?$filter=startswith(fullname,'${q}')&$select=leadid,fullname,companyname&$orderby=fullname asc&$top=10`).catch(() => null),
    dvFetch(msalInstance, `/leads?$filter=contains(fullname,'${q}') or contains(companyname,'${q}')&$select=leadid,fullname,companyname&$orderby=fullname asc&$top=10`).catch(() => null),
  ])
  const seen = new Set()
  const results = []
  for (const item of [...(startsWith?.value ?? []), ...(contains?.value ?? [])]) {
    if (!seen.has(item.leadid)) {
      seen.add(item.leadid)
      results.push(item)
    }
  }
  return results
}

export async function resolveAccountForRegarding(msalInstance, { regardingType, regardingId }) {
  if (!regardingType || !regardingId) return null

  if (regardingType === 'account') {
    const account = await dvFetch(msalInstance, `/accounts(${regardingId})?$select=accountid,name`).catch(() => null)
    if (!account?.accountid) return null
    return { accountid: account.accountid, name: account.name || 'Account' }
  }

  const regardingEntity = regardingType === 'opportunity' ? 'opportunities' : regardingType === 'lead' ? 'leads' : null
  if (!regardingEntity) return null

  const regardingRecord = await dvFetch(
    msalInstance,
    `/${regardingEntity}(${regardingId})?$select=_parentaccountid_value`,
  ).catch(() => null)
  const accountId = regardingRecord?._parentaccountid_value
  if (!accountId) return null

  return {
    accountid: accountId,
    name: regardingRecord['_parentaccountid_value@OData.Community.Display.V1.FormattedValue'] || 'Account',
  }
}

export async function findContactByEmail(msalInstance, email, preferredAccountId = null) {
  if (!email) return null
  const enc = encodeURIComponent(email.toLowerCase())
  const data = await dvFetch(
    msalInstance,
    `/contacts?$filter=emailaddress1 eq '${enc}'&$select=contactid,fullname,emailaddress1,_parentcustomerid_value&$orderby=fullname asc&$top=10`,
  )
  const contacts = data?.value ?? []
  if (!contacts.length) return null
  if (!preferredAccountId) return contacts[0]

  const preferred = contacts.find((contact) => contact?._parentcustomerid_value === preferredAccountId)
  return preferred ?? contacts[0]
}

export async function suggestAccountByEmailDomain(msalInstance, email) {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  const at = normalizedEmail.lastIndexOf('@')
  if (at <= 0 || at === normalizedEmail.length - 1) return null
  const domain = normalizedEmail.slice(at + 1)
  if (!domain || domain.includes(' ')) return null
  const domainFilter = encodeURIComponent(`@${domain}`.replace(/'/g, "''"))
  const data = await dvFetch(
    msalInstance,
    `/contacts?$filter=contains(emailaddress1,'${domainFilter}') and _parentcustomerid_value ne null&$select=_parentcustomerid_value&$top=50`,
  ).catch(() => null)
  const accountCounts = new Map()
  for (const contact of data?.value ?? []) {
    const accountId = contact?._parentcustomerid_value
    const accountType = contact?.['_parentcustomerid_value@Microsoft.Dynamics.CRM.lookuplogicalname']
    if (!accountId || accountType !== 'account') continue
    const accountName =
      contact?.['_parentcustomerid_value@OData.Community.Display.V1.FormattedValue'] || 'Suggested account'
    const current = accountCounts.get(accountId) || { accountid: accountId, name: accountName, count: 0 }
    current.count += 1
    accountCounts.set(accountId, current)
  }
  const best = [...accountCounts.values()].sort((a, b) => b.count - a.count)[0]
  return best ? { accountid: best.accountid, name: best.name, count: best.count, domain } : null
}

export async function createContact(msalInstance, {
  firstname = null,
  lastname = null,
  emailaddress1,
  jobtitle = null,
  telephone1 = null,
  accountId = null,
}) {
  if (!firstname && !lastname && !emailaddress1) throw new Error('A contact needs a first name, last name, or email')
  const body = {
    ...(firstname ? { firstname } : {}),
    ...(lastname ? { lastname } : {}),
    ...(emailaddress1 ? { emailaddress1 } : {}),
    ...(jobtitle ? { jobtitle } : {}),
    ...(telephone1 ? { telephone1 } : {}),
    ...(accountId ? { 'parentcustomerid_account@odata.bind': `/accounts(${accountId})` } : {}),
  }
  return dvFetch(msalInstance, '/contacts', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { Prefer: 'return=representation' },
  })
}

// ─── Activity creation ──────────────────────────────────────────────────────────
// Resolve attendees to Dynamics contacts (parallel)
export async function resolveAttendees(msalInstance, attendees) {
  return Promise.all(
    attendees.map(async (a) => {
      if (a.contactId) return a // already resolved
      const contact = await findContactByEmail(msalInstance, a.email)
      const accountId = contact?.['_parentcustomerid_value@Microsoft.Dynamics.CRM.lookuplogicalname'] === 'account'
        ? contact._parentcustomerid_value
        : null
      return contact
        ? {
            ...a,
            contactId: contact.contactid,
            name: contact.fullname,
            accountId: accountId || null,
            accountName: accountId
              ? contact['_parentcustomerid_value@OData.Community.Display.V1.FormattedValue'] || null
              : null,
          }
        : a
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
      if (a.role === 'organizer') return
      if (a.contactId) {
        parties.push({ participationtypemask: 2, 'partyid_contact@odata.bind': `/contacts(${a.contactId})` })
      } else if (a.email) {
        parties.push({ participationtypemask: 2, addressused: a.email })
      }
    })
  } else if (typeId === 'appointment') {
    // Organizer = imported organizer when available, otherwise current user.
    const organizer = attendees.find((a) => a.role === 'organizer')
    if (organizer?.contactId) {
      parties.push({ participationtypemask: 7, 'partyid_contact@odata.bind': `/contacts(${organizer.contactId})` })
    } else if (organizer?.email) {
      parties.push({ participationtypemask: 7, addressused: organizer.email })
    } else {
      parties.push({
        participationtypemask: 7,
        'partyid_systemuser@odata.bind': `/systemusers(${currentUserId})`,
      })
    }
    attendees.forEach((a) => {
      if (a.role === 'organizer') return
      const participationtypemask = a.role === 'optional' ? 6 : 5
      if (a.contactId) {
        parties.push({ participationtypemask, 'partyid_contact@odata.bind': `/contacts(${a.contactId})` })
      } else if (a.email) {
        parties.push({ participationtypemask, addressused: a.email })
      }
    })
  } else {
    // Email: from = current user (mask 1), recipients use To/CC/BCC masks 2/3/4.
    const sender = attendees.find((a) => a.role === 'From')
    if (sender?.contactId) {
      parties.push({ participationtypemask: 1, 'partyid_contact@odata.bind': `/contacts(${sender.contactId})` })
    } else if (sender?.email) {
      parties.push({ participationtypemask: 1, addressused: sender.email })
    } else {
      parties.push({
        participationtypemask: 1,
        'partyid_systemuser@odata.bind': `/systemusers(${currentUserId})`,
      })
    }
    attendees.forEach((a) => {
      if (a.role === 'From') return
      const participationtypemask = a.role === 'CC' ? 3 : a.role === 'BCC' ? 4 : 2
      if (a.contactId) {
        parties.push({ participationtypemask, 'partyid_contact@odata.bind': `/contacts(${a.contactId})` })
      } else if (a.email) {
        parties.push({ participationtypemask, addressused: a.email })
      }
    })
  }

  return parties
}

export async function createActivity(msalInstance, {
  type,
  accountId,
  date,
  end,
  note,
  subject,
  location,
  attendees = [],
  currentUserId,
  linkToEscalationId,
  linkToLeadId,
  regardingType,
  regardingId,
  regardingAccountId,
}) {
  const typeConfig = ACTIVITY_TYPES.find((t) => t.id === type)
  if (!typeConfig) throw new Error(`Unknown activity type: ${type}`)

  const dateStr = new Date(date).toISOString()
  const endStr = end
    ? new Date(end).toISOString()
    : new Date(new Date(date).getTime() + 30 * 60 * 1000).toISOString()

  // Note (annotation) — links to escalation, lead, or account
  if (type === 'note') {
    const objectBind = linkToEscalationId
      ? { 'objectid_slc_escalation@odata.bind': `/slc_escalations(${linkToEscalationId})` }
      : regardingType === 'opportunity' && regardingId
        ? { 'objectid_opportunity@odata.bind': `/opportunities(${regardingId})` }
      : linkToLeadId
        ? { 'objectid_lead@odata.bind': `/leads(${linkToLeadId})` }
        : { 'objectid_account@odata.bind': `/accounts(${accountId})` }
    const body = {
      subject: subject?.trim() || typeConfig.label,
      notetext: limitActivityDescription(type, note),
      ...objectBind,
    }
    return dvFetch(msalInstance, '/annotations', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { Prefer: 'return=representation' },
    })
  }

  const parties = buildParties(type, currentUserId, attendees)

  // Lead is a native regarding target — use direct binding. Escalation is not — use description prefix.
  let regardingBind, desc
  if (regardingId && ['account', 'opportunity', 'lead'].includes(regardingType)) {
    const entityPlural = {
      account: 'accounts',
      opportunity: 'opportunities',
      lead: 'leads',
    }[regardingType]
    regardingBind = { [`regardingobjectid_${regardingType}@odata.bind`]: `/${entityPlural}(${regardingId})` }
    desc = note
  } else if (linkToLeadId) {
    regardingBind = { 'regardingobjectid_lead@odata.bind': `/leads(${linkToLeadId})` }
    desc = note
  } else if (linkToEscalationId) {
    regardingBind = { 'regardingobjectid_account@odata.bind': `/accounts(${accountId})` }
    desc = `[Linked to escalation]\n${note}`
  } else {
    regardingBind = { 'regardingobjectid_account@odata.bind': `/accounts(${regardingAccountId || accountId})` }
    desc = note
  }
  desc = limitActivityDescription(type, desc)

  const base = {
    description: desc,
    subject: subject?.trim() || typeConfig.label,
    ...regardingBind,
  }

  let entity, body

  if (type === 'phonecall') {
    entity = 'phonecalls'
    body = {
      ...base,
      actualend: dateStr,
      directioncode: false,
      phonecall_activity_parties: parties,
    }
  } else if (type === 'appointment') {
    entity = 'appointments'
    body = {
      ...base,
      ...(location?.trim() ? { location: location.trim() } : {}),
      scheduledstart: dateStr,
      scheduledend: endStr,
      appointment_activity_parties: parties,
    }
  } else {
    // email
    entity = 'emails'
    body = {
      ...base,
      actualend: dateStr,
      directioncode: false,
      email_activity_parties: parties,
    }
  }

  return dvFetch(msalInstance, `/${entity}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { Prefer: 'return=representation' },
  })
}

export async function createInboxEmailActivity(
  msalInstance,
  { message, regardingType, regardingId, regardingAccountId, contactsByEmail = {} },
) {
  if (!message) throw new Error('Message is required')
  if (!regardingType || (!regardingId && !regardingAccountId)) throw new Error('A Dynamics link target is required')

  const fromAddress = message.from?.email || ''
  const parties = []

  if (fromAddress) {
    const contact = contactsByEmail[fromAddress.toLowerCase()]
    if (contact) {
      parties.push({ participationtypemask: 1, 'partyid_contact@odata.bind': `/contacts(${contact.contactid})` })
    } else {
      parties.push({ participationtypemask: 1, addressused: fromAddress })
    }
  }

  const recipients = [
    ...(message.toRecipients ?? []).map((recipient) => ({ ...recipient, participationtypemask: 2 })),
    ...(message.ccRecipients ?? []).map((recipient) => ({ ...recipient, participationtypemask: 3 })),
    ...(message.bccRecipients ?? []).map((recipient) => ({ ...recipient, participationtypemask: 4 })),
  ]
  for (const recipient of recipients) {
    const email = (recipient.email || '').toLowerCase()
    if (!email) continue
    const contact = contactsByEmail[email]
    if (contact) {
      parties.push({ participationtypemask: recipient.participationtypemask, 'partyid_contact@odata.bind': `/contacts(${contact.contactid})` })
    } else {
      parties.push({ participationtypemask: recipient.participationtypemask, addressused: recipient.email })
    }
  }

  const isEscalationLink = ['escalation', 'slc_escalation', 'slc_escalations'].includes(regardingType)
  const resolvedRegardingType = isEscalationLink ? 'account' : regardingType
  const resolvedRegardingId = isEscalationLink ? regardingAccountId : regardingId
  const bindName = `regardingobjectid_${resolvedRegardingType}@odata.bind`
  const entityPlural = {
    account: 'accounts',
    opportunity: 'opportunities',
    lead: 'leads',
  }[resolvedRegardingType]

  if (!entityPlural) throw new Error(`Unsupported Dynamics link type: ${regardingType}`)
  if (!resolvedRegardingId) throw new Error(`Missing Dynamics link id for type: ${regardingType}`)

  const messageDescription = Object.prototype.hasOwnProperty.call(message, 'description')
    ? formatPreviewHtml(message.description)
    : formatPreviewHtml(message.bodyHtml || message.bodyPreview)
  const description = [
    messageDescription,
    `<p>Imported from inbox${message.receivedDateTime ? ` on ${message.receivedDateTime.toLocaleString()}` : ''}</p>`,
  ].filter(Boolean).join('')

  const body = {
    subject: message.subject || '(No subject)',
    description: limitActivityDescription('email', isEscalationLink ? `[Linked to escalation]\n${description}` : description),
    directioncode: true,
    actualend: message.receivedDateTime ? message.receivedDateTime.toISOString() : undefined,
    ...(message.internetMessageId ? { messageid: message.internetMessageId.toLowerCase() } : {}),
    [bindName]: `/${entityPlural}(${resolvedRegardingId})`,
    email_activity_parties: parties,
  }

  const created = await dvFetch(msalInstance, '/emails', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { Prefer: 'return=representation' },
  })

  return dvFetch(msalInstance, `/emails(${created.activityid})`, {
    method: 'PATCH',
    body: JSON.stringify({
      statecode: 1,
      statuscode: 4,
      actualend: message.receivedDateTime ? message.receivedDateTime.toISOString() : undefined,
    }),
  }).then(() => created)
}

export async function createInboxAppointmentActivity(
  msalInstance,
  { event, regardingType, regardingId, regardingAccountId, contactsByEmail = {} },
) {
  if (!event) throw new Error('Calendar event is required')
  if (!regardingType || (!regardingId && !regardingAccountId)) throw new Error('A Dynamics link target is required')

  const isEscalationLink = ['escalation', 'slc_escalation', 'slc_escalations'].includes(regardingType)
  const resolvedRegardingType = isEscalationLink ? 'account' : regardingType
  const resolvedRegardingId = isEscalationLink ? regardingAccountId : regardingId
  const bindName = `regardingobjectid_${resolvedRegardingType}@odata.bind`
  const entityPlural = {
    account: 'accounts',
    opportunity: 'opportunities',
    lead: 'leads',
  }[resolvedRegardingType]
  if (!entityPlural) throw new Error(`Unsupported Dynamics link type: ${regardingType}`)
  if (!resolvedRegardingId) throw new Error(`Missing Dynamics link id for type: ${regardingType}`)

  const attendees = event.attendees ?? []
  const parties = []

  if (event.organizer?.email) {
    const organizerEmail = event.organizer.email.toLowerCase()
    const organizerContact = contactsByEmail[organizerEmail]
    if (organizerContact) {
      parties.push({ participationtypemask: 7, 'partyid_contact@odata.bind': `/contacts(${organizerContact.contactid})` })
    } else {
      parties.push({ participationtypemask: 7, addressused: event.organizer.email })
    }
  }

  for (const attendee of attendees) {
    const attendeeEmail = (attendee.email || '').toLowerCase()
    if (!attendeeEmail) continue
    const contact = contactsByEmail[attendeeEmail]
    const mask = attendee.type === 'optional' ? 6 : 5
    if (contact) {
      parties.push({ participationtypemask: mask, 'partyid_contact@odata.bind': `/contacts(${contact.contactid})` })
    } else {
      parties.push({ participationtypemask: mask, addressused: attendee.email })
    }
  }

  const start = event.start ? new Date(event.start).toISOString() : new Date().toISOString()
  const end = event.end
    ? new Date(event.end).toISOString()
    : new Date(new Date(start).getTime() + 30 * 60 * 1000).toISOString()

  const description = [
    formatPreviewHtml(event.bodyHtml || event.bodyPreview),
    `<p>Imported from calendar${event.start ? ` on ${new Date(event.start).toLocaleString()}` : ''}</p>`,
    event.location ? `<p>Location: ${formatPreviewHtml(event.location)}</p>` : '',
  ].filter(Boolean).join('')

  const body = {
    subject: event.subject || '(No subject)',
    description: limitActivityDescription('appointment', isEscalationLink ? `[Linked to escalation]\n${description}` : description),
    scheduledstart: start,
    scheduledend: end,
    [bindName]: `/${entityPlural}(${resolvedRegardingId})`,
    appointment_activity_parties: parties,
  }

  return dvFetch(msalInstance, '/appointments', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { Prefer: 'return=representation' },
  })
}

/**
 * Given an array of internetMessageId strings, returns a Set of those that
 * already exist as email activities in Dataverse and are therefore tracked.
 */
export async function checkTrackedMessageIds(msalInstance, internetMessageIds) {
  const ids = internetMessageIds.filter(Boolean).map((id) => id.toLowerCase())
  if (ids.length === 0) return new Set()
  const rows = await getEmailsByInternetMessageIds(msalInstance, ids, 'messageid')
  const found = rows.map((e) => (e.messageid || '').toLowerCase()).filter(Boolean)
  return new Set(found)
}

function chunkArray(items, size) {
  const chunks = []
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size))
  return chunks
}

export async function getEmailsByInternetMessageIds(msalInstance, internetMessageIds, select = 'activityid,messageid') {
  const ids = Array.from(new Set(internetMessageIds.filter(Boolean).map((id) => id.toLowerCase())))
  if (!ids.length) return []

  const chunks = chunkArray(ids, 20)
  const results = []
  for (const chunk of chunks) {
    const filter = chunk.map((id) => `messageid eq '${id.replace(/'/g, "''")}'`).join(' or ')
    const data = await dvFetch(
      msalInstance,
      `/emails?$filter=${encodeURIComponent(filter)}&$select=${encodeURIComponent(select)}`,
    )
    results.push(...(data?.value ?? []))
  }
  return results
}

export async function getThreadSuggestion(msalInstance, internetMessageIds) {
  const rows = await getEmailsByInternetMessageIds(
    msalInstance,
    internetMessageIds,
    'activityid,messageid,_regardingobjectid_value',
  )

  const existingByMessageId = new Map(
    rows
      .map((r) => [String(r.messageid || '').toLowerCase(), r])
      .filter(([id]) => !!id),
  )

  const counts = new Map()
  for (const row of rows) {
    const type = row['_regardingobjectid_value@Microsoft.Dynamics.CRM.lookuplogicalname']
    const id = row._regardingobjectid_value
    const name = row['_regardingobjectid_value@OData.Community.Display.V1.FormattedValue']
    if (!id || !type) continue
    if (!['account', 'opportunity', 'lead'].includes(type)) continue
    const key = `${type}:${id}`
    const current = counts.get(key) || { type, id, name: name || 'Suggested record', count: 0 }
    current.count += 1
    counts.set(key, current)
  }

  const top = [...counts.values()].sort((a, b) => b.count - a.count)[0] || null
  return {
    existingByMessageId,
    suggestion: top
      ? {
          regardingType: top.type,
          regardingId: top.id,
          label: top.name,
        }
      : null,
  }
}

export async function relinkExistingEmails(msalInstance, activityIds, { regardingType, regardingId, regardingAccountId }) {
  const isEscalationLink = ['escalation', 'slc_escalation', 'slc_escalations'].includes(regardingType)
  const resolvedRegardingType = isEscalationLink ? 'account' : regardingType
  const resolvedRegardingId = isEscalationLink ? regardingAccountId : regardingId
  const entityPlural = {
    account: 'accounts',
    opportunity: 'opportunities',
    lead: 'leads',
  }[resolvedRegardingType]
  if (!entityPlural) throw new Error(`Unsupported Dynamics link type: ${regardingType}`)
  if (!activityIds?.length) return 0
  if (!resolvedRegardingId) throw new Error(`Missing Dynamics link id for type: ${regardingType}`)

  const bindName = `regardingobjectid_${resolvedRegardingType}@odata.bind`
  await Promise.all(
    activityIds.map(async (activityId) => {
      let description
      if (isEscalationLink) {
        const existing = await dvFetch(msalInstance, `/emails(${activityId})?$select=description`).catch(() => null)
        const current = existing?.description || ''
        description = current.startsWith('[Linked to escalation]') ? current : `[Linked to escalation]\n${current}`
      }
      return dvFetch(msalInstance, `/emails(${activityId})`, {
        method: 'PATCH',
        body: JSON.stringify({
          [bindName]: `/${entityPlural}(${resolvedRegardingId})`,
          ...(isEscalationLink ? { description } : {}),
        }),
      })
    }),
  )
  return activityIds.length
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
 *   5. Via escalation   (slc_escalations regarding the account — active + resolved)
 * Returns related entity IDs plus escalation record IDs (does NOT include accountId itself).
 */
async function getAccountRelatedEntityIds(msalInstance, accountId) {
  const [opportunitiesData, contactsData, leadsData, escalationsData] = await Promise.all([
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
    dvFetch(
      msalInstance,
      `/slc_escalations?$filter=${ESCALATION_ACCOUNT_LOOKUP_FIELD} eq ${accountId}&$select=slc_escalationid&$top=50`,
    ).catch(() => null),
  ])

  const relatedIds = []
  const escalationIds = []
  const leadIds = []

  for (const opp of opportunitiesData?.value ?? []) relatedIds.push(opp.opportunityid)
  for (const c of contactsData?.value ?? []) relatedIds.push(c.contactid)
  for (const lead of leadsData?.value ?? []) { relatedIds.push(lead.leadid); leadIds.push(lead.leadid) }
  for (const escalation of escalationsData?.value ?? []) {
    const escalationId = escalation.slc_escalationid
    if (escalationId) escalationIds.push(escalationId)
  }

  return { relatedIds, escalationIds, leadIds }
}

// ─── Dynamics deep link ───────────────────────────────────────────────────────
const ENTITY_SINGULAR = { phonecalls: 'phonecall', appointments: 'appointment', emails: 'email', slc_escalations: 'slc_escalation', annotations: 'annotation', leads: 'lead', opportunities: 'opportunity', support: 'opportunity' }

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
  return (data?.value ?? []).map((r) => {
    const lookupType = r['_regardingobjectid_value@Microsoft.Dynamics.CRM.lookuplogicalname']
    return {
      ...r,
      _linkedToEscalation: lookupType === 'slc_escalation' || (r.description && r.description.startsWith('[Linked to escalation]')),
      _linkedToLead: lookupType === 'lead',
      _entityType: entity,
    }
  })
}

// Escalations are custom entities (not activities) — select only known escalation columns
const ESCALATION_SELECT = `slc_escalationid,createdon,${ESCALATION_ACCOUNT_LOOKUP_FIELD},slc_startdate,statecode,statuscode,slc_name`

function buildLookupFilter(fieldName, ids) {
  if (!ids.length) return ''
  const filter = ids.map((id) => `${fieldName} eq ${id}`).join(' or ')
  return ids.length > 1 ? `(${filter})` : filter
}

function addCreatedOnDateFilters(filterClauses, dateFrom, dateTo) {
  if (dateFrom) filterClauses.push(`createdon ge ${new Date(dateFrom).toISOString()}`)
  if (dateTo) {
    const d = new Date(dateTo)
    d.setDate(d.getDate() + 1)
    filterClauses.push(`createdon lt ${d.toISOString()}`)
  }
}

async function fetchEscalations(msalInstance, filterClauses) {
  const filterStr = filterClauses.length ? `&$filter=${filterClauses.join(' and ')}` : ''
  const data = await dvFetch(
    msalInstance,
    `/slc_escalations?$select=${ESCALATION_SELECT}${filterStr}&$orderby=createdon desc`,
    { headers: { Prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue",odata.maxpagesize=100' } },
  )
  return (data?.value ?? []).map((r) => ({
    ...r,
    slc_escalationid: r.slc_escalationid || null,
    subject: r.subject || r.slc_name || 'Escalation',
    description: r.description || '',
    slc_status: typeof r.statecode === 'number' ? r.statecode : null,
    slc_startdate: r.slc_startdate || null,
    slc_resolveddate: r.slc_resolveddate || null,
    _regardingobjectid_value: r[ESCALATION_ACCOUNT_LOOKUP_FIELD],
    '_regardingobjectid_value@OData.Community.Display.V1.FormattedValue':
      r[`${ESCALATION_ACCOUNT_LOOKUP_FIELD}@OData.Community.Display.V1.FormattedValue`],
    _entityType: 'slc_escalations',
  }))
}

// Leads (BD)
const LEAD_SELECT = 'leadid,subject,description,statuscode,statecode,createdon,_parentaccountid_value,schedulefollowup_prospect'

async function fetchLeads(msalInstance, filterClauses) {
  const filterStr = filterClauses.length ? `&$filter=${filterClauses.join(' and ')}` : ''
  const data = await dvFetch(
    msalInstance,
    `/leads?$select=${LEAD_SELECT}${filterStr}&$orderby=createdon desc&$top=50`,
    { headers: { Prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"' } },
  ).catch(() => ({ value: [] }))
  return (data?.value ?? []).map((r) => ({
    ...r,
    activityid: r.leadid,
    _entityType: 'leads',
  }))
}

// Opportunities
const OPPORTUNITY_SELECT = 'opportunityid,name,description,statuscode,statecode,estimatedvalue,estimatedclosedate,createdon,_parentaccountid_value,slc_opportunitytype'

async function fetchOpportunities(msalInstance, filterClauses, { typeFilter } = {}) {
  const filterStr = filterClauses.length ? `&$filter=${filterClauses.join(' and ')}` : ''
  const data = await dvFetch(
    msalInstance,
    `/opportunities?$select=${OPPORTUNITY_SELECT}${filterStr}&$orderby=createdon desc&$top=50`,
    { headers: { Prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"' } },
  ).catch(() => ({ value: [] }))
  return (data?.value ?? [])
    .filter((r) => {
      const oppType = (r['slc_opportunitytype@OData.Community.Display.V1.FormattedValue'] || '').toLowerCase()
      if (typeFilter === 'support') return oppType === 'renewal'
      if (typeFilter === 'opportunity') return oppType !== 'renewal'
      return true
    })
    .map((r) => {
      const oppType = (r['slc_opportunitytype@OData.Community.Display.V1.FormattedValue'] || '').toLowerCase()
      return {
        ...r,
        activityid: r.opportunityid,
        subject: r.name,
        _entityType: oppType === 'renewal' ? 'support' : 'opportunities',
      }
    })
}

// Annotations (notes)
const ANNOTATION_SELECT = 'annotationid,subject,notetext,createdon,_objectid_value,objecttypecode'

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
    _linkedToEscalation: r.objecttypecode === 'slc_escalation',
    _linkedToLead: r.objecttypecode === 'lead',
    _entityType: 'annotations',
  }))
}

/**
 * Search activities using server-side OData filters.
 * Returns [] immediately when no filters are provided (lazy-load pattern).
 * @param {{ accountIds, contactId, contactIds, activityTypes, dateFrom, dateTo }} filters
 *   accountIds: array of account GUIDs (or null/empty for no filter)
 *   activityTypes: array of type IDs (or null/empty for all types)
 */
export async function searchActivities(msalInstance, { accountIds, contactId, contactIds, activityTypes, dateFrom, dateTo }) {
  // Backwards compat: accept old single-value params
  const accountIdList = Array.isArray(accountIds) ? accountIds : (accountIds ? [accountIds] : [])
  const typeList = Array.isArray(activityTypes) ? activityTypes : (activityTypes ? [activityTypes] : [])
  const contactIdList = Array.isArray(contactIds)
    ? contactIds.filter(Boolean)
    : (contactIds ? [contactIds] : (contactId ? [contactId] : []))
  // Multi-attendee filtering is OR-based: an activity is included when ANY selected
  // attendee appears in its activity parties. AND would be overly restrictive.
  const attendeeFilterActive = contactIdList.length > 0

  if (!accountIdList.length && !contactIdList.length && !typeList.length && !dateFrom && !dateTo) return []

  const typeConfigs = typeList.length ? typeList.map((id) => ACTIVITY_TYPES.find((t) => t.id === id)).filter(Boolean) : []
  const typeEntities = new Set(typeConfigs.map((t) => t.entity))

  const wantCalls = !typeList.length || typeEntities.has('phonecalls')
  const wantAppts = !typeList.length || typeEntities.has('appointments')
  const wantEmails = !typeList.length || typeEntities.has('emails')
  const wantEscalations = !attendeeFilterActive && (!typeList.length || typeEntities.has('slc_escalations'))
  const wantLeads = !attendeeFilterActive && (!typeList.length || typeEntities.has('leads'))
  const wantOpportunities = !attendeeFilterActive && (!typeList.length || typeEntities.has('opportunities'))
  const wantSupport = !attendeeFilterActive && (!typeList.length || typeEntities.has('support'))
  const wantAnnotations = !attendeeFilterActive && (!typeList.length || typeEntities.has('annotations'))

  // Collect results from all accounts (or a single pass with no account filter)
  const accountPasses = accountIdList.length ? accountIdList : [null]
  const allResults = []

  for (const accountId of accountPasses) {
    const base = []
    const escalationBase = []
    let escalationIds = []
    let leadIds = []
    const fetches = []

    const needsRelatedIds = wantCalls || wantAppts || wantEmails || wantEscalations || wantAnnotations

    if (accountId && needsRelatedIds) {
      const related = await getAccountRelatedEntityIds(msalInstance, accountId)
      escalationIds = related.escalationIds
      leadIds = related.leadIds
      const directIds = Array.from(new Set([accountId, ...related.relatedIds])).slice(0, 50)
      const allIds = Array.from(new Set([...directIds, ...escalationIds])).slice(0, 50)
      base.push(buildLookupFilter('_regardingobjectid_value', allIds))
      escalationBase.push(buildLookupFilter(ESCALATION_ACCOUNT_LOOKUP_FIELD, directIds))
    } else if (accountId) {
      base.push(`_regardingobjectid_value eq ${accountId}`)
      escalationBase.push(`${ESCALATION_ACCOUNT_LOOKUP_FIELD} eq ${accountId}`)
    }

    addCreatedOnDateFilters(base, dateFrom, dateTo)
    addCreatedOnDateFilters(escalationBase, dateFrom, dateTo)

    if (wantCalls) {
      const clauses = [...base]
      if (contactIdList.length) clauses.push(`phonecall_activity_parties/any(p: ${buildLookupFilter('p/_partyid_value', contactIdList)})`)
      fetches.push(fetchFiltered(msalInstance, 'phonecalls', 'phonecall', clauses))
    }

    if (wantAppts) {
      const clauses = [...base]
      if (contactIdList.length) clauses.push(`appointment_activity_parties/any(p: ${buildLookupFilter('p/_partyid_value', contactIdList)})`)
      fetches.push(fetchFiltered(msalInstance, 'appointments', 'appointment', clauses))
    }

    if (wantEmails) {
      const clauses = [...base]
      if (contactIdList.length) clauses.push(`email_activity_parties/any(p: ${buildLookupFilter('p/_partyid_value', contactIdList)})`)
      fetches.push(fetchFiltered(msalInstance, 'emails', 'email', clauses))
    }

    if (wantEscalations) {
      const clauses = [...escalationBase]
      fetches.push(fetchEscalations(msalInstance, clauses))
    }

    if (wantLeads && accountId) {
      const leadClauses = [`_parentaccountid_value eq ${accountId}`]
      addCreatedOnDateFilters(leadClauses, dateFrom, dateTo)
      fetches.push(fetchLeads(msalInstance, leadClauses))
    }

    if ((wantOpportunities || wantSupport) && accountId) {
      const oppClauses = [`_parentaccountid_value eq ${accountId}`]
      addCreatedOnDateFilters(oppClauses, dateFrom, dateTo)
      const typeFilter = wantOpportunities && !wantSupport ? 'opportunity'
        : !wantOpportunities && wantSupport ? 'support'
        : undefined
      fetches.push(fetchOpportunities(msalInstance, oppClauses, { typeFilter }))
    }

    if (wantAnnotations) {
      const annotationIds = accountId ? Array.from(new Set([accountId, ...escalationIds, ...leadIds])).slice(0, 50) : []
      const annotationFilter = annotationIds.length ? [buildLookupFilter('_regardingobjectid_value', annotationIds)] : []
      addCreatedOnDateFilters(annotationFilter, dateFrom, dateTo)
      fetches.push(fetchAnnotations(msalInstance, annotationFilter))
    }

    const results = await Promise.all(fetches)
    allResults.push(...results.flat())
  }

  // Deduplicate by record ID (same record may appear for multiple accounts)
  const seen = new Set()
  const deduped = []
  for (const r of allResults) {
    const id = r._entityType === 'slc_escalations'
      ? r.slc_escalationid
      : (r.activityid || r.annotationid)
    if (id && seen.has(id)) continue
    if (id) seen.add(id)
    deduped.push(r)
  }
  deduped.sort((a, b) => new Date(b.createdon) - new Date(a.createdon))
  return deduped
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
  if (note._entityType === 'leads') return 'Lead'
  if (note._entityType === 'opportunities') return 'Opportunity'
  if (note._entityType === 'support') return 'Support'
  if (note._entityType === 'annotations') return 'Note'
  return 'Appointment'
}

export function noteDate(note) {
  if (note._entityType === 'slc_escalations') return note.slc_startdate || note.createdon
  if (note._entityType === 'leads') return note.createdon
  if (note._entityType === 'opportunities' || note._entityType === 'support') return note.createdon
  return note.scheduledstart || note.scheduledend || note.actualend || note.createdon
}
