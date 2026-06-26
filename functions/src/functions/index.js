// Entry point — imports all Azure Function handlers so they are registered.
import './subscriptionsCrud.js'
import './notifyWebhook.js'
import './digestDaily.js'
import './digestWeekly.js'
import './digestMonthly.js'
import './emailActions.js'
