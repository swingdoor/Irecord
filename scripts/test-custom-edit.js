const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

const editor = read('src/renderer/src/components/TipTapEditor.tsx')
const preload = read('src/preload/index.ts')
const handler = read('src/main/ipc/knowledgeHandlers.ts')
const prompts = read('src/main/llm/prompts.ts')
const editFlow = `${editor}\n${preload}\n${handler}\n${prompts}`

assert.doesNotMatch(editFlow, /'rewrite'|>改写</)
assert.match(editor, /handlePolishStart\('custom', customInstruction\)/)
assert.match(editor, /metaKey \|\| e\.ctrlKey/)
assert.match(handler, /\['polish', 'expand', 'custom'\]\.includes\(params\.type\)/)
assert.match(handler, /instruction\.length > 500/)
assert.match(prompts, /type === 'custom' \? `修改要求：/)

console.log('Custom editing reuses the selection workflow; rewrite has been removed.')
