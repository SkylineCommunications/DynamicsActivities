/**
 * Client for the standalone "Add lead" form.
 *
 * Opens the user's email client with the lead details prefilled so they can
 * review and send it to the sales team manually. This avoids depending on the
 * DMA's server-side SMTP configuration.
 */

import { openEmailDraft, buildFormattedEmailBody, formatSubmitter, generateReviewLink } from './mailto'
import { getDmaUser } from './dataminer'

// Where lead submissions are sent. Change this to route leads elsewhere.
const RECIPIENT = 'loes.vervaele@skyline.be'

// Email body: [label, field key] pairs, in display order.
const FIELDS = [
  ['Topic', 'topic'],
  ['First name', 'firstName'],
  ['Last name', 'lastName'],
  ['Company / Account', 'company'],
  ['Job title', 'jobTitle'],
  ['Email', 'email'],
  ['Phone', 'phone'],
  ['Country', 'country'],
  ['Description', 'description'],
]

/**
 * Open a prefilled lead email for the user to review and send.
 * @param {object} lead Lead form fields.
 */
export function submitLead(lead) {
  const topic = lead.topic && lead.topic.trim() ? lead.topic.trim() : 'Untitled'
  const company = lead.company ? ` (${lead.company})` : ''
  const subject = `[New Lead] ${topic}${company}`
  const rows = FIELDS.map(([label, key]) => [label, lead[key]])

  const dmaUser = getDmaUser()
  const submittedBy = formatSubmitter(dmaUser?.FullName, dmaUser?.EmailAddress)
  if (submittedBy) rows.push(['Submitted by', submittedBy])
  
  // Show account link status for transparency
  if (lead.accountId) {
    rows.push(['Account GUID', `${lead.accountId} ✓ (linked)`])
  } else if (lead.company) {
    rows.push(['Account GUID', 'Not linked (manual account lookup needed)'])
  }

  // Add submittedBy to the data payload for the review link
  const leadDataWithSubmitter = { ...lead, submittedBy }
  const reviewLink = generateReviewLink('lead', leadDataWithSubmitter)

  const title = `📋 NEW LEAD SUBMISSION`
  const body = buildFormattedEmailBody(
    title,
    rows,
    reviewLink,
    '✅ Save this lead to Dynamics'
  )

  openEmailDraft(RECIPIENT, subject, body)
}
