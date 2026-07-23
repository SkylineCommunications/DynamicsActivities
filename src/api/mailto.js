/**
 * Helpers for the standalone lead/opportunity forms.
 *
 * Instead of relying on the DMA's server-side SMTP configuration, these forms
 * open the user's own email client with the message prefilled (recipient,
 * subject, body). The user reviews and sends it manually.
 */

/**
 * Open the user's email client with a prefilled message.
 * @param {string} to      Recipient email address.
 * @param {string} subject Email subject.
 * @param {string} body    Plain-text email body.
 */
export function openEmailDraft(to, subject, body) {
  const url = `mailto:${encodeURIComponent(to)}`
    + `?subject=${encodeURIComponent(subject)}`
    + `&body=${encodeURIComponent(body)}`

  // Use a transient anchor click rather than window.location so the mail client
  // opens without navigating the app (important when hosted in DataMiner's iframe).
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
}

/**
 * Format labelled fields into a plain-text email body. Empty fields are omitted.
 * @param {Array<[string, string]>} rows Array of [label, value] pairs.
 * @returns {string} Plain-text body.
 */
export function buildEmailBody(rows) {
  return rows
    .filter(([, value]) => value && String(value).trim())
    .map(([label, value]) => `${label}: ${String(value).trim()}`)
    .join('\n')
}

/**
 * Build a formatted email body with header, details section, and call-to-action link.
 * @param {string} title Email title/header (e.g., "New Lead Submission")
 * @param {Array<[string, string]>} rows Field rows [label, value]
 * @param {string} reviewLink URL to review and save
 * @param {string} ctaText Call-to-action text (e.g., "Save this lead to Dynamics")
 * @returns {string} Formatted plain-text email body
 */
export function buildFormattedEmailBody(title, rows, reviewLink, ctaText) {
  const divider = '━━━━━━━━━━━━━━━━━━━━━━━━━━'
  
  const details = rows
    .filter(([, value]) => value && String(value).trim())
    .map(([label, value]) => {
      const labelPadded = label.toUpperCase()
      return `${labelPadded}\n${String(value).trim()}`
    })
    .join('\n\n')

  return [
    title,
    divider,
    '',
    details,
    '',
    '',
    '🔗 QUICK ACTION',
    divider,
    '',
    ctaText + ':',
    '',
    reviewLink,
    '',
    'Click the link above to review and save. The details are pre-filled, just authenticate and click "Save to Dynamics".',
    '',
    '',
    'This is an automated submission from the DynamicsActivities app.',
    'If you have questions, please contact the submitter listed above.',
  ].join('\n')
}

/**
 * Format the submitter's name/email into a "Name <email>" string. Guards against
 * missing values: returns whichever part is present, or '' when neither is.
 * @param {string} [name]  Submitter full name.
 * @param {string} [email] Submitter email address.
 * @returns {string} e.g. `Jane Doe <jane@x.com>`, `Jane Doe`, `jane@x.com`, or ``.
 */
export function formatSubmitter(name, email) {
  const cleanName = typeof name === 'string' ? name.trim() : ''
  const cleanEmail = typeof email === 'string' ? email.trim() : ''
  if (cleanName && cleanEmail) return `${cleanName} <${cleanEmail}>`
  return cleanName || cleanEmail || ''
}

/**
 * Generate a shareable review link for a lead or opportunity submission.
 * The link encodes the form data in the URL so full-license users can save it to Dynamics.
 * Uses URL-safe base64 encoding to prevent corruption when passed through mailto: links.
 * @param {string} type 'lead' or 'opportunity'
 * @param {object} data Form data object
 * @returns {string} Full URL to the review page
 */
export function generateReviewLink(type, data) {
  const baseUrl = window.location.origin + window.location.pathname
  // Use URL-safe base64: replace + with -, / with _, and remove padding =
  const encoded = btoa(JSON.stringify(data))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return `${baseUrl}#/review/${type}?data=${encoded}`
}

/**
 * Decode URL-safe base64 data from a review link.
 * Reverses the URL-safe encoding applied by generateReviewLink.
 * @param {string} encoded URL-safe base64 string
 * @returns {object} Decoded data object
 * @throws {Error} If decoding fails
 */
export function decodeReviewData(encoded) {
  // Convert URL-safe base64 back to standard base64
  let base64 = encoded
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  // Add back padding if needed
  while (base64.length % 4) {
    base64 += '='
  }
  return JSON.parse(atob(base64))
}