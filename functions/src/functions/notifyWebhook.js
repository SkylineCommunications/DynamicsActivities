/**
 * Dataverse webhook receiver — instant notification dispatcher.
 * POST /api/notify
 *
 * Implemented in Increment 5.
 */
import { app } from '@azure/functions'

app.http('notifyWebhook', {
  methods: ['POST'],
  route: 'notify',
  authLevel: 'anonymous',
  handler: async (request) => {
    // Implementation added in Increment 5
    return { status: 200, body: 'ok' }
  },
})
