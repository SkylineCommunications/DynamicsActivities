/**
 * Azure OpenAI integration for activity summary generation.
 * Falls back gracefully to a rule-based summary if the API is unavailable.
 */

import OpenAI from 'openai'

let _client = null

function getClient() {
  if (!_client) {
    _client = new OpenAI({
      apiKey: process.env.AZURE_OPENAI_KEY,
      baseURL: `${(process.env.AZURE_OPENAI_ENDPOINT || '').replace(/\/$/, '')}/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT}`,
      defaultQuery: { 'api-version': '2024-02-01' },
      defaultHeaders: { 'api-key': process.env.AZURE_OPENAI_KEY },
    })
  }
  return _client
}

function activityDate(a) {
  return a.scheduledstart || a.scheduledend || a.actualend || a.createdon
}

function entityTypeLabel(entityType) {
  if (entityType === 'phonecalls') return 'Phone Call'
  if (entityType === 'appointments') return 'Appointment'
  if (entityType === 'slc_escalations') return 'Escalation'
  return 'Email'
}

function ruleBased(activities, scopeLabel) {
  const total = activities.length
  const byType = {}
  const accounts = new Set()
  for (const a of activities) {
    const t = entityTypeLabel(a._entityType)
    byType[t] = (byType[t] || 0) + 1
    const name = a['_regardingobjectid_value@OData.Community.Display.V1.FormattedValue']
    if (name) accounts.add(name)
  }
  const typeSummary = Object.entries(byType)
    .map(([t, n]) => `${n} ${t}${n > 1 ? 's' : ''}`)
    .join(', ')
  const acctList = [...accounts].slice(0, 3).join(', ')
  return `${total} new activit${total === 1 ? 'y' : 'ies'} logged for ${scopeLabel}: ${typeSummary}.${acctList ? ` Top accounts: ${acctList}.` : ''}`
}

/**
 * Generate a 2–4 sentence AI summary of a list of activities.
 * Returns a fallback rule-based summary if OpenAI is unavailable.
 *
 * @param {object[]} activities - Dataverse activity records
 * @param {string} scopeLabel   - human-readable subscription scope label
 * @returns {Promise<string>}
 */
export async function generateSummary(activities, scopeLabel) {
  if (!process.env.AZURE_OPENAI_KEY || !process.env.AZURE_OPENAI_ENDPOINT) {
    return ruleBased(activities, scopeLabel)
  }

  try {
    const lines = activities.slice(0, 30).map((a) => {
      const account = a['_regardingobjectid_value@OData.Community.Display.V1.FormattedValue'] || 'Unknown'
      const date = activityDate(a) ? new Date(activityDate(a)).toLocaleDateString('en-GB') : ''
      const desc = (a.description || '').slice(0, 200)
      return `- [${entityTypeLabel(a._entityType)}] ${account} (${date}): ${desc}`
    })

    const prompt = `You are a business analyst assistant. Below are ${activities.length} customer interaction activities logged in Dynamics 365 for the scope "${scopeLabel}". 

Write a concise 2–4 sentence summary that highlights the most important patterns, notable customers, and any items that may require attention. Be factual and professional. Do not use bullet points.

Activities:
${lines.join('\n')}`

    const response = await getClient().chat.completions.create({
      model: process.env.AZURE_OPENAI_DEPLOYMENT,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
      temperature: 0.3,
    })

    return response.choices[0]?.message?.content?.trim() || ruleBased(activities, scopeLabel)
  } catch (err) {
    console.warn('OpenAI summary generation failed, using rule-based fallback:', err.message)
    return ruleBased(activities, scopeLabel)
  }
}
