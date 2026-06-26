/**
 * Weekly digest timer function.
 * Runs at 07:00 UTC every Monday.
 * Sends to weekly subscribers only — instant subscribers are handled by the webhook.
 */
import { app } from '@azure/functions'
import { runDigest } from './digestRunner.js'

app.timer('digestWeekly', {
  schedule: '0 7 * * 1',
  handler: async (timer, context) => {
    context.log('digestWeekly: starting')
    await runDigest('weekly', 7, context)
    context.log('digestWeekly: done')
  },
})
