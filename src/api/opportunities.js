/**
 * Client for the standalone "Add opportunity" form.
 *
 * Like ./leads.js, this opens the user's email client with the opportunity
 * details prefilled so they can review and send it to the sales team manually.
 */

import { openEmailDraft, buildFormattedEmailBody, formatSubmitter, generateReviewLink } from './mailto'
import { getDmaUser } from './dataminer'

// Where opportunity submissions are sent. Change this to route them elsewhere.
const RECIPIENT = 'loes.vervaele@skyline.be'

// Email body: [label, field key] pairs, in display order.
const FIELDS = [
  ['Opportunity name', 'topic'],
  ['Company / Account', 'company'],
  ['Estimated value', 'estimatedValue'],
  ['Contact first name', 'firstName'],
  ['Contact last name', 'lastName'],
  ['Email', 'email'],
  ['Phone', 'phone'],
  ['Estimated close date', 'estimatedCloseDate'],
  ['Country', 'country'],
  ['Description', 'description'],
]

/**
 * Open a prefilled opportunity email for the user to review and send.
 * @param {object} opportunity Opportunity form fields.
 */
export function submitOpportunity(opportunity) {
  const company = opportunity.company ? ` (${opportunity.company})` : ''
  const subject = `[New Opportunity] ${opportunity.topic || 'Untitled'}${company}`
  const rows = FIELDS.map(([label, key]) => [label, opportunity[key]])

  const dmaUser = getDmaUser()
  const submittedBy = formatSubmitter(dmaUser?.FullName, dmaUser?.EmailAddress)
  if (submittedBy) rows.push(['Submitted by', submittedBy])

  // Add submittedBy to the data payload for the review link
  const opportunityDataWithSubmitter = { ...opportunity, submittedBy }
  const reviewLink = generateReviewLink('opportunity', opportunityDataWithSubmitter)

  const title = `💡 NEW OPPORTUNITY SUBMISSION`
  const body = buildFormattedEmailBody(
    title,
    rows,
    reviewLink,
    '✅ Save this opportunity to Dynamics'
  )

  openEmailDraft(RECIPIENT, subject, body)
}
