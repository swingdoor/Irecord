# 本地 MCP 服务

iRecord 可选提供本地 MCP（Model Context Protocol）服务，让同一台电脑上的 Agent 复用录音发现、文件转写和知识文档整理流程。服务默认关闭，只监听 `127.0.0.1`，并且仅在 iRecord 运行期间可用。

## 启用与连接

1. 打开 **设置 → MCP 服务**。
2. 开启服务，等待状态显示“运行中”。
3. 点击地址右侧的 **复制**，粘贴到 Agent 的 MCP 服务地址输入框。

完整地址形如：

```text
http://127.0.0.1:17631/mcp/<token>
```

token 由 iRecord 首次启用时生成并保存在应用本地数据目录中，不使用系统钥匙串。关闭服务、重新开启或重启应用后，地址都会保持不变。只有用户在设置页确认点击 **刷新地址** 时，iRecord 才会生成并保存新 token，旧地址立即失效。服务使用无状态 Streamable HTTP，不支持 stdio，也不提供旧版 `/sse` 接口。

## 可用工具

服务固定提供以下九个工具：

| 工具 | 用途 |
|---|---|
| `irecord_list_recordings` | 分页查询已保存录音的元数据，不返回音频或托管路径 |
| `irecord_transcribe_recording` | 根据录音 ID 创建转写任务 |
| `irecord_transcribe_file` | 根据一个明确的本地媒体文件绝对路径创建转写任务 |
| `irecord_list_transcriptions` | 分页查询转写任务及状态 |
| `irecord_get_transcription` | 轮询任务，并分块读取完成后的转写文本 |
| `irecord_list_templates` | 分页查询知识整理模板 |
| `irecord_create_document` | 使用 1-20 个已完成转写和一个模板创建知识文档 |
| `irecord_list_documents` | 分页查询知识文档及状态 |
| `irecord_get_document` | 轮询文档，并分块读取纯文本或 HTML 内容 |

初始版本不提供删除、设置修改、凭据读取、模型下载、麦克风控制、文件导出或 SQL 工具。

## 异步任务与轮询

转写和知识文档生成不会占住一次 MCP 调用等待完成。创建工具会立即返回 `task_id` 或 `document_id`，Agent 随后调用 `irecord_get_transcription` 或 `irecord_get_document` 轮询。

列表默认每页 20 条、最多 100 条；正文默认每块 12,000 字符、最多 50,000 字符。返回 `next_cursor` 时，把它原样传入下一次调用。创建工具支持可选的 `request_id`，十分钟内的相同重试不会重复创建任务。

## 安全说明

- 新地址使用 128 位随机 token（Base64URL 编码后 22 个字符）并保存在 iRecord 本地数据目录，仅供当前系统用户使用。旧版本已经生成的长 token 不会自动变化，主动刷新地址后才会换成短 token。
- 服务校验 Host、Origin、请求体大小和请求频率，不启用宽松 CORS。
- `irecord_transcribe_file` 能读取当前系统用户有权访问的一个媒体文件。只把可信、明确的绝对路径交给 Agent，并在 MCP 客户端中保留工具调用确认。
- 审计日志只记录时间、客户端元数据、工具名、耗时和结果，不记录 token、工具参数、转写文本、文档正文或完整本地路径。

## 常见问题

**状态显示“启动失败”**

默认端口 `17631` 可能被其他程序占用。释放该端口后关闭再重新开启 MCP 服务。

**Agent 返回 401**

重新从设置页复制完整地址，确保 `/mcp/<token>` 没有被截断。如果刚刷新过地址，需要同步更新 Agent 配置。

**Agent 无法连接**

确认设置页为“运行中”，iRecord 没有退出，并且 Agent 与 iRecord 在同一台电脑上。服务不会监听局域网地址。

**任务一直处于 pending/processing**

在 iRecord 的录音转写列表查看模型、FFmpeg 和任务错误。MCP 复用桌面端同一队列和模型配置，不另建识别引擎。

**应用退出后还能调用吗？**

不能。MCP 是 iRecord 的另一个操作入口，应用退出时监听器会关闭。
