import { registerTaskHandlers } from './taskHandlers'
import { registerRecordingHandlers } from './recordingHandlers'
import { registerSettingsHandlers } from './settingsHandlers'
import { registerFileHandlers } from './fileHandlers'
import { registerAnalysisHandlers } from './analysisHandlers'

export function registerIpcHandlers(): void {
  registerTaskHandlers()
  registerFileHandlers()
  registerSettingsHandlers()
  registerAnalysisHandlers()
  registerRecordingHandlers()
}
