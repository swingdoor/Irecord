const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

const recordingHandler = read('src/main/ipc/recordingHandlers.ts')
const preload = read('src/preload/index.ts')
const recordingPage = read('src/renderer/src/pages/RecordingPage.tsx')
const taskList = read('src/renderer/src/pages/TaskListPage.tsx')
const recordingDetail = read('src/renderer/src/pages/RealtimeRecordingDetailPage.tsx')

const removedChain = `${recordingHandler}\n${preload}\n${recordingPage}`
assert.doesNotMatch(removedChain, /create-recording-transcription|createRecordingTranscription|createTranscription/)
assert.match(recordingHandler, /renameSync\(params\.filePath, filePath\)/)
assert.match(recordingHandler, /title: fileName/)
assert.match(recordingPage, /const \[transcribeAfterSave, setTranscribeAfterSave\] = useState\(true\)/)
assert.match(recordingPage, /addDroppedFiles\(\[savedFilePath\]\)/)
assert.match(taskList, /addDroppedFiles\(\[recording\.filePath\], selectedModel\)/)
assert.match(taskList, /recordingNameByPath\.get\(task\.filePath\)/)
assert.match(recordingDetail, /addDroppedFiles\(\[currentRealtimeRecording\.filePath\]\)/)

console.log('Recording and file-task names share the saved WAV filename; analysis uses the file path.')
