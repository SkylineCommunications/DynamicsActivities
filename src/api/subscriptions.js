/**
 * Client for the Azure Functions subscriptions API.
 * Uses the same MSAL token pattern as the Dataverse client.
 */

import { getDvToken } from './dataverse'

const BASE = (import.meta.env.VITE_FUNCTIONS_BASE_URL || '').replace(/\/$/, '')

async function apiFetch(msalInstance, path, options = {}) {
  const token = await getDvToken(msalInstance)
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Subscriptions API ${options.method || 'GET'} ${path} → ${res.status}: ${text}`)
  }
  if (res.status === 204) return null
  
  const contentType = res.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    const text = await res.text()
    throw new Error(`Subscriptions API returned non-JSON response (${res.status}): ${text.slice(0, 100)}`)
  }
  return res.json()
}

export async function getSubscriptions(msalInstance) {
  return apiFetch(msalInstance, '/subscriptions')
}

export async function createSubscription(msalInstance, payload) {
  return apiFetch(msalInstance, '/subscriptions', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateSubscription(msalInstance, id, patch) {
  return apiFetch(msalInstance, `/subscriptions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  })
}

export async function deleteSubscription(msalInstance, id) {
  return apiFetch(msalInstance, `/subscriptions/${id}`, { method: 'DELETE' })
}

/** Fetch read status for a list of activity IDs. Returns array of read activity IDs. */
export async function getReadStatus(msalInstance, activityIds) {
  if (!activityIds?.length) return []
  const ids = activityIds.join(',')
  return apiFetch(msalInstance, `/actions/read-status?ids=${encodeURIComponent(ids)}`)
}

/** Mark an activity as read using a direct API call (requires auth, not email token). */
export async function markActivityRead(msalInstance, activityId) {
  return apiFetch(msalInstance, `/actions/mark-read`, {
    method: 'POST',
    body: JSON.stringify({ activityId }),
  })
}
