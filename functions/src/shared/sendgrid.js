/**
 * SendGrid email integration.
 * Provides helpers for building and sending notification emails.
 */

import sgMail from '@sendgrid/mail'

const SENDGRID_CONFIGURED =
  process.env.SENDGRID_API_KEY && !process.env.SENDGRID_API_KEY.startsWith('<')

if (SENDGRID_CONFIGURED) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY)
}

const FROM = {
  email: process.env.SENDGRID_FROM_EMAIL,
  name: process.env.SENDGRID_FROM_NAME || 'Skyline Activities',
}
const SPA_BASE = (process.env.SPA_BASE_URL || '').replace(/\/$/, '')

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleString('en-GB', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function activityDate(a) {
  return a.scheduledstart || a.scheduledend || a.actualend || a.createdon
}

function entityTypeLabel(entityType) {
  if (entityType === 'phonecalls') return '📞 Phone Call'
  if (entityType === 'appointments') return '📅 Appointment'
  if (entityType === 'slc_escalations') return '🚨 Escalation'
  return '✉️ Email'
}

function entityTypeColor(entityType) {
  if (entityType === 'phonecalls') return '#4ade80'
  if (entityType === 'appointments') return '#60a5fa'
  if (entityType === 'slc_escalations') return '#f87171'
  return '#fb923c'
}

function activityCard(activity, { actionToken } = {}) {
  const accountName =
    activity['_regardingobjectid_value@OData.Community.Display.V1.FormattedValue'] || 'Unknown Account'
  const date = fmtDate(activityDate(activity))
  const desc = (activity.description || '').slice(0, 300) + (activity.description?.length > 300 ? '…' : '')
  const color = entityTypeColor(activity._entityType)
  const label = entityTypeLabel(activity._entityType)

  const viewUrl = `${SPA_BASE}?activity=${activity.activityid}`
  const markReadUrl = actionToken
    ? `${process.env.FUNCTIONS_BASE_URL || ''}/actions/mark-read?token=${actionToken}&id=${activity.activityid}`
    : null
  const followUpUrl = `${SPA_BASE}?followup=${activity.activityid}`

  return `
  <div style="border:1px solid #2d2d3a;border-radius:8px;padding:16px;margin-bottom:12px;background:#1a1a27;">
    <div style="margin-bottom:8px;">
      <span style="background:${color}22;color:${color};padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600;">${label}</span>
      <span style="color:#888;font-size:12px;margin-left:12px;">${date}</span>
    </div>
    <div style="font-weight:600;color:#e2e2e9;margin-bottom:4px;">🏢 ${accountName}</div>
    ${desc ? `<div style="color:#aaa;font-size:13px;margin-bottom:12px;white-space:pre-wrap;">${desc}</div>` : ''}
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <a href="${viewUrl}" style="color:#7c6af7;font-size:12px;text-decoration:none;border:1px solid #7c6af7;padding:4px 12px;border-radius:6px;">View in app ↗</a>
      ${markReadUrl ? `<a href="${markReadUrl}" style="color:#4ade80;font-size:12px;text-decoration:none;border:1px solid #4ade80;padding:4px 12px;border-radius:6px;">✓ Mark as read</a>` : ''}
      <a href="${followUpUrl}" style="color:#60a5fa;font-size:12px;text-decoration:none;border:1px solid #60a5fa;padding:4px 12px;border-radius:6px;">+ Follow-up</a>
    </div>
  </div>`
}

function emailWrapper(title, subtitle, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f0f1a;font-family:Inter,system-ui,sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#13131f;border-radius:12px;overflow:hidden;border:1px solid #2d2d3a;">
    <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);padding:24px 32px;border-bottom:1px solid #2d2d3a;">
      <div style="font-size:20px;font-weight:700;color:#e2e2e9;">⚡ ${title}</div>
      ${subtitle ? `<div style="color:#888;font-size:13px;margin-top:4px;">${subtitle}</div>` : ''}
    </div>
    <div style="padding:24px 32px;">
      ${bodyHtml}
    </div>
    <div style="padding:16px 32px;border-top:1px solid #2d2d3a;font-size:11px;color:#555;text-align:center;">
      You are receiving this because you subscribed to activity notifications in Skyline Activities.
      <br><a href="${SPA_BASE}?tab=subscriptions" style="color:#7c6af7;">Manage subscriptions</a>
    </div>
  </div>
</body>
</html>`
}

// ─── Public send functions ───────────────────────────────────────────────────

/**
 * Send an instant notification email for one or more activities.
 * @param {string} toEmail
 * @param {string} toName
 * @param {object[]} activities - one or more activity records (may be batched due to cooldown)
 * @param {object} sub - subscription record (for scope label)
 * @param {Function} [tokenForActivity] - optional fn(activityId) => signed token
 */
export async function sendInstantEmail(toEmail, toName, activities, sub, tokenForActivity) {
  const count = activities.length
  const scopeLabel = sub.scopeLabel || 'your subscription'
  const subject =
    count === 1
      ? `New ${entityTypeLabel(activities[0]._entityType).replace(/^[^\s]+ /, '')} logged — ${activities[0]['_regardingobjectid_value@OData.Community.Display.V1.FormattedValue'] || scopeLabel}`
      : `${count} new activities — ${scopeLabel}`

  const cardsHtml = activities
    .map((a) => activityCard(a, { actionToken: tokenForActivity?.(a.activityid) }))
    .join('')

  const html = emailWrapper(
    'New Activity Alert',
    `Scope: ${scopeLabel}`,
    cardsHtml,
  )

  if (!SENDGRID_CONFIGURED) {
    console.log(`[sendgrid] No API key — skipping instant email to ${toEmail}. Subject: ${subject}`)
    return
  }
  await sgMail.send({ to: { email: toEmail, name: toName }, from: FROM, subject, html })
  console.log(`[sendgrid] Instant email sent to ${toEmail} — ${subject}`)
}

/**
 * @param {string} toEmail
 * @param {string} toName
 * @param {object[]} activities
 * @param {object} sub
 * @param {string} summaryText - AI-generated summary (or rule-based fallback)
 * @param {Function} [tokenForActivity] - optional fn(activityId) => signed token
 */
export async function sendDigestEmail(toEmail, toName, activities, sub, summaryText, tokenForActivity) {
  const scopeLabel = sub.scopeLabel || 'your subscription'
  const freqLabel = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' }[sub.frequency] || 'Digest'
  const subject = `${freqLabel} digest — ${scopeLabel} (${activities.length} activities)`

  const summaryHtml = summaryText
    ? `<div style="background:#1e1e30;border-left:3px solid #7c6af7;padding:16px;border-radius:0 8px 8px 0;margin-bottom:20px;color:#c8c8d8;font-size:14px;line-height:1.6;">${summaryText}</div>`
    : ''

  const cardsHtml = activities
    .map((a) => activityCard(a, { actionToken: tokenForActivity?.(a.activityid) }))
    .join('')

  const html = emailWrapper(
    `${freqLabel} Digest`,
    `${activities.length} activities · ${scopeLabel}`,
    `${summaryHtml}
     <div style="font-size:12px;color:#666;margin-bottom:12px;text-transform:uppercase;letter-spacing:0.05em;">Raw Activities</div>
     ${cardsHtml}`,
  )

  if (!SENDGRID_CONFIGURED) {
    console.log(`[sendgrid] No API key — skipping digest email to ${toEmail}. Subject: ${subject}`)
    return
  }
  await sgMail.send({ to: { email: toEmail, name: toName }, from: FROM, subject, html })
  console.log(`[sendgrid] Digest email sent to ${toEmail} — ${subject}`)
}
