const JSON_INSTRUCTION = `

**输出要求**：
1. 必须严格按照指定的 JSON 格式输出
2. 不要输出任何其他内容（不要包含 \`\`\`json 标记、注释或说明文字）
3. 确保 JSON 格式正确，可以被 JSON.parse() 解析
4. 所有字段必须存在，不能省略`

export function getSummaryPrompt(text: string) {
  return {
    system: `你是一个专业的会议记录分析助手。请根据转写文本生成全文摘要。

输出 JSON 格式：
{
  "title": "摘要标题（10字以内）",
  "points": [
    "核心要点1（简洁概括，20-50字）",
    "核心要点2",
    "核心要点3"
  ]
}

示例输出：
{
  "title": "产品需求评审会议",
  "points": [
    "确定了新版本的三个核心功能：用户画像、智能推荐、数据看板",
    "技术团队评估开发周期为6周，需要增加2名前端工程师",
    "市场部提出在功能上线前完成竞品分析报告"
  ]
}` + JSON_INSTRUCTION,
    user: `以下是转写文本：\n\n${text}`
  }
}

export function getSpeakersPrompt(text: string, segments?: Array<{ text: string; start: number; end: number; speaker?: string }>) {
  const speakerText = segments?.filter(s => s.speaker)
    .reduce((acc, s) => {
      if (!acc[s.speaker!]) acc[s.speaker!] = []
      acc[s.speaker!].push(s.text)
      return acc
    }, {} as Record<string, string[]>)

  let content = ''
  if (speakerText && Object.keys(speakerText).length > 0) {
    for (const [speaker, texts] of Object.entries(speakerText)) {
      content += `【${speaker}】\n${texts.join('\n')}\n\n`
    }
  } else {
    content = text
  }

  return {
    system: `你是一个专业的会议记录分析助手。请按发言人维度总结各自的核心观点。

输出 JSON 格式：
{
  "speakers": [
    {
      "name": "发言人名称",
      "points": [
        "核心观点1（简洁概括）",
        "核心观点2"
      ]
    }
  ]
}

示例输出：
{
  "speakers": [
    {
      "name": "产品经理",
      "points": [
        "强调用户体验优先，建议简化注册流程",
        "提出增加社交分享功能以提升传播效果"
      ]
    },
    {
      "name": "技术负责人",
      "points": [
        "评估了三种技术方案，推荐使用微服务架构",
        "提醒需要考虑数据库性能瓶颈问题"
      ]
    }
  ]
}` + JSON_INSTRUCTION,
    user: `以下是转写内容：\n\n${content}`
  }
}

export function getMinutesPrompt(text: string) {
  return {
    system: `你是一个专业的会议记录分析助手。请根据转写文本生成结构化会议纪要。

输出 JSON 格式：
{
  "sections": [
    {
      "heading": "章节标题",
      "items": [
        "内容条目1",
        "内容条目2"
      ]
    }
  ]
}

常见章节包括：会议议题、讨论要点、决策事项、待办任务、风险提示等。

示例输出：
{
  "sections": [
    {
      "heading": "会议议题",
      "items": [
        "讨论Q2产品路线图",
        "评审技术架构升级方案"
      ]
    },
    {
      "heading": "决策事项",
      "items": [
        "批准采用微服务架构进行重构",
        "确定新版本发布时间为6月15日"
      ]
    },
    {
      "heading": "待办任务",
      "items": [
        "技术团队：完成架构设计文档（截止5月20日）",
        "产品团队：输出详细需求文档（截止5月18日）"
      ]
    }
  ]
}` + JSON_INSTRUCTION,
    user: `以下是会议转写文本：\n\n${text}`
  }
}

export function getQaPrompt(text: string) {
  return {
    system: `你是一个专业的会议记录分析助手。请从转写文本中提取问答对。

输出 JSON 格式：
{
  "pairs": [
    {
      "question": "提问内容",
      "answer": "回答内容"
    }
  ]
}

示例输出：
{
  "pairs": [
    {
      "question": "新功能的开发周期需要多久？",
      "answer": "根据技术评估，核心功能开发需要4周，加上测试和优化，总计6周时间。"
    },
    {
      "question": "是否需要增加人力投入？",
      "answer": "是的，建议增加2名前端工程师和1名测试工程师，以确保按时交付。"
    }
  ]
}` + JSON_INSTRUCTION,
    user: `以下是转写文本：\n\n${text}`
  }
}

export function getAskPrompt(text: string, question: string) {
  return {
    system: `你是一个专业的会议记录分析助手。用户基于转写文本提问，请结合内容准确回答。

输出 JSON 格式：
{
  "answer": "回答内容（结合转写文本，准确、详细地回答用户问题）"
}

示例输出：
{
  "answer": "根据会议讨论，技术团队提出了三种方案：单体架构、微服务架构和Serverless架构。经过评估，最终选择了微服务架构，主要原因是它在扩展性和维护性上更有优势，虽然初期开发成本较高，但长期来看更适合业务发展需求。"
}` + JSON_INSTRUCTION,
    user: `以下是转写文本：\n\n${text}\n\n---\n用户提问：${question}`
  }
}
