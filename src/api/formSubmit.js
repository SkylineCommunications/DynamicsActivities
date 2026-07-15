/**
 * Shared client for submitting standalone forms via DataMiner Automation Scripts.
 *
 * These forms are reachable even when the user has no Dynamics/Dataverse access,
 * so they intentionally do NOT depend on MSAL/Dataverse — only on the DataMiner
 * session (same pattern as ./subscriptions.js).
 */

import { bootstrapSession, getConnection, jsonPost, getDmaUser, validateConnection, DataMinerServerError } from './dataminer'

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
 * Submit a form payload to a DataMiner automation script that emails it.
 *
 * @param {string} scriptName Automation script name (e.g. `DynamicsActivities_SubmitLead`).
 * @param {object} payload    Form fields to send as the JSON payload.
 * @param {string} label      Human-readable noun for error messages (e.g. `lead`).
 * @returns {Promise<object>} Parsed script result (e.g. `{ success: true }`).
 */
export async function submitForm(scriptName, payload, label) {
  let connection = await resolveConnection(false)
  if (!connection) {
    connection = await resolveConnection(true)
  }
  if (!connection) throw new Error('No DataMiner connection. Please sign in via DataMiner and try again.')

  const dmaUser = getDmaUser()
  const userEmail = dmaUser?.EmailAddress || ''
  const userName = dmaUser?.FullName || ''

  async function execute(connectionId, redirectOnAuthFailure, surfaceServerError = false) {
    return jsonPost('ExecuteAutomationScriptWithOutput', {
      connection: connectionId,
      script: {
        __type: 'Skyline.DataMiner.Web.Common.v1.DMAAutomationScript',
        Name: scriptName,
        Folder: '',
        Description: '',
        Settings: {
          __type: 'Skyline.DataMiner.Web.Common.v1.DMAAutomationScriptSettings',
          RequireInteractive: false,
          HasFindInteractiveClient: false,
        },
        Parameters: buildParameters(payload, userEmail, userName),
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
    }, { redirectOnAuthFailure, surfaceServerError })
  }

  let result = await execute(connection, false)
  if (!result || !result.ScriptOutput) {
    connection = await resolveConnection(true)
    if (!connection) throw new Error(`Could not submit the ${label}. The DataMiner connection is unavailable.`)
    // Surface the real server-side error (e.g. script failure / email/SMTP issue)
    // instead of masking every failure as a connection problem.
    try {
      result = await execute(connection, true, true)
    } catch (err) {
      if (err instanceof DataMinerServerError) {
        throw new Error(`Could not submit the ${label}. ${err.message}`)
      }
      throw err
    }
  }

  if (!result || !result.ScriptOutput) {
    throw new Error(`Could not submit the ${label}. The server did not return a result.`)
  }

  const output = result.ScriptOutput.find((o) => o.Key === 'result')
  if (!output) return { success: true }

  let parsed
  try {
    parsed = JSON.parse(output.Value)
  } catch {
    // Non-JSON output means the script ran but returned an unexpected value.
    throw new Error(`Could not submit the ${label}. The server returned an unexpected response.`)
  }

  // Surface server-side validation/business errors instead of a generic message.
  if (parsed && parsed.success === false) {
    throw new Error(parsed.error || `Could not submit the ${label}.`)
  }

  return parsed
}
