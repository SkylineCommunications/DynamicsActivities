/**
 * Client for the standalone "Add lead" form.
 *
 * Opens the user's email client with the lead details prefilled so they can
 * review and send it to the sales team manually. This avoids depending on the
 * DMA's server-side SMTP configuration.
 */

import { openEmailDraft, buildEmailBody, formatSubmitter } from './mailto'
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

  const body = buildEmailBody(rows)

  openEmailDraft(RECIPIENT, subject, body)
}
