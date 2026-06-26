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

app.http('subscriptionsPost', {
  methods: ['POST'],
  route: 'subscriptions',
  authLevel: 'anonymous',
  handler: withCors(async (request) => {
    const user = await requireAuth(request).catch((e) => ({ error: e }))
    if (user.error) return { status: user.error.status || 401, body: user.error.message }
    const body = await request.json()
    const sub = await createSubscription(user.userId, { ...body, userEmail: user.email, userName: user.name })
    return { status: 201, jsonBody: sub }
  }),
})

app.http('subscriptionsPut', {
  methods: ['PUT'],
  route: 'subscriptions/{id}',
  authLevel: 'anonymous',
  handler: withCors(async (request, context) => {
    const user = await requireAuth(request).catch((e) => ({ error: e }))
    if (user.error) return { status: user.error.status || 401, body: user.error.message }
    const body = await request.json()
    const updated = await updateSubscription(user.userId, context.triggerMetadata.id, body)
    return { status: 200, jsonBody: updated }
  }),
})

app.http('subscriptionsDelete', {
  methods: ['DELETE'],
  route: 'subscriptions/{id}',
  authLevel: 'anonymous',
  handler: withCors(async (request, context) => {
    const user = await requireAuth(request).catch((e) => ({ error: e }))
    if (user.error) return { status: user.error.status || 401, body: user.error.message }
    await deleteSubscription(user.userId, context.triggerMetadata.id)
    return { status: 204 }
  }),
})
