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

// ─── Inbox mail ───────────────────────────────────────────────────────────────
export async function getRecentInboxMessages(msalInstance, { nextLink, mailbox } = {}) {
  const token = await getGraphToken(msalInstance)

  const url =
    nextLink ||
    (() => {
      const select = [
        'id', 'subject', 'from', 'toRecipients', 'ccRecipients',
        'receivedDateTime', 'bodyPreview', 'isRead', 'hasAttachments', 'webLink',
        'internetMessageId', 'conversationId', 'conversationIndex',
      ].join(',')
      const base = mailbox
        ? `${GRAPH}/users/${encodeURIComponent(mailbox)}/mailFolders/inbox/messages`
        : `${GRAPH}/me/mailFolders/inbox/messages`
      return `${base}?$select=${select}&$orderby=receivedDateTime desc&$top=25`
    })()

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Graph inbox → ${res.status}: ${text}`)
  }
  const data = await res.json()

  return {
    messages: (data?.value ?? [])
      .filter((m) => !m['@odata.type']?.includes('eventMessage'))
      .map(normaliseMessage),
    nextLink: data?.['@odata.nextLink'] ?? null,
  }
}

export async function getConversationMessages(msalInstance, { conversationId, mailbox }) {
  if (!conversationId) return []
  const token = await getGraphToken(msalInstance)

  const select = [
    'id', 'subject', 'from', 'toRecipients', 'ccRecipients',
    'receivedDateTime', 'bodyPreview', 'isRead', 'hasAttachments', 'webLink',
    'internetMessageId', 'conversationId', 'conversationIndex',
  ].join(',')
  const base = mailbox
    ? `${GRAPH}/users/${encodeURIComponent(mailbox)}/mailFolders/inbox/messages`
    : `${GRAPH}/me/mailFolders/inbox/messages`
  const filter = encodeURIComponent(`conversationId eq '${conversationId.replace(/'/g, "''")}'`)

  const normalisePage = (messages) => messages
    .filter((m) => !m['@odata.type']?.includes('eventMessage'))
    .map(normaliseMessage)

  try {
    const filteredUrl = `${base}?$select=${select}&$filter=${filter}&$top=50`
    const filtered = await fetchMessagesPaginated(token, filteredUrl, normalisePage)
    return sortConversationMessages(filtered)
  } catch (err) {
    if (!isInefficientFilterError(err)) throw err
    const unfilteredUrl = `${base}?$select=${select}&$top=50`
    const allInboxMessages = await fetchMessagesPaginated(token, unfilteredUrl, normalisePage)
    return sortConversationMessages(
      allInboxMessages.filter((m) => m.conversationId === conversationId),
    )
  }
}

async function fetchMessagesPaginated(token, initialUrl, normalisePage) {
  let url = initialUrl
  const results = []

  while (url) {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        Prefer: 'HonorNonIndexedQueriesWarning=true',
      },
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Graph messages → ${res.status}: ${text}`)
    }
    const data = await res.json()
    results.push(...normalisePage(data?.value ?? []))
    url = data?.['@odata.nextLink'] ?? null
  }

  return results
}

function isInefficientFilterError(err) {
  const msg = String(err?.message || '')
  return msg.includes('InefficientFilter')
}

function sortConversationMessages(messages) {
  return [...messages].sort((a, b) => {
    if (a.conversationIndex && b.conversationIndex) {
      const byIndex = a.conversationIndex.localeCompare(b.conversationIndex)
      if (byIndex !== 0) return byIndex
    }

    const at = a.receivedDateTime ? a.receivedDateTime.getTime() : Number.MIN_SAFE_INTEGER
    const bt = b.receivedDateTime ? b.receivedDateTime.getTime() : Number.MIN_SAFE_INTEGER
    if (at !== bt) return at - bt

    return (a.id || '').localeCompare(b.id || '')
  })
}

function normaliseMessage(message) {
  return {
    id: message.id,
    subject: message.subject || '(No subject)',
    from: {
      name: message.from?.emailAddress?.name || '',
      email: message.from?.emailAddress?.address || '',
    },
    toRecipients: (message.toRecipients ?? []).map((r) => ({
      name: r.emailAddress?.name || '',
      email: r.emailAddress?.address || '',
    })),
    ccRecipients: (message.ccRecipients ?? []).map((r) => ({
      name: r.emailAddress?.name || '',
      email: r.emailAddress?.address || '',
    })),
    receivedDateTime: message.receivedDateTime ? new Date(message.receivedDateTime) : null,
    bodyPreview: message.bodyPreview || '',
    isRead: !!message.isRead,
    hasAttachments: !!message.hasAttachments,
    webLink: message.webLink || '',
    internetMessageId: (message.internetMessageId || '').toLowerCase(),
    conversationId: message.conversationId || '',
    conversationIndex: message.conversationIndex || '',
  }
}

// ─── People / mailbox search ─────────────────────────────────────────────────
/**
 * Search org people by name or email fragment using the Microsoft People API.
 * Returns contacts ranked by interaction frequency — shared mailboxes the user
 * regularly emails will surface here.
 * Requires People.Read scope (delegated, no admin consent needed).
 */
export async function searchPeopleMailboxes(msalInstance, query) {
  if (!query || query.trim().length < 2) return []
  try {
    const token = await getGraphToken(msalInstance)
    const q = encodeURIComponent(`"${query.trim()}"`)
    const url = `${GRAPH}/me/people?$search=${q}&$select=displayName,scoredEmailAddresses&$top=10`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.value ?? [])
      .map((p) => ({
        email: p.scoredEmailAddresses?.[0]?.address ?? '',
        label: p.displayName || '',
      }))
      .filter((p) => p.email)
  } catch {
    return []
  }
}

const MAILBOX_CACHE_KEY = 'accessibleSharedMailboxes'
const MAILBOX_CACHE_TTL = 15 * 60 * 1000 // 15 minutes

/**
 * Filter a list of mailbox candidates to only those the signed-in user can
 * actually access (Exchange FullAccess). Uses Graph Batch API to probe up to
 * 20 mailboxes per HTTP request. Results are cached in sessionStorage (15 min).
 *
 * Returns the subset of candidates that returned HTTP 200 on inbox probe.
 * Requires Mail.Read or Mail.Read.Shared scope (already present).
 */
export async function filterAccessibleMailboxes(msalInstance, candidates) {
  if (!candidates.length) return []

  // Return cached results if still fresh
  try {
    const cached = JSON.parse(sessionStorage.getItem(MAILBOX_CACHE_KEY) || 'null')
    if (cached && Date.now() - cached.ts < MAILBOX_CACHE_TTL) {
      const accessibleEmails = new Set(cached.emails)
      return candidates.filter((c) => accessibleEmails.has(c.email.toLowerCase()))
    }
  } catch { /* ignore corrupt cache */ }

  try {
    const token = await getGraphToken(msalInstance)
    const accessibleEmails = new Set()

    // Process in chunks of 20 (Graph Batch API limit)
    for (let i = 0; i < candidates.length; i += 20) {
      const chunk = candidates.slice(i, i + 20)
      const requests = chunk.map((mb, idx) => ({
        id: `${idx}`,
        method: 'GET',
        url: `/users/${encodeURIComponent(mb.email)}/mailFolders/inbox`,
      }))
      const res = await fetch(`${GRAPH}/$batch`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requests }),
      })
      if (!res.ok) continue
      const { responses } = await res.json()
      responses.forEach((r) => {
        if (r.status === 200) accessibleEmails.add(chunk[parseInt(r.id)].email.toLowerCase())
      })
    }

    sessionStorage.setItem(MAILBOX_CACHE_KEY, JSON.stringify({
      emails: [...accessibleEmails],
      ts: Date.now(),
    }))

    return candidates.filter((c) => accessibleEmails.has(c.email.toLowerCase()))
  } catch {
    // On any error fall back to showing all candidates unfiltered
    return candidates
  }
}

/**
 * Remove a mailbox address from the sessionStorage access cache.
 * Call this when a previously-trusted mailbox returns an access error at runtime.
 */
export function invalidateMailboxCache(email) {
  try {
    const cached = JSON.parse(sessionStorage.getItem(MAILBOX_CACHE_KEY) || 'null')
    if (!cached) return
    const updated = cached.emails.filter((e) => e !== email.toLowerCase())
    sessionStorage.setItem(MAILBOX_CACHE_KEY, JSON.stringify({ emails: updated, ts: cached.ts }))
  } catch { /* ignore */ }
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
