/**
 * Azure Table Storage client helpers.
 * All table names, schemas, and helper methods are defined here.
 *
 * Tables:
 *   Subscriptions   – user notification subscriptions
 *   PendingInstant  – buffered activities during instant notification cooldown
 *   NotificationLog – sent notification records
 *   ReadReceipts    – per-user activity read status
 *   FollowUps       – user-initiated follow-up actions from digest emails
 */

import { TableClient, TableServiceClient } from '@azure/data-tables'
import { v4 as uuidv4 } from 'uuid'

const CONNECTION = process.env.AZURE_STORAGE_CONNECTION_STRING

// ─── Table names ─────────────────────────────────────────────────────────────
export const TABLES = {
  SUBSCRIPTIONS: 'Subscriptions',
  PENDING_INSTANT: 'PendingInstant',
  NOTIFICATION_LOG: 'NotificationLog',
  READ_RECEIPTS: 'ReadReceipts',
  FOLLOW_UPS: 'FollowUps',
  POLL_STATE: 'PollState',
}

// ─── Lazy table clients ───────────────────────────────────────────────────────
const clients = {}

function getClient(tableName) {
  if (!clients[tableName]) {
    clients[tableName] = TableClient.fromConnectionString(CONNECTION, tableName)
  }
  return clients[tableName]
}

/** Ensure all required tables exist (call once at Function App startup). */
export async function ensureTables() {
  const svc = TableServiceClient.fromConnectionString(CONNECTION)
  await Promise.allSettled(Object.values(TABLES).map((name) => svc.createTable(name)))
}

// ─── Subscriptions ────────────────────────────────────────────────────────────

/**
 * List all subscriptions for a given userId.
 * @returns {Array<Subscription>}
 */
export async function listSubscriptions(userId) {
  const client = getClient(TABLES.SUBSCRIPTIONS)
  const rows = []
  for await (const entity of client.listEntities({ queryOptions: { filter: `PartitionKey eq '${userId}'` } })) {
    rows.push(entityToSubscription(entity))
  }
  return rows
}

/**
 * List all subscriptions with a given frequency (across all users).
 * @param {'instant'|'daily'|'weekly'|'monthly'} frequency
 */
export async function listSubscriptionsByFrequency(frequency) {
  const client = getClient(TABLES.SUBSCRIPTIONS)
  const rows = []
  for await (const entity of client.listEntities({ queryOptions: { filter: `frequency eq '${frequency}'` } })) {
    const sub = entityToSubscription(entity)
    if (sub.enabled) rows.push(sub)
  }
  return rows
}

/** Create a new subscription. Returns the created subscription. */
export async function createSubscription(userId, data) {
  const id = uuidv4()
  const entity = {
    partitionKey: userId,
    rowKey: id,
    scopeType: data.scopeType,
    scopeValue: data.scopeValue ?? '',
    scopeLabel: data.scopeLabel ?? '',
    frequency: data.frequency,
    activityTypes: data.activityTypes ? JSON.stringify(data.activityTypes) : '',
    enabled: true,
    userEmail: data.userEmail ?? '',
    userName: data.userName ?? '',
    userId,
    createdAt: new Date().toISOString(),
    lastSentAt: '',
    cooldownMinutes: data.cooldownMinutes ?? null,
  }
  await getClient(TABLES.SUBSCRIPTIONS).createEntity(entity)
  return entityToSubscription(entity)
}

/** Update a subscription by id. Only allows updating certain fields. */
export async function updateSubscription(userId, id, patch) {
  const client = getClient(TABLES.SUBSCRIPTIONS)
  const allowed = ['frequency', 'cooldownMinutes', 'scopeType', 'scopeValue', 'scopeLabel', 'activityTypes', 'enabled']
  const update = {}
  for (const key of allowed) {
    if (patch[key] !== undefined) {
      update[key] = key === 'activityTypes' && Array.isArray(patch[key]) ? JSON.stringify(patch[key]) : patch[key]
    }
  }
  try {
    await client.updateEntity({ partitionKey: userId, rowKey: id, ...update }, 'Merge')
  } catch (e) {
    if (e.statusCode === 404) {
      const err = new Error('Subscription not found')
      err.status = 404
      throw err
    }
    throw e
  }
  return { id, ...update }
}

/** Delete a subscription by id. */
export async function deleteSubscription(userId, id) {
  try {
    await getClient(TABLES.SUBSCRIPTIONS).deleteEntity(userId, id)
  } catch (e) {
    if (e.statusCode === 404) {
      const err = new Error('Subscription not found')
      err.status = 404
      throw err
    }
    throw e
  }
}

/** Update lastSentAt on a subscription. */
export async function touchLastSentAt(userId, id) {
  await getClient(TABLES.SUBSCRIPTIONS).updateEntity(
    { partitionKey: userId, rowKey: id, lastSentAt: new Date().toISOString() },
    'Merge',
  )
}

function entityToSubscription(e) {
  let activityTypes = null
  if (e.activityTypes) {
    try { activityTypes = JSON.parse(e.activityTypes) } catch { activityTypes = null }
  }
  return {
    id: e.rowKey,
    userId: e.userId ?? e.partitionKey,
    scopeType: e.scopeType,
    scopeValue: e.scopeValue,
    scopeLabel: e.scopeLabel,
    frequency: e.frequency,
    activityTypes,
    enabled: e.enabled !== false,
    userEmail: e.userEmail,
    userName: e.userName,
    createdAt: e.createdAt,
    lastSentAt: e.lastSentAt || null,
    cooldownMinutes: e.cooldownMinutes ?? null,
  }
}

// ─── PendingInstant ───────────────────────────────────────────────────────────

/** Queue an activity in the PendingInstant buffer for a subscription. */
export async function queuePendingInstant(subscriptionId, activityId, activityPayload) {
  const id = uuidv4()
  await getClient(TABLES.PENDING_INSTANT).createEntity({
    partitionKey: subscriptionId,
    rowKey: id,
    subscriptionId,
    activityId,
    activityPayload: JSON.stringify(activityPayload),
    queuedAt: new Date().toISOString(),
  })
}

/** Fetch and delete all pending activities for a subscription. Returns array of activity payloads. */
export async function flushPendingInstant(subscriptionId) {
  const client = getClient(TABLES.PENDING_INSTANT)
  const rows = []
  for await (const entity of client.listEntities({ queryOptions: { filter: `PartitionKey eq '${subscriptionId}'` } })) {
    rows.push({ rowKey: entity.rowKey, payload: JSON.parse(entity.activityPayload) })
  }
  // Delete all flushed rows
  await Promise.allSettled(rows.map((r) => client.deleteEntity(subscriptionId, r.rowKey)))
  return rows.map((r) => r.payload)
}

// ─── NotificationLog ──────────────────────────────────────────────────────────

/** Write a notification log entry. */
export async function logNotification(userId, subscriptionId, activityIds, summaryText) {
  await getClient(TABLES.NOTIFICATION_LOG).createEntity({
    partitionKey: userId,
    rowKey: uuidv4(),
    subscriptionId,
    activityIds: JSON.stringify(activityIds),
    sentAt: new Date().toISOString(),
    summaryText: summaryText ?? '',
  })
}

// ─── ReadReceipts ──────────────────────────────────────────────────────────────

/** Mark an activity as read for a user. */
export async function markRead(userId, activityId) {
  await getClient(TABLES.READ_RECEIPTS).upsertEntity({
    partitionKey: userId,
    rowKey: activityId,
    activityId,
    userId,
    readAt: new Date().toISOString(),
  }, 'Replace')
}

/**
 * Return the subset of activityIds that the user has read.
 * @param {string} userId
 * @param {string[]} activityIds
 * @returns {string[]} read activity IDs
 */
export async function getReadStatus(userId, activityIds) {
  if (!activityIds?.length) return []
  const client = getClient(TABLES.READ_RECEIPTS)
  const readIds = []
  await Promise.allSettled(
    activityIds.map(async (id) => {
      try {
        await client.getEntity(userId, id)
        readIds.push(id)
      } catch {
        // not found = not read
      }
    }),
  )
  return readIds
}

// ─── FollowUps ────────────────────────────────────────────────────────────────

/** Create a follow-up action record. */
export async function createFollowUp(userId, activityId, actionText) {
  const id = uuidv4()
  await getClient(TABLES.FOLLOW_UPS).createEntity({
    partitionKey: userId,
    rowKey: id,
    activityId,
    userId,
    actionText,
    createdAt: new Date().toISOString(),
  })
  return id
}

// ─── PollState ────────────────────────────────────────────────────────────────

/** Get the last poll timestamp for a given poll key (e.g. 'instant'). */
export async function getLastPollTimestamp(key) {
  try {
    const entity = await getClient(TABLES.POLL_STATE).getEntity('poll', key)
    return entity.lastPollAt ?? null
  } catch {
    return null
  }
}

/** Set the last poll timestamp for a given poll key. */
export async function setLastPollTimestamp(key, ts) {
  await getClient(TABLES.POLL_STATE).upsertEntity({
    partitionKey: 'poll',
    rowKey: key,
    lastPollAt: ts,
  }, 'Replace')
}
