import { app } from '@azure/functions'
import { requireAuth } from '../shared/auth.js'
import { withCors, preflight } from '../shared/cors.js'
import {
  listSubscriptions,
  createSubscription,
  updateSubscription,
  deleteSubscription,
} from '../shared/tables.js'

preflight('subscriptionsPreflight', 'subscriptions')
preflight('subscriptionsByIdPreflight', 'subscriptions/{id}')

app.http('subscriptionsGet', {
  methods: ['GET'],
  route: 'subscriptions',
  authLevel: 'anonymous',
  handler: withCors(async (request) => {
    const user = await requireAuth(request).catch((e) => ({ error: e }))
    if (user.error) return { status: user.error.status || 401, body: user.error.message }
    const subs = await listSubscriptions(user.userId)
    return { status: 200, jsonBody: subs }
  }),
})

const VALID_SCOPE_TYPES = ['account', 'country', 'region', 'escalation']
const VALID_FREQUENCIES = ['instant', 'daily', 'weekly', 'monthly']

app.http('subscriptionsPost', {
  methods: ['POST'],
  route: 'subscriptions',
  authLevel: 'anonymous',
  handler: withCors(async (request) => {
    const user = await requireAuth(request).catch((e) => ({ error: e }))
    if (user.error) return { status: user.error.status || 401, body: user.error.message }
    const body = await request.json()
    if (!body.scopeType || !VALID_SCOPE_TYPES.includes(body.scopeType)) {
      return { status: 400, jsonBody: { error: `scopeType is required and must be one of: ${VALID_SCOPE_TYPES.join(', ')}` } }
    }
    if (!body.frequency || !VALID_FREQUENCIES.includes(body.frequency)) {
      return { status: 400, jsonBody: { error: `frequency is required and must be one of: ${VALID_FREQUENCIES.join(', ')}` } }
    }
    if (body.scopeType !== 'escalation' && !body.scopeValue) {
      return { status: 400, jsonBody: { error: 'scopeValue is required for account, country, and region subscriptions' } }
    }
    const sub = await createSubscription(user.userId, { ...body, userEmail: user.email, userName: user.name })
    return { status: 201, jsonBody: sub }
  }),
})

app.http('subscriptionsPut', {
  methods: ['PUT'],
  route: 'subscriptions/{id}',
  authLevel: 'anonymous',
  handler: withCors(async (request) => {
    const user = await requireAuth(request).catch((e) => ({ error: e }))
    if (user.error) return { status: user.error.status || 401, body: user.error.message }
    try {
      const body = await request.json()
      const updated = await updateSubscription(user.userId, request.params.id, body)
      return { status: 200, jsonBody: updated }
    } catch (e) {
      if (e.status === 404) return { status: 404, jsonBody: { error: e.message } }
      throw e
    }
  }),
})

app.http('subscriptionsDelete', {
  methods: ['DELETE'],
  route: 'subscriptions/{id}',
  authLevel: 'anonymous',
  handler: withCors(async (request) => {
    const user = await requireAuth(request).catch((e) => ({ error: e }))
    if (user.error) return { status: user.error.status || 401, body: user.error.message }
    try {
      await deleteSubscription(user.userId, request.params.id)
      return { status: 204 }
    } catch (e) {
      if (e.status === 404) return { status: 404, jsonBody: { error: e.message } }
      throw e
    }
  }),
})
