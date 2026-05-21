import { ipcMain, dialog, BrowserWindow } from 'electron'
import { existsSync } from 'fs'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { getSettings } from '../utils/settings'
import { callLLM } from '../llm/client'
import { getKnowledgeDocPrompt, getPolishPrompt } from '../llm/prompts'
import {
  createKnowledgeDoc,
  getKnowledgeDoc,
  getAllKnowledgeDocs,
  updateKnowledgeDoc,
  deleteKnowledgeDoc,
  getAllTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getTask,
  getResult,
  getRealtimeRecording,
} from '../db/database'
import { logError } from '../utils/errorHandler'

function getUniqueFileName(dir: string, baseName: string, ext: string): string {
  // 清理文件名中的非法字符
  const cleanName = baseName.replace(/[<>:"/\\|?*]/g, '_')
  let fileName = `${cleanName}.${ext}`
  let counter = 1

  while (existsSync(join(dir, fileName))) {
    fileName = `${cleanName}(${counter}).${ext}`
    counter++
  }

  return fileName
}

export function registerKnowledgeHandlers(): void {
  // 创建知识文档（异步生成）
  ipcMain.handle('create-knowledge-doc', async (_event, params: {
    sourceIds: Array<{ type: 'task' | 'realtime'; id: string }>
    templateId: string
  }) => {
    try {
      const template = await getTemplate(params.templateId)
      if (!template) return { error: '模板不存在' }

      // 收集素材文本
      const texts: string[] = []
      let firstSourceName = ''
      for (const src of params.sourceIds) {
        if (src.type === 'task') {
          const task = await getTask(src.id)
          const result = await getResult(src.id)
          if (result?.text) texts.push(result.text)
          if (!firstSourceName && task?.fileName) {
            firstSourceName = task.fileName.replace(/\.[^.]+$/, '')
          }
        } else if (src.type === 'realtime') {
          const rec = await getRealtimeRecording(src.id)
          if (rec?.text) texts.push(rec.text)
          if (!firstSourceName && rec?.title) {
            firstSourceName = rec.title
          }
        }
      }

      if (texts.length === 0) return { error: '未找到有效的转写文本' }

      // 确定性标题：模板名称：源文件名
      const docTitle = firstSourceName
        ? `${template.name}：${firstSourceName}`
        : template.name

      // 先创建一条 generating 状态的记录
      const doc = await createKnowledgeDoc({
        title: docTitle,
        content: '',
        status: 'generating',
        templateId: params.templateId,
        sourceIds: JSON.stringify(params.sourceIds),
      })

      // 后台异步生成
      ;(async () => {
        try {
          const settings = getSettings()
          const prompt = getKnowledgeDocPrompt(template.prompt, texts)
          const content = await callLLM(settings, prompt.system, prompt.user, 1, false)

          // 去除可能的代码块标记
          let cleanContent = content.trim()
          if (cleanContent.startsWith('```')) {
            cleanContent = cleanContent.replace(/^```(?:html)?\s*/, '').replace(/\s*```$/, '')
          }

          // 更新为 completed，保留确定性标题
          await updateKnowledgeDoc(doc.id, {
            content: cleanContent,
            status: 'completed',
          })
        } catch (err: unknown) {
          logError('create-knowledge-doc-async', err)
          const message = err instanceof Error ? err.message : '生成失败'
          await updateKnowledgeDoc(doc.id, {
            title: '生成失败',
            status: 'failed',
            error: message,
          })
        }
      })()

      return { docId: doc.id }
    } catch (err: unknown) {
      logError('create-knowledge-doc', err)
      const message = err instanceof Error ? err.message : '生成文档失败'
      return { error: message }
    }
  })

  // 获取所有知识文档
  ipcMain.handle('get-knowledge-docs', async () => {
    try {
      const docs = await getAllKnowledgeDocs()
      return { docs }
    } catch (err: any) {
      logError('get-knowledge-docs', err)
      return { error: err.message || '获取文档列表失败' }
    }
  })

  // 获取单个知识文档
  ipcMain.handle('get-knowledge-doc', async (_event, docId: string) => {
    try {
      const doc = await getKnowledgeDoc(docId)
      if (!doc) return { error: '文档不存在' }
      return { doc }
    } catch (err: any) {
      logError('get-knowledge-doc', err)
      return { error: err.message || '获取文档失败' }
    }
  })

  // 更新知识文档
  ipcMain.handle('update-knowledge-doc', async (_event, params: {
    docId: string
    title?: string
    content?: string
  }) => {
    try {
      await updateKnowledgeDoc(params.docId, { title: params.title, content: params.content })
      return { success: true }
    } catch (err: any) {
      logError('update-knowledge-doc', err)
      return { error: err.message || '更新文档失败' }
    }
  })

  // 删除知识文档
  ipcMain.handle('delete-knowledge-doc', async (_event, docId: string) => {
    try {
      await deleteKnowledgeDoc(docId)
      return { success: true }
    } catch (err: any) {
      logError('delete-knowledge-doc', err)
      return { error: err.message || '删除文档失败' }
    }
  })

  // 获取所有模板
  ipcMain.handle('get-templates', async () => {
    try {
      const templates = await getAllTemplates()
      return { templates }
    } catch (err: any) {
      logError('get-templates', err)
      return { error: err.message || '获取模板列表失败' }
    }
  })

  // 创建自定义模板
  ipcMain.handle('create-template', async (_event, params: { name: string; prompt: string }) => {
    try {
      const tpl = await createTemplate(params)
      return { template: tpl }
    } catch (err: any) {
      logError('create-template', err)
      return { error: err.message || '创建模板失败' }
    }
  })

  // 更新自定义模板
  ipcMain.handle('update-template', async (_event, params: {
    templateId: string
    name?: string
    prompt?: string
  }) => {
    try {
      await updateTemplate(params.templateId, { name: params.name, prompt: params.prompt })
      return { success: true }
    } catch (err: any) {
      logError('update-template', err)
      return { error: err.message || '更新模板失败' }
    }
  })

  // 删除自定义模板
  ipcMain.handle('delete-template', async (_event, templateId: string) => {
    try {
      await deleteTemplate(templateId)
      return { success: true }
    } catch (err: any) {
      logError('delete-template', err)
      return { error: err.message || '删除模板失败' }
    }
  })

  // 局部润色
  ipcMain.handle('polish-text', async (_event, params: {
    text: string
    type: 'polish' | 'rewrite' | 'expand'
  }) => {
    try {
      const settings = getSettings()
      const prompt = getPolishPrompt(params.text, params.type)
      const result = await callLLM(settings, prompt.system, prompt.user, 1, false)
      return { result: result.trim() }
    } catch (err: unknown) {
      logError('polish-text', err)
      const message = err instanceof Error ? err.message : '润色失败'
      return { error: message }
    }
  })

  // 导出 Markdown（HTML → Markdown）
  ipcMain.handle('export-knowledge-markdown', async (_event, params: { title: string; content: string }) => {
    const result = await dialog.showSaveDialog({
      title: '导出 Markdown',
      defaultPath: `${params.title}.md`,
      filters: [{ name: 'Markdown 文件', extensions: ['md'] }]
    })

    if (result.canceled || !result.filePath) return { canceled: true }

    try {
      const md = htmlToMarkdown(params.content)
      await writeFile(result.filePath, md, 'utf-8')
      return { filePath: result.filePath }
    } catch (err: any) {
      logError('export-knowledge-markdown', err)
      return { error: `导出失败: ${err.message}` }
    }
  })

  // 导出 TXT（HTML → 纯文本）
  ipcMain.handle('export-knowledge-txt', async (_event, params: { title: string; content: string }) => {
    const result = await dialog.showSaveDialog({
      title: '导出 TXT',
      defaultPath: `${params.title}.txt`,
      filters: [{ name: '文本文件', extensions: ['txt'] }]
    })

    if (result.canceled || !result.filePath) return { canceled: true }

    try {
      const plainText = htmlToPlainText(params.content)
      await writeFile(result.filePath, plainText, 'utf-8')
      return { filePath: result.filePath }
    } catch (err: any) {
      logError('export-knowledge-txt', err)
      return { error: `导出失败: ${err.message}` }
    }
  })

  // 导出 PDF（HTML 直接渲染）
  ipcMain.handle('export-knowledge-pdf', async (_event, params: { title: string; content: string }) => {
    const result = await dialog.showSaveDialog({
      title: '导出 PDF',
      defaultPath: `${params.title}.pdf`,
      filters: [{ name: 'PDF 文件', extensions: ['pdf'] }]
    })

    if (result.canceled || !result.filePath) return { canceled: true }

    try {
      const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
        body { font-family: "Microsoft YaHei", "PingFang SC", sans-serif; padding: 40px; line-height: 1.8; color: #333; }
        h1 { font-size: 24px; margin: 24px 0 12px; } h2 { font-size: 20px; margin: 20px 0 10px; }
        h3 { font-size: 18px; margin: 16px 0 8px; } h4 { font-size: 16px; margin: 14px 0 6px; }
        h5 { font-size: 15px; margin: 12px 0 6px; } h6 { font-size: 14px; margin: 10px 0 4px; }
        p { margin-bottom: 10px; } ul, ol { margin-left: 20px; margin-bottom: 10px; }
        li { margin-bottom: 4px; } a { color: #1677ff; }
        blockquote { border-left: 3px solid #d9d9d9; padding-left: 12px; color: #666; margin: 10px 0; }
        code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; font-size: 13px; }
        pre { background: #f5f5f5; padding: 12px; border-radius: 6px; overflow-x: auto; }
        hr { border: none; border-top: 1px solid #e8e8e8; margin: 16px 0; }
      </style></head><body>${params.content}</body></html>`
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
      const pdfData = await win.webContents.printToPDF({ printBackground: true })
      await writeFile(result.filePath, pdfData)
      win.close()
      return { filePath: result.filePath }
    } catch (err: any) {
      logError('export-knowledge-pdf', err)
      return { error: `导出失败: ${err.message}` }
    }
  })

  // 批量导出知识文档
  ipcMain.handle('batch-export-knowledge', async (_event, params: {
    docIds: string[]
    format: 'md' | 'txt' | 'pdf'
  }) => {
    try {
      const result = await dialog.showOpenDialog({
        title: '选择导出文件夹',
        properties: ['openDirectory']
      })

      if (result.canceled || !result.filePaths[0]) return { canceled: true }

      const targetDir = result.filePaths[0]
      let success = 0
      let failed = 0
      const errors: Array<{ id: string; name: string; error: string }> = []

      for (const docId of params.docIds) {
        try {
          const doc = await getKnowledgeDoc(docId)

          // 只导出 completed 状态的文档
          if (doc?.status !== 'completed') {
            errors.push({ id: docId, name: doc?.title || docId, error: '文档未完成' })
            failed++
            continue
          }

          const fileName = getUniqueFileName(targetDir, doc.title, params.format)
          const filePath = join(targetDir, fileName)

          // 根据格式导出
          if (params.format === 'pdf') {
            const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
            const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
              body { font-family: "Microsoft YaHei", "PingFang SC", sans-serif; padding: 40px; line-height: 1.8; color: #333; }
              h1 { font-size: 24px; margin: 24px 0 12px; } h2 { font-size: 20px; margin: 20px 0 10px; }
              h3 { font-size: 18px; margin: 16px 0 8px; } h4 { font-size: 16px; margin: 14px 0 6px; }
              h5 { font-size: 15px; margin: 12px 0 6px; } h6 { font-size: 14px; margin: 10px 0 4px; }
              p { margin-bottom: 10px; } ul, ol { margin-left: 20px; margin-bottom: 10px; }
              li { margin-bottom: 4px; } a { color: #1677ff; }
              blockquote { border-left: 3px solid #d9d9d9; padding-left: 12px; color: #666; margin: 10px 0; }
              code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; font-size: 13px; }
              pre { background: #f5f5f5; padding: 12px; border-radius: 6px; overflow-x: auto; }
              hr { border: none; border-top: 1px solid #e8e8e8; margin: 16px 0; }
            </style></head><body>${doc.content}</body></html>`
            await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
            const pdfData = await win.webContents.printToPDF({ printBackground: true })
            await writeFile(filePath, pdfData)
            win.close()
          } else if (params.format === 'md') {
            const md = htmlToMarkdown(doc.content)
            await writeFile(filePath, md, 'utf-8')
          } else {
            const plainText = htmlToPlainText(doc.content)
            await writeFile(filePath, plainText, 'utf-8')
          }

          success++
        } catch (err: any) {
          errors.push({ id: docId, name: '未知', error: err.message })
          failed++
        }
      }

      return { success, failed, errors, targetDir }
    } catch (err: any) {
      logError('batch-export-knowledge', err)
      return { error: err.message || '批量导出失败' }
    }
  })
}

// HTML → Markdown 转换
function htmlToMarkdown(html: string): string {
  return html
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n')
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n')
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n')
    .replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n')
    .replace(/<h5[^>]*>(.*?)<\/h5>/gi, '##### $1\n\n')
    .replace(/<h6[^>]*>(.*?)<\/h6>/gi, '###### $1\n\n')
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
    .replace(/<u[^>]*>(.*?)<\/u>/gi, '$1')
    .replace(/<s[^>]*>(.*?)<\/s>/gi, '~~$1~~')
    .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
    .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
    .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
    .replace(/<\/?(?:ul|ol)[^>]*>/gi, '\n')
    .replace(/<blockquote[^>]*><p[^>]*>(.*?)<\/p><\/blockquote>/gi, '> $1\n\n')
    .replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, '> $1\n\n')
    .replace(/<hr[^>]*\/?>/gi, '---\n\n')
    .replace(/<br[^>]*\/?>/gi, '\n')
    .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// HTML → 纯文本
function htmlToPlainText(html: string): string {
  return html
    .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, '$1\n\n')
    .replace(/<li[^>]*>(.*?)<\/li>/gi, '  - $1\n')
    .replace(/<\/?(?:ul|ol)[^>]*>/gi, '\n')
    .replace(/<br[^>]*\/?>/gi, '\n')
    .replace(/<hr[^>]*\/?>/gi, '\n---\n')
    .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
    .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
