const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

const taskTable = read('src/renderer/src/components/TaskTable.tsx')
const taskList = read('src/renderer/src/pages/TaskListPage.tsx')
const createDocModal = read('src/renderer/src/components/CreateDocModal.tsx')

assert.match(taskTable, /key: 'create-doc'[\s\S]*?label: '总结为文档'[\s\S]*?key: 'export'[\s\S]*?label: '导出 TXT'/)
assert.match(taskTable, /case 'create-doc': onCreateDoc\?\.\(e\.domEvent, task\.id\)/)
assert.match(taskList, /onCreateDoc=\{handleCreateDocFromTask\}/)
assert.match(taskList, /initialTaskId=\{createDocInitialTaskId\}/)
assert.ok(createDocModal.includes("setSelectedSourceKeys(initialTaskId ? [`task::${initialTaskId}`] : [])"))
assert.match(createDocModal, /createKnowledgeDoc\(\{ sourceIds, templateId \}\)/)
assert.match(createDocModal, /title="新建总结"/)

console.log('Completed transcription tasks can open the existing document workflow with their result preselected.')
