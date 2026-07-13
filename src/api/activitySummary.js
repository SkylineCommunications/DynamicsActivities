import { bootstrapSession, getConnection, isDataMinerHost, jsonPost } from './dataminer'

const SCRIPT_NAME = 'DynamicsActivities_Summarize'

async function executeScript(connectionId, payload, redirectOnAuthFailure) {
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
          Name: 'Payload',
          Value: JSON.stringify(payload),
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

async function resolveConnection() {
  const existing = getConnection()
  if (existing) {
    const alive = await jsonPost('IsConnectionAlive', { connection: existing }, { redirectOnAuthFailure: false })
    if (alive !== null) return existing
  }

  return bootstrapSession({ redirectOnFailure: false, maxAttempts: 2, retryDelayMs: 250 })
}

export async function summarizeActivities(payload) {
  if (!isDataMinerHost()) return null
  if (!payload || !Array.isArray(payload.activities) || payload.activities.length === 0) return null

  let connection = await resolveConnection()
  if (!connection) return null

  let result = await executeScript(connection, payload, false)
  if (!result || !result.ScriptOutput) {
    connection = await bootstrapSession({ redirectOnFailure: false, maxAttempts: 2, retryDelayMs: 250 })
    if (!connection) return null
    result = await executeScript(connection, payload, false)
  }

  if (!result || !result.ScriptOutput) return null

  const output = result.ScriptOutput.find((item) => item.Key === 'result')
  if (!output?.Value) return null

  try {
    return JSON.parse(output.Value)
  } catch {
    return null
  }
}
