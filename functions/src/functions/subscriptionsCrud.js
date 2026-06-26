/**
 * Subscription CRUD API
 * GET/POST/PUT/DELETE /api/subscriptions
 *
 * Implemented in Increment 4.
 */
import { app } from '@azure/functions'
import { requireAuth } from '../shared/auth.js'
import {
  listSubscriptions,
  createSubscription,
  updateSubscription,
  deleteSubscription,
} from '../shared/tables.js'

app.http('subscriptionsGet', {
  methods: ['GET'],
  route: 'subscriptions',
  authLevel: 'anonymous',
  handler: async (request) => {
    const user = await requireAuth(request).catch((e) => ({ error: e }))
    if (user.error) return { status: user.error.status || 401, body: user.error.message }
    const subs = await listSubscriptions(user.userId)
    return { status: 200, jsonBody: subs }
  },
})

app.http('subscriptionsPost', {
  methods: ['POST'],
  route: 'subscriptions',
  authLevel: 'anonymous',
  handler: async (request) => {
    const user = await requireAuth(request).catch((e) => ({ error: e }))
    if (user.error) return { status: user.error.status || 401, body: user.error.message }
    const body = await request.json()

    // Validate required fields
    const validFrequencies = ['instant', 'daily', 'weekly', 'monthly']
    if (!body.scopeType) return { status: 400, body: 'scopeType is required' }
    if (!body.frequency || !validFrequencies.includes(body.frequency))
      return { status: 400, body: `frequency must be one of: ${validFrequencies.join(', ')}` }

    // userEmail comes from the token; validate it is present
    const userEmail = user.email
    if (!userEmail || !userEmail.includes('@'))
      return { status: 400, body: 'Could not determine a valid email from your identity token' }

    const sub = await createSubscription(user.userId, { ...body, userEmail, userName: user.name })
    return { status: 201, jsonBody: sub }
  },
})

app.http('subscriptionsPut', {
  methods: ['PUT'],
  route: 'subscriptions/{id}',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const user = await requireAuth(request).catch((e) => ({ error: e }))
    if (user.error) return { status: user.error.status || 401, body: user.error.message }
    const body = await request.json()
    const updated = await updateSubscription(user.userId, context.triggerMetadata.id, body)
    return { status: 200, jsonBody: updated }
  },
})

app.http('subscriptionsDelete', {
  methods: ['DELETE'],
  route: 'subscriptions/{id}',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const user = await requireAuth(request).catch((e) => ({ error: e }))
    if (user.error) return { status: user.error.status || 401, body: user.error.message }
    await deleteSubscription(user.userId, context.triggerMetadata.id)
    return { status: 204 }
  },
})
