/**
 * Client for submitting standalone forms via DataMiner Automation Scripts.
 *
 * These forms are reachable even when the user has no Dynamics/Dataverse access,
 * so they intentionally do NOT depend on MSAL/Dataverse — only on the DataMiner
 * session (same pattern as ./subscriptions.js).
 */

import { submitForm } from './formSubmit'

const SCRIPT_NAME = 'DynamicsActivities_SubmitLead'

/**
 * Submit a lead. Sends the form data to the DataMiner automation script,
 * which emails it to the configured recipient.
 * @param {object} lead Lead form fields.
 * @returns {Promise<object>} Parsed script result (e.g. `{ success: true }`).
 */
export async function submitLead(lead) {
  return submitForm(SCRIPT_NAME, lead, 'lead')
}
