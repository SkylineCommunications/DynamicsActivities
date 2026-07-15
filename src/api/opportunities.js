/**
 * Client for submitting an opportunity via a DataMiner Automation Script.
 *
 * Like ./leads.js, this form is reachable even when the user has no
 * Dynamics/Dataverse access, so it intentionally does NOT depend on
 * MSAL/Dataverse — only on the DataMiner session.
 */

import { submitForm } from './formSubmit'

const SCRIPT_NAME = 'DynamicsActivities_SubmitOpportunity'

/**
 * Submit an opportunity. Sends the form data to the DataMiner automation script,
 * which emails it to the configured recipient.
 * @param {object} opportunity Opportunity form fields.
 * @returns {Promise<object>} Parsed script result (e.g. `{ success: true }`).
 */
export async function submitOpportunity(opportunity) {
  return submitForm(SCRIPT_NAME, opportunity, 'opportunity')
}
