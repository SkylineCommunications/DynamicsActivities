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
