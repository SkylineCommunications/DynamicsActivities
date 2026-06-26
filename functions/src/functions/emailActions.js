/**
 * Email action endpoints.
 * POST /api/actions/mark-read
 * POST /api/actions/follow-up
 * GET  /api/actions/read-status
 *
 * Implemented in Increment 7.
 */
import { app } from '@azure/functions'

app.http('actionsMarkRead', {
  methods: ['GET', 'POST'],
  route: 'actions/mark-read',
  authLevel: 'anonymous',
  handler: async () => ({ status: 200, body: 'ok — implemented in Increment 7' }),
})

app.http('actionsFollowUp', {
  methods: ['POST'],
  route: 'actions/follow-up',
  authLevel: 'anonymous',
  handler: async () => ({ status: 200, body: 'ok — implemented in Increment 7' }),
})

app.http('actionsReadStatus', {
  methods: ['GET'],
  route: 'actions/read-status',
  authLevel: 'anonymous',
  handler: async () => ({ status: 200, jsonBody: [] }),
})
