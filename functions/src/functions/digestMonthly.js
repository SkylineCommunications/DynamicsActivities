/**
 * Monthly digest timer function.
 * Runs at 08:00 UTC on the 1st of every month.
 *
 * Implemented in Increment 6.
 */
import { app } from '@azure/functions'

app.timer('digestMonthly', {
  schedule: '0 8 1 * *',
  handler: async (timer, context) => {
    context.log('digestMonthly: stub — implemented in Increment 6')
  },
})
