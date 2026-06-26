/**
 * Monthly digest timer function.
 * Runs at 08:00 UTC on the 1st of every month.
 * Sends to monthly subscribers only — instant subscribers are handled by the webhook.
 */
import { app } from '@azure/functions'
import { runDigest } from './digestRunner.js'

app.timer('digestMonthly', {
  schedule: '0 8 1 * *',
  handler: async (timer, context) => {
    context.log('digestMonthly: starting')
    await runDigest('monthly', 30, context)
    context.log('digestMonthly: done')
  },
})
