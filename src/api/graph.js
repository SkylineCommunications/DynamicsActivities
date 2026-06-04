import { InteractionRequiredAuthError } from '@azure/msal-browser'
import { graphRequest } from '../authConfig'

const GRAPH = 'https://graph.microsoft.com/v1.0'

async function getGraphToken(msalInstance) {
  const account = msalInstance.getAllAccounts()[0]
  if (!account) throw new Error('Not authenticated')
  try {
    const r = await msalInstance.acquireTokenSilent({ ...graphRequest, account })
    return r.accessToken
  } catch (e) {
    if (e instanceof InteractionRequiredAuthError) {
      const r = await msalInstance.acquireTokenPopup({ ...graphRequest, account })
      return r.accessToken
    }
    throw e
  }
}

async function graphGet(msalInstance, path) {
  const token = await getGraphToken(msalInstance)
  const res = await fetch(`${GRAPH}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Graph GET ${path} → ${res.status}: ${text}`)
  }
  return res.json()
}

// ─── Calendar events ──────────────────────────────────────────────────────────
// Returns non-all-day events: 60 days past + 30 days future, sorted newest first
export async function getRecentCalendarEvents(msalInstance) {
  const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
  const until = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  const select = 'id,subject,start,end,attendees,bodyPreview,location,organizer,isAllDay'
  const filter = encodeURIComponent(
    `start/dateTime ge '${since}' and start/dateTime le '${until}' and isAllDay eq false`,
  )
  const data = await graphGet(
    msalInstance,
    `/me/events?$select=${select}&$filter=${filter}&$orderby=start/dateTime desc&$top=50`,
  )
  return (data?.value ?? []).map(normaliseEvent)
}

function normaliseEvent(e) {
  return {
    id: e.id,
    subject: e.subject || '(No subject)',
    start: e.start?.dateTime ? new Date(e.start.dateTime + (e.start.timeZone === 'UTC' ? 'Z' : '')) : null,
    end: e.end?.dateTime ? new Date(e.end.dateTime + (e.end.timeZone === 'UTC' ? 'Z' : '')) : null,
    location: e.location?.displayName || '',
    bodyPreview: e.bodyPreview || '',
    attendees: (e.attendees || [])
      .filter((a) => a.type !== 'resource')
      .map((a) => ({
        name: a.emailAddress?.name || a.emailAddress?.address || '',
        email: a.emailAddress?.address || '',
        type: a.type || 'required',
      })),
    organizer: {
      name: e.organizer?.emailAddress?.name || '',
      email: e.organizer?.emailAddress?.address || '',
    },
  }
}
