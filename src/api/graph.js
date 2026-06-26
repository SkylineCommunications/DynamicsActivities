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
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
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
