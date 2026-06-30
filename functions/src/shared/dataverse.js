/**
 * Dataverse Web API v9.2 client for Azure Functions.
 * Uses app-registration client credentials (not user tokens) for background operations
 * such as webhook processing and digest generation.
 */

const BASE_URL = (process.env.DATAVERSE_URL || '').replace(/\/$/, '')
const API = `${BASE_URL}/api/data/v9.2`

const DV_HEADERS = {
  Accept: 'application/json',
  'Content-Type': 'application/json',
  'OData-MaxVersion': '4.0',
  'OData-Version': '4.0',
  Prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue",odata.maxpagesize=100',
}

let _tokenCache = null

async function getAppToken() {
  const now = Date.now()
  if (_tokenCache && _tokenCache.expiresAt > now + 60_000) return _tokenCache.token

  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.DATAVERSE_CLIENT_ID,
    client_secret: process.env.DATAVERSE_CLIENT_SECRET,
    scope: `${BASE_URL}/.default`,
  })
  const res = await fetch(
    `https://login.microsoftonline.com/${process.env.DATAVERSE_TENANT_ID}/oauth2/v2.0/token`,
    { method: 'POST', body: params },
  )
  if (!res.ok) throw new Error('Failed to acquire Dataverse app token: ' + (await res.text()))
  const data = await res.json()
  _tokenCache = { token: data.access_token, expiresAt: now + data.expires_in * 1000 }
  return _tokenCache.token
}

export async function dvFetch(path, options = {}) {
  const token = await getAppToken()
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

/**
 * Fetch a single account record including geo fields.
 * @returns {{ accountid, name, address1_country, address1_stateorprovince }}
 */
export async function getAccount(accountId) {
  if (!accountId) return null
  return dvFetch(
    `/accounts(${accountId})?$select=accountid,name,address1_country,address1_stateorprovince`,
  ).catch(() => null)
}

/**
 * Fetch activities since a given ISO date string for one or more regarding object IDs.
 * Returns activities from all entity tables (phonecalls, appointments, emails, slc_escalations, annotations).
 * @param {string[]} regardingIds - account or related entity GUIDs
 * @param {string} since - ISO date string
 * @returns {Array} combined, date-sorted activity records
 */
export async function fetchActivitiesSince(regardingIds, since) {
  const SELECT = 'activityid,subject,description,createdon,scheduledend,scheduledstart,actualend,_regardingobjectid_value'
  const ANNOTATION_SELECT = 'annotationid,subject,notetext,createdon,_objectid_value,objecttypecode'
  const dateFilter = `createdon ge ${new Date(since).toISOString()}`

  // Activity entities (use _regardingobjectid_value)
  let activityFilter
  if (regardingIds?.length) {
    const regardingFilter = regardingIds
      .map((id) => `_regardingobjectid_value eq ${id}`)
      .join(' or ')
    activityFilter = `(${regardingFilter}) and ${dateFilter}`
  } else {
    activityFilter = dateFilter
  }

  // Annotation entities (use _objectid_value instead)
  let annotationFilter
  if (regardingIds?.length) {
    const objectFilter = regardingIds
      .map((id) => `_objectid_value eq ${id}`)
      .join(' or ')
    annotationFilter = `(${objectFilter}) and ${dateFilter}`
  } else {
    annotationFilter = dateFilter
  }

  const activityEntities = ['phonecalls', 'appointments', 'emails', 'slc_escalations']
  const activityResults = await Promise.allSettled(
    activityEntities.map((e) =>
      dvFetch(`/${e}?$select=${SELECT}&$filter=${activityFilter}&$orderby=createdon desc`).then(
        (d) => (d?.value ?? []).map((r) => ({ ...r, _entityType: e })),
      ),
    ),
  )

  // Annotations — map fields to match the common activity shape
  const annotationResult = await dvFetch(
    `/annotations?$select=${ANNOTATION_SELECT}&$filter=${annotationFilter}&$orderby=createdon desc`,
  ).then((d) => (d?.value ?? []).map((r) => ({
    activityid: r.annotationid,
    subject: r.subject || 'Note',
    description: r.notetext ?? '',
    createdon: r.createdon,
    _regardingobjectid_value: r._objectid_value,
    _entityType: 'annotations',
  }))).catch(() => [])

  const all = [
    ...activityResults.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])),
    ...annotationResult,
  ]
  all.sort((a, b) => new Date(b.createdon) - new Date(a.createdon))
  return all
}

/**
 * Create a Dynamics Task activity as a follow-up for a given activity.
 */
export async function createFollowUpTask(regardingId, regardingEntityType, subject, description, ownerId) {
  const body = {
    subject,
    description,
    scheduledend: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    [`regardingobjectid_${regardingEntityType.replace(/s$/, '')}@odata.bind`]: `/${regardingEntityType}(${regardingId})`,
  }
  if (ownerId) {
    body['ownerid@odata.bind'] = `/systemusers(${ownerId})`
  }
  return dvFetch('/tasks', { method: 'POST', body: JSON.stringify(body), headers: { Prefer: 'return=representation' } })
}
