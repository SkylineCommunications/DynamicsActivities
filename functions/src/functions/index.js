// Entry point — imports all Azure Function handlers so they are registered.
// Also ensures Azure Table Storage tables exist before any request is handled.
import { ensureTables } from '../shared/tables.js'

ensureTables().then(() => {
  console.log('[startup] Azure Table Storage tables ready')
}).catch((err) => {
  console.error('[startup] Failed to create tables:', err.message)
})

import './subscriptionsCrud.js'
import './notifyWebhook.js'
import './instantPoller.js'
import './digestDaily.js'
import './digestWeekly.js'
import './digestMonthly.js'
import './emailActions.js'
