/**
 * Subscription matching logic.
 * Determines which subscriptions match a given activity.
 */

/**
 * Test whether an activity matches a subscription's scope.
 *
 * @param {object} activity  - Dataverse activity record (includes _entityType, _regardingobjectid_value)
 * @param {object} account   - Account record (address1_country, address1_stateorprovince) or null
 * @param {object} sub       - Subscription record (scopeType, scopeValue)
 * @returns {boolean}
 */
export function activityMatchesSubscription(activity, account, sub) {
  switch (sub.scopeType) {
    case 'account':
      return activity._regardingobjectid_value === sub.scopeValue

    case 'country':
      return (
        !!account?.address1_country &&
        account.address1_country.trim().toLowerCase() === sub.scopeValue.trim().toLowerCase()
      )

    case 'region':
      return (
        !!account?.address1_stateorprovince &&
        account.address1_stateorprovince.trim().toLowerCase() === sub.scopeValue.trim().toLowerCase()
      )

    case 'escalation':
      return activity._entityType === 'slc_escalations'

    default:
      return false
  }
}

/**
 * Filter a list of subscriptions to those matching an activity.
 *
 * @param {object[]} subscriptions
 * @param {object}   activity
 * @param {object|null} account
 * @returns {object[]} matched subscriptions
 */
export function matchSubscriptions(subscriptions, activity, account) {
  return subscriptions.filter((sub) => activityMatchesSubscription(activity, account, sub))
}

/**
 * Determine whether a subscription is within its cooldown window.
 * @param {object} sub - subscription with lastSentAt and optional cooldownMinutes
 * @param {number} [defaultCooldownMinutes=15]
 * @returns {boolean} true if still in cooldown
 */
export function isInCooldown(sub, defaultCooldownMinutes = 15) {
  if (!sub.lastSentAt) return false
  const cooldown = (sub.cooldownMinutes ?? defaultCooldownMinutes) * 60 * 1000
  return Date.now() - new Date(sub.lastSentAt).getTime() < cooldown
}
