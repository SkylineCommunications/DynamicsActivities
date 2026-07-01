/**
 * Client for subscription management via DataMiner Automation Script (DOM).
 * Calls DynamicsActivities_ManageSubscriptions through the JSON API.
 * Falls back gracefully if DataMiner session is unavailable.
 */

import { getConnectionFromCookie, jsonPost, getDmaUser } from './dataminer'

const SCRIPT_NAME = 'DynamicsActivities_ManageSubscriptions'

/**
 * Execute the CRUD automation script with given action and payload.
 */
async function runSubscriptionScript(action, payload = {}) {
  const connection = getConnectionFromCookie()
  if (!connection) throw new Error('No DataMiner connection')

  const dmaUser = getDmaUser()
  const userEmail = dmaUser?.EmailAddress || ''
  const userName = dmaUser?.FullName || ''

  const result = await jsonPost('ExecuteAutomationScriptWithOutput', {
    connection,
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
  })

  if (!result || result.ErrorCode !== 0) {
    throw new Error(`Script failed: ${JSON.stringify(result)}`)
  }

  // Extract the "result" output from the script
  const output = result.Output?.find(o => o.Name === 'result')
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

// Read status and mark-read are activity-level features that still live
// in Dataverse / the browse view — kept as stubs for now.
export async function getReadStatus(/* msalInstance, activityIds */) {
  return []
}

export async function markActivityRead(/* msalInstance, activityId */) {
  return null
}
