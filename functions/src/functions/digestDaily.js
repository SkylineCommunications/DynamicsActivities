/**
 * Daily digest timer function.
 * Runs at 06:00 UTC every day.
 * Sends to daily subscribers only — instant subscribers are handled by the webhook.
 */
import { app } from '@azure/functions'
import { runDigest } from './digestRunner.js'

app.timer('digestDaily', {
  schedule: '0 6 * * *',
  handler: async (timer, context) => {
    context.log('digestDaily: starting')
    await runDigest('daily', 1, context)
    context.log('digestDaily: done')
  },
})
