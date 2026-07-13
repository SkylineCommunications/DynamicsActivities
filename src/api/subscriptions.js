/**
 * Client for subscription management via DataMiner Automation Script (DOM).
 * Calls DynamicsActivities_ManageSubscriptions through the JSON API.
 * Falls back gracefully if DataMiner session is unavailable.
 */

import { bootstrapSession, getConnection, jsonPost, getDmaUser, validateConnection } from './dataminer'

const SCRIPT_NAME = 'DynamicsActivities_ManageSubscriptions'

/**
 * Execute the CRUD automation script with given action and payload.
 */
async function runSubscriptionScript(action, payload = {}) {
  async function resolveConnection(redirectOnFailure) {
    const current = getConnection()
    if (current) {
      const ok = await validateConnection(current, { redirectOnFailure })
      if (ok) return current
    }
    return bootstrapSession({ redirectOnFailure, maxAttempts: 4, retryDelayMs: 300 })
  }

  let connection = await resolveConnection(false)
  if (!connection) {
    connection = await resolveConnection(true)
  }
  if (!connection) throw new Error('No DataMiner connection')

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
        Parameters: [
          {
            __type: 'Skyline.DataMiner.Web.Common.v1.DMAAutomationScriptParameter',
            ParameterId: 10,
            Values: null,
            MemoryFile: '',
            Name: 'Action',
            Value: action,
          },
          {
            __type: 'Skyline.DataMiner.Web.Common.v1.DMAAutomationScriptParameter',
            ParameterId: 11,
            Values: null,
            MemoryFile: '',
            Name: 'Payload',
            Value: JSON.stringify(payload),
          },
          {
            __type: 'Skyline.DataMiner.Web.Common.v1.DMAAutomationScriptParameter',
            ParameterId: 12,
            Values: null,
            MemoryFile: '',
            Name: 'UserEmail',
            Value: userEmail,
          },
          {
            __type: 'Skyline.DataMiner.Web.Common.v1.DMAAutomationScriptParameter',
            ParameterId: 13,
            Values: null,
            MemoryFile: '',
            Name: 'UserName',
            Value: userName,
          },
        ],
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
    if (!connection) throw new Error('DataMiner connection unavailable. Subscriptions are currently unavailable.')
    result = await execute(connection, true)
  }

  // Errors come as HTTP 500 (caught by jsonPost). A successful response has ScriptOutput.
  if (!result || !result.ScriptOutput) {
    throw new Error('DataMiner connection unavailable. Subscriptions are currently unavailable.')
  }

  // Extract the "result" key from ScriptOutput [{Key, Value}]
  const output = result.ScriptOutput.find(o => o.Key === 'result')
  if (!output) return null
  return JSON.parse(output.Value)
}

export async function getSubscriptions(/* msalInstance not needed */) {
  return runSubscriptionScript('list')
}

export async function createSubscription(msalInstance, payload) {
  return runSubscriptionScript('create', payload)
}

export async function updateSubscription(msalInstance, id, patch) {
  return runSubscriptionScript('update', { id, ...patch })
}

export async function deleteSubscription(msalInstance, id) {
  return runSubscriptionScript('delete', { id })
}
