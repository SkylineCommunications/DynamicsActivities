/**
 * Client for submitting an opportunity via a DataMiner Automation Script.
 *
 * Like ./leads.js, this form is reachable even when the user has no
 * Dynamics/Dataverse access, so it intentionally does NOT depend on
 * MSAL/Dataverse — only on the DataMiner session.
 */

import { bootstrapSession, getConnection, jsonPost, getDmaUser, validateConnection } from './dataminer'

const SCRIPT_NAME = 'DynamicsActivities_SubmitOpportunity'

async function resolveConnection(redirectOnFailure) {
  const current = getConnection()
  if (current) {
    const ok = await validateConnection(current, { redirectOnFailure })
    if (ok) return current
  }
  return bootstrapSession({ redirectOnFailure, maxAttempts: 4, retryDelayMs: 300 })
}

function buildParameters(payload, userEmail, userName) {
  return [
    {
      __type: 'Skyline.DataMiner.Web.Common.v1.DMAAutomationScriptParameter',
      ParameterId: 10,
      Values: null,
      MemoryFile: '',
      Name: 'Payload',
      Value: JSON.stringify(payload),
    },
    {
      __type: 'Skyline.DataMiner.Web.Common.v1.DMAAutomationScriptParameter',
      ParameterId: 11,
      Values: null,
      MemoryFile: '',
      Name: 'UserEmail',
      Value: userEmail,
    },
    {
      __type: 'Skyline.DataMiner.Web.Common.v1.DMAAutomationScriptParameter',
      ParameterId: 12,
      Values: null,
      MemoryFile: '',
      Name: 'UserName',
      Value: userName,
    },
  ]
}

/**
 * Submit an opportunity. Sends the form data to the DataMiner automation script,
 * which emails it to the configured recipient.
 * @param {object} opportunity Opportunity form fields.
 * @returns {Promise<object>} Parsed script result (e.g. `{ success: true }`).
 */
export async function submitOpportunity(opportunity) {
  let connection = await resolveConnection(false)
  if (!connection) {
    connection = await resolveConnection(true)
  }
  if (!connection) throw new Error('No DataMiner connection. Please sign in via DataMiner and try again.')

  const dmaUser = getDmaUser()
  const userEmail = dmaUser?.EmailAddress || ''
  const userName = dmaUser?.FullName || ''

  async function execute(connectionId, redirectOnAuthFailure) {
    return jsonPost('ExecuteAutomationScriptWithOutput', {
      connection: connectionId,
      script: {
        __type: 'Skyline.DataMiner.Web.Common.v1.DMAAutomationScript',
        Name: SCRIPT_NAME,
        Folder: '',
        Description: '',
        Settings: {
          __type: 'Skyline.DataMiner.Web.Common.v1.DMAAutomationScriptSettings',
          RequireInteractive: false,
          HasFindInteractiveClient: false,
        },
        Parameters: buildParameters(opportunity, userEmail, userName),
        Dummies: [],
        MemoryFiles: [],
      },
      scriptOptions: {
        __type: 'Skyline.DataMiner.Web.Common.v1.DMAAutomationScriptOptions',
        WaitForScript: true,
        CheckSets: true,
        LockElements: false,
        ForceLockElements: false,
        WaitWhenLocked: true,
        IsInUse: false,
        AskForConfirmation: false,
        GenerateStartedInfoEvent: false,
        customSuccessMessage: null,
        hideSuccessPopup: true,
        skipPresetsIfComplete: true,
        hidePresets: true,
        popupIsMinimizable: false,
        popupType: 1,
        ClientTimeZone: { Type: 0, Info: null },
      },
    }, { redirectOnAuthFailure })
  }

  let result = await execute(connection, false)
  if (!result || !result.ScriptOutput) {
    connection = await resolveConnection(true)
    if (!connection) throw new Error('DataMiner connection unavailable. Please try again later.')
    result = await execute(connection, true)
  }

  if (!result || !result.ScriptOutput) {
    throw new Error('Could not submit the opportunity. The DataMiner connection is unavailable.')
  }

  const output = result.ScriptOutput.find((o) => o.Key === 'result')
  if (!output) return { success: true }
  return JSON.parse(output.Value)
}
