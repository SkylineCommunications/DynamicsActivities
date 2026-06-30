/**
 * Instant notification poller — runs every 5 minutes.
 * Checks for new activities since the last poll and sends instant emails
 * to matching subscribers.
 *
 * This is the polling fallback for instant notifications — no Dataverse webhook
 * registration required. Activities are matched against instant subscriptions
 * using the same logic as the webhook handler.
 */
import { app } from '@azure/functions'
import { fetchActivitiesSince, getAccount } from '../shared/dataverse.js'
import {
  listSubscriptionsByFrequency,
  touchLastSentAt,
  logNotification,
  getLastPollTimestamp,
  setLastPollTimestamp,
} from '../shared/tables.js'
import { activityMatchesSubscription, isInCooldown } from '../shared/subscriptions.js'
import { sendInstantEmail } from '../shared/sendgrid.js'
import { buildActionToken } from './emailActions.js'

const POLL_INTERVAL_MINUTES = 5
const DEFAULT_COOLDOWN = parseInt(process.env.INSTANT_COOLDOWN_MINUTES || '15', 10)

app.timer('instantPoller', {
  // Every 5 minutes
  schedule: '*/5 * * * *',
  handler: async (timer, context) => {
    context.log('instantPoller: starting')

    // ── Load instant subscriptions ──────────────────────────────────────────
    const subs = await listSubscriptionsByFrequency('instant')
    if (subs.length === 0) {
      context.log('instantPoller: no instant subscriptions, skipping')
      return
    }

    // ── Determine polling window ────────────────────────────────────────────
    const lastPoll = await getLastPollTimestamp('instant')
    const since = lastPoll || new Date(Date.now() - POLL_INTERVAL_MINUTES * 60 * 1000).toISOString()

    // Update poll timestamp immediately (so concurrent runs don't double-send)
    await setLastPollTimestamp('instant', new Date().toISOString())

    // ── Fetch recent activities ─────────────────────────────────────────────
    // Collect account-scope IDs for targeted fetch, plus broad fetch for geo/escalation
    const accountScopeIds = [...new Set(
      subs.filter((s) => s.scopeType === 'account').map((s) => s.scopeValue).filter(Boolean),
    )]
    const hasGeoOrEscalation = subs.some((s) => ['country', 'region', 'escalation'].includes(s.scopeType))

    let activities = []
    if (hasGeoOrEscalation) {
      activities = await fetchActivitiesSince([], since)
    } else if (accountScopeIds.length > 0) {
      activities = await fetchActivitiesSince(accountScopeIds, since)
    }

    if (activities.length === 0) {
      context.log('instantPoller: no new activities since ' + since)
      return
    }

    context.log(`instantPoller: found ${activities.length} activities since ${since}`)

    // ── Resolve accounts for geo matching ───────────────────────────────────
    const accountCache = new Map()
    async function getCachedAccount(id) {
      if (!id) return null
      if (!accountCache.has(id)) accountCache.set(id, await getAccount(id).catch(() => null))
      return accountCache.get(id)
    }

    const uniqueRegardingIds = [...new Set(activities.map((a) => a._regardingobjectid_value).filter(Boolean))]
    await Promise.allSettled(uniqueRegardingIds.map((id) => getCachedAccount(id)))

    // ── Match and send per subscription ─────────────────────────────────────
    const sent = []
    await Promise.allSettled(
      subs.map(async (sub) => {
        try {
          // Filter activities matching this subscription
          const matched = activities.filter((a) => {
            const account = accountCache.get(a._regardingobjectid_value) ?? null
            return activityMatchesSubscription(a, account, sub)
          })

          if (matched.length === 0) return

          // Cooldown check
          if (isInCooldown(sub, DEFAULT_COOLDOWN)) {
            context.log(`instantPoller: sub ${sub.id} in cooldown, skipping`)
            return
          }

          await sendInstantEmail(
            sub.userEmail,
            sub.userName,
            matched,
            sub,
            (id) => buildActionToken(sub.userId, id),
          )
          await touchLastSentAt(sub.userId, sub.id)
          await logNotification(sub.userId, sub.id, matched.map((a) => a.activityid), null)
          sent.push(sub.id)
          context.log(`instantPoller: sent to ${sub.userEmail} for sub ${sub.id} (${matched.length} activities)`)
        } catch (err) {
          context.error(`instantPoller: failed for sub ${sub.id}:`, err)
        }
      }),
    )

    context.log(`instantPoller: done, sent ${sent.length} emails`)
  },
})
