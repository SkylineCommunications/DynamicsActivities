/**
 * Weekly digest timer function.
 * Runs at 07:00 UTC every Monday.
 *
 * Implemented in Increment 6.
 */
import { app } from '@azure/functions'

app.timer('digestWeekly', {
  schedule: '0 7 * * 1',
  handler: async (timer, context) => {
    context.log('digestWeekly: stub — implemented in Increment 6')
  },
})
