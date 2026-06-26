/**
 * Daily digest timer function.
 * Runs at 06:00 UTC every day.
 *
 * Implemented in Increment 6.
 */
import { app } from '@azure/functions'

app.timer('digestDaily', {
  schedule: '0 6 * * *',
  handler: async (timer, context) => {
    context.log('digestDaily: stub — implemented in Increment 6')
  },
})
