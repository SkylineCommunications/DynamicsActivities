/**
 * Shared digest logic for daily/weekly/monthly timer functions.
 */
import { listSubscriptionsByFrequency, touchLastSentAt, logNotification } from '../shared/tables.js'
import { fetchActivitiesSince, getAccount } from '../shared/dataverse.js'
import { activityMatchesSubscription } from '../shared/subscriptions.js'
import { generateSummary } from '../shared/openai.js'
import { sendDigestEmail } from '../shared/sendgrid.js'
import { buildActionToken } from './emailActions.js'

/**
 * Run the digest for a given frequency and lookback window.
 * Only sends to subscriptions with matching frequency — never to instant subscribers.
 *
 * @param {'daily'|'weekly'|'monthly'} frequency
 * @param {number} lookbackDays
 * @param {object} context - Azure Functions context for logging
 */
export async function runDigest(frequency, lookbackDays, context) {
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString()

  const subs = await listSubscriptionsByFrequency(frequency)
  if (subs.length === 0) {
    context.log(`${frequency} digest: no subscriptions, skipping`)
    return
  }

  // Group by userId to minimise Dataverse queries
  const byUser = new Map()
  for (const sub of subs) {
    if (!byUser.has(sub.userId)) byUser.set(sub.userId, [])
    byUser.get(sub.userId).push(sub)
  }

  // Account cache to avoid re-fetching the same account multiple times
  const accountCache = new Map()
  async function getCachedAccount(id) {
    if (!id) return null
    if (!accountCache.has(id)) accountCache.set(id, await getAccount(id).catch(() => null))
    return accountCache.get(id)
  }

  await Promise.allSettled(
    [...byUser.entries()].map(async ([userId, userSubs]) => {
      try {
        // Collect unique regarding IDs across all this user's subscriptions
        // For account-scope subs we know the exact ID; for geo/escalation we fetch broadly
        const accountScopeIds = userSubs
          .filter((s) => s.scopeType === 'account')
          .map((s) => s.scopeValue)
          .filter(Boolean)

        const hasGeoOrEscalation = userSubs.some((s) => ['country', 'region', 'escalation'].includes(s.scopeType))

        // For geo/escalation subscriptions we can't pre-filter by account GUID,
        // so we fetch recent activities without a regarding filter and post-filter.
        // For account-only subscribers we fetch only their specific accounts.
        let activities = []

        if (hasGeoOrEscalation) {
          // Broad fetch: all activity types, filtered only by date
          activities = await fetchActivitiesSince([], since)
        } else if (accountScopeIds.length > 0) {
          activities = await fetchActivitiesSince(accountScopeIds, since)
        }

        if (activities.length === 0) {
          context.log(`${frequency} digest: no activities for user ${userId}, skipping`)
          return
        }

        // Pre-resolve accounts for geo matching
        const uniqueRegardingIds = [...new Set(activities.map((a) => a._regardingobjectid_value).filter(Boolean))]
        await Promise.allSettled(uniqueRegardingIds.map((id) => getCachedAccount(id)))

        // Process each subscription independently
        for (const sub of userSubs) {
          try {
            const subActivities = activities.filter((a) => {
              const account = accountCache.get(a._regardingobjectid_value) ?? null
              return activityMatchesSubscription(a, account, sub)
            })

            if (subActivities.length === 0) continue // skip empty digests

            const summary = await generateSummary(subActivities, sub.scopeLabel || sub.scopeType)

            await sendDigestEmail(
              sub.userEmail,
              sub.userName,
              subActivities,
              sub,
              summary,
              (id) => buildActionToken(userId, id),
            )

            await touchLastSentAt(userId, sub.id)
            await logNotification(userId, sub.id, subActivities.map((a) => a.activityid), summary)

            context.log(`${frequency} digest: sent to ${sub.userEmail} for sub ${sub.id} (${subActivities.length} activities)`)
          } catch (subErr) {
            context.error(`${frequency} digest: failed for sub ${sub.id}:`, subErr)
          }
        }
      } catch (userErr) {
        context.error(`${frequency} digest: failed for user ${userId}:`, userErr)
      }
    }),
  )
}
