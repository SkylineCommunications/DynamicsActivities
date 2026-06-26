/**
 * Dataverse webhook receiver — instant notification dispatcher.
 * POST /api/notify
 *
 * Called by Dataverse when a new activity is created (phonecall, appointment,
 * email, or slc_escalation). Only processes subscriptions with frequency === 'instant'.
 * Daily/weekly/monthly subscribers are handled exclusively by the digest timers.
 *
 * Spam protection: activities arriving within the cooldown window are buffered
 * in PendingInstant and flushed together in the next email.
 */
import { app } from '@azure/functions'
import { getAccount } from '../shared/dataverse.js'
import {
  listSubscriptionsByFrequency,
  queuePendingInstant,
  flushPendingInstant,
  touchLastSentAt,
  logNotification,
} from '../shared/tables.js'
import { matchSubscriptions, isInCooldown } from '../shared/subscriptions.js'
import { sendInstantEmail } from '../shared/sendgrid.js'
import { buildActionToken } from './emailActions.js'

const SUPPORTED_ENTITIES = new Set(['phonecalls', 'appointments', 'emails', 'slc_escalations'])
const DEFAULT_COOLDOWN = parseInt(process.env.INSTANT_COOLDOWN_MINUTES || '15', 10)

// Explicit map from Dataverse PrimaryEntityName to the plural collection name used in OData.
// Avoids fragile naive string + 's' pluralisation that breaks for irregular names.
const ENTITY_NAME_MAP = {
  phonecall: 'phonecalls',
  appointment: 'appointments',
  email: 'emails',
  slc_escalation: 'slc_escalations',
}

app.http('notifyWebhook', {
  methods: ['POST'],
  route: 'notify',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    // ── Validate webhook secret ───────────────────────────────────────────────
    const secret = request.headers.get('x-webhook-secret') || ''
    if (!process.env.WEBHOOK_SECRET || secret !== process.env.WEBHOOK_SECRET) {
      context.warn('notifyWebhook: invalid webhook secret')
      return { status: 401, body: 'Unauthorized' }
    }

    // ── Parse Dataverse webhook payload ───────────────────────────────────────
    let payload
    try {
      payload = await request.json()
    } catch {
      return { status: 400, body: 'Invalid JSON payload' }
    }

    // Dataverse sends entity info in the RemoteExecutionContext
    const ctx = payload?.RemoteExecutionContext ?? payload
    const entityType = ENTITY_NAME_MAP[(ctx?.PrimaryEntityName ?? '').toLowerCase()] ?? null
    const activityId = ctx?.PrimaryEntityId

    if (!SUPPORTED_ENTITIES.has(entityType) || !activityId) {
      context.log(`notifyWebhook: skipping unsupported entity type "${entityType}"`)
      return { status: 200, body: 'skipped' }
    }

    // Build a minimal activity record from the webhook payload
    const inputParams = ctx?.InputParameters ?? {}
    const target = inputParams?.Target ?? {}
    const regardingId = target?._regardingobjectid_value ?? target?.regardingobjectid_account ?? null

    const activity = {
      activityid: activityId,
      _entityType: entityType,
      _regardingobjectid_value: regardingId,
      subject: target?.subject ?? '',
      description: target?.description ?? '',
      createdon: new Date().toISOString(),
      scheduledend: target?.scheduledend ?? null,
      scheduledstart: target?.scheduledstart ?? null,
    }

    // ── Resolve account geo ───────────────────────────────────────────────────
    const account = regardingId ? await getAccount(regardingId) : null

    // ── Load instant subscriptions ────────────────────────────────────────────
    const instantSubs = await listSubscriptionsByFrequency('instant')
    const matched = matchSubscriptions(instantSubs, activity, account)

    if (matched.length === 0) {
      return { status: 200, body: 'no matches' }
    }

    // ── Per-subscription: spam guard + send ───────────────────────────────────
    await Promise.allSettled(
      matched.map(async (sub) => {
        try {
          if (isInCooldown(sub, DEFAULT_COOLDOWN)) {
            // Within cooldown window — buffer the activity
            await queuePendingInstant(sub.id, activity.activityid, activity)
            context.log(`notifyWebhook: buffered activity ${activityId} for subscription ${sub.id} (cooldown)`)
          } else {
            // Outside cooldown window — flush any pending + send
            const pending = await flushPendingInstant(sub.id)
            const activities = [...pending, activity]
            await sendInstantEmail(
              sub.userEmail,
              sub.userName,
              activities,
              sub,
              (id) => buildActionToken(sub.userId, id),
            )
            await touchLastSentAt(sub.userId, sub.id)
            await logNotification(sub.userId, sub.id, activities.map((a) => a.activityid), null)
            context.log(`notifyWebhook: sent instant email for subscription ${sub.id} (${activities.length} activities)`)
          }
        } catch (err) {
          context.error(`notifyWebhook: failed for subscription ${sub.id}:`, err)
        }
      }),
    )

    return { status: 200, body: 'ok' }
  },
})

