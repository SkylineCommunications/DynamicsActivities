/**
 * Email action endpoints.
 * GET  /api/actions/mark-read  - called from email link buttons (signed token, no auth required)
 * POST /api/actions/mark-read  - called from the SPA (bearer token auth)
 * POST /api/actions/follow-up  - called from the SPA or email links
 * GET  /api/actions/read-status - called by the SPA to batch-check read status
 *
 * HMAC tokens are used for email links (no user session available in email client).
 * Bearer tokens are used for SPA calls.
 */
import { app } from '@azure/functions'
import crypto from 'crypto'
import { requireAuth } from '../shared/auth.js'
import { markRead, getReadStatus, createFollowUp } from '../shared/tables.js'

const SPA_BASE = (process.env.SPA_BASE_URL || '').replace(/\/$/, '')

// ─── HMAC token helpers ───────────────────────────────────────────────────────

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

/**
 * Build a short-lived HMAC-SHA256 signed token for email action links.
 * Format: base64url( userId:activityId:expiresAt:hmac )
 */
export function buildActionToken(userId, activityId) {
  if (!process.env.ACTION_TOKEN_SECRET) return ''
  const expiresAt = Date.now() + TOKEN_TTL_MS
  const payload = `${userId}:${activityId}:${expiresAt}`
  const sig = crypto.createHmac('sha256', process.env.ACTION_TOKEN_SECRET).update(payload).digest('hex')
  return Buffer.from(`${payload}:${sig}`).toString('base64url')
}

function verifyActionToken(token) {
  if (!token || !process.env.ACTION_TOKEN_SECRET) return null
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8')
    const parts = decoded.split(':')
    if (parts.length !== 4) return null
    const [userId, activityId, expiresAt, sig] = parts
    if (Date.now() > parseInt(expiresAt, 10)) return null
    const expected = crypto
      .createHmac('sha256', process.env.ACTION_TOKEN_SECRET)
      .update(`${userId}:${activityId}:${expiresAt}`)
      .digest('hex')
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return null
    return { userId, activityId }
  } catch {
    return null
  }
}

function htmlPage(title, message, showReturnLink) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;background:#0f0f1a;color:#e2e2e9;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.card{background:#13131f;border:1px solid #2d2d3a;border-radius:12px;padding:32px 40px;max-width:360px;text-align:center}
h1{font-size:1.4rem;margin-bottom:8px}p{color:#888;font-size:.9rem;margin-bottom:20px}
a{color:#1a9fff;text-decoration:none;font-size:.875rem}</style></head>
<body><div class="card"><h1>${title}</h1><p>${message}</p>
${showReturnLink ? `<a href="${SPA_BASE}">Return to Activities →</a>` : ''}
</div></body></html>`
}

// ─── Mark as read ─────────────────────────────────────────────────────────────

app.http('actionsMarkRead', {
  methods: ['GET', 'POST'],
  route: 'actions/mark-read',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const url = new URL(request.url)
    const tokenParam = url.searchParams.get('token')
    const idParam = url.searchParams.get('id')

    // ── Email link flow (GET with signed token) ───────────────────────────────
    if (request.method === 'GET' && tokenParam) {
      const claims = verifyActionToken(tokenParam)
      if (!claims) {
        return {
          status: 400,
          headers: { 'Content-Type': 'text/html' },
          body: htmlPage('Link expired', 'This mark-as-read link has expired or is invalid.', true),
        }
      }
      const activityId = idParam || claims.activityId
      await markRead(claims.userId, activityId).catch((err) => context.warn('markRead failed:', err))
      return {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
        body: htmlPage('✓ Marked as read', 'This activity has been marked as read.', true),
      }
    }

    // ── SPA flow (POST with bearer token) ─────────────────────────────────────
    const user = await requireAuth(request).catch((e) => ({ error: e }))
    if (user.error) return { status: user.error.status || 401, body: user.error.message }

    let activityId
    try {
      const body = await request.json()
      activityId = body.activityId
    } catch {
      activityId = idParam
    }

    if (!activityId) return { status: 400, body: 'activityId is required' }
    await markRead(user.userId, activityId)
    return { status: 204 }
  },
})

// ─── Follow-up ────────────────────────────────────────────────────────────────

app.http('actionsFollowUp', {
  methods: ['POST'],
  route: 'actions/follow-up',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const url = new URL(request.url)
    const tokenParam = url.searchParams.get('token')

    let userId, activityId, actionText

    if (tokenParam) {
      // Email link flow — token provides userId + activityId
      const claims = verifyActionToken(tokenParam)
      if (!claims) return { status: 400, body: 'Invalid or expired token' }
      userId = claims.userId
      activityId = claims.activityId
      try { actionText = (await request.json())?.actionText ?? '' } catch { actionText = '' }
    } else {
      // SPA flow — bearer token
      const user = await requireAuth(request).catch((e) => ({ error: e }))
      if (user.error) return { status: user.error.status || 401, body: user.error.message }
      userId = user.userId
      try {
        const body = await request.json()
        activityId = body.activityId
        actionText = body.actionText ?? ''
      } catch {
        return { status: 400, body: 'Invalid JSON' }
      }
    }

    if (!activityId) return { status: 400, body: 'activityId is required' }

    const id = await createFollowUp(userId, activityId, actionText)
    context.log(`actionsFollowUp: created follow-up ${id} for activity ${activityId}`)
    return { status: 201, jsonBody: { id } }
  },
})

// ─── Read status ──────────────────────────────────────────────────────────────

app.http('actionsReadStatus', {
  methods: ['GET'],
  route: 'actions/read-status',
  authLevel: 'anonymous',
  handler: async (request) => {
    const user = await requireAuth(request).catch((e) => ({ error: e }))
    if (user.error) return { status: user.error.status || 401, body: user.error.message }

    const url = new URL(request.url)
    const ids = (url.searchParams.get('ids') || '').split(',').filter(Boolean)
    if (ids.length === 0) return { status: 200, jsonBody: [] }

    const readIds = await getReadStatus(user.userId, ids)
    return { status: 200, jsonBody: readIds }
  },
})

