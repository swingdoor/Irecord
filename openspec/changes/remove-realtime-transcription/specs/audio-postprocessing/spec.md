## ADDED Requirements

### Requirement: 后处理开关项
系统 SHALL 提供以下可独立勾选的录音后处理开关：降噪、静音裁剪、响度归一、压缩编码、保留原始 WAV。

#### Scenario: 默认全部关闭则不处理
- **WHEN** 用户未勾选任何开关且停止录音
- **THEN** 系统直接使用原始 WAV 作为成品，不调用 ffmpeg

#### Scenario: 部分勾选
- **WHEN** 用户仅勾选"压缩编码"
- **THEN** 系统对原始 WAV 仅执行编码转换为 M4A/MP3，不应用任何音频滤镜

### Requirement: 全局默认与本次覆盖
系统 SHALL 在设置中提供后处理默认配置；录音停止面板可在不修改全局默认的前提下临时覆盖本次开关。

#### Scenario: 全局默认应用于新录音
- **WHEN** 用户打开录音 Modal
- **THEN** 后处理面板各开关初始值与设置中的全局默认一致

#### Scenario: 本次覆盖不持久化
- **WHEN** 用户在录音面板临时改动开关并完成本次录音
- **THEN** 全局默认不被改写，下次新录音仍使用原值

#### Scenario: 修改全局默认
- **WHEN** 用户在设置页修改后处理默认值
- **THEN** 后续新录音的面板初始值采用新默认

### Requirement: 单条 ffmpeg 滤镜链
系统 SHALL 将所有勾选的音频处理项合并为一条 ffmpeg 命令的滤镜链，按"降噪 → 静音裁剪 → 响度归一"顺序应用，并在同一次进程中完成编码输出。

#### Scenario: 多项勾选合并执行
- **WHEN** 用户勾选降噪、响度归一与压缩编码
- **THEN** 系统执行单条 ffmpeg 命令，-af 同时包含 afftdn 与 loudnorm，-c:a 指定为目标编码器

#### Scenario: 滤镜顺序固定
- **WHEN** 用户勾选静音裁剪与响度归一
- **THEN** 滤镜链顺序为 silenceremove 在前、loudnorm 在后

### Requirement: 输出格式
系统 SHALL 在勾选"压缩编码"时将成品输出为 M4A（AAC）或 MP3（用户在设置中可选），未勾选时输出仍为 WAV。

#### Scenario: 默认压缩格式
- **WHEN** 用户首次启用压缩
- **THEN** 默认编码为 M4A（AAC 64kbps），文件后缀 .m4a

#### Scenario: 切换压缩格式
- **WHEN** 用户在设置中将压缩格式切换为 MP3
- **THEN** 后续录音的压缩成品后缀为 .mp3，编码器为 libmp3lame

### Requirement: 异步执行与进度反馈
系统 SHALL 异步执行后处理流水线，并通过 IPC 向 Renderer 进程推送进度，期间不阻塞 UI。

#### Scenario: 推送进度
- **WHEN** ffmpeg 处理进行中
- **THEN** Main 进程根据 ffmpeg 输出周期性推送 { progress: 0..1 } 到 Renderer

#### Scenario: 处理失败回退
- **WHEN** ffmpeg 退出码非 0 或异常终止
- **THEN** 系统保留原始 WAV，向 Renderer 推送错误事件，结果展示界面允许"使用原始/重试"

#### Scenario: 处理成功
- **WHEN** ffmpeg 正常完成
- **THEN** 系统返回成品文件路径，更新录音记录的 filePath 与 fileSize

### Requirement: 原始文件保留策略
系统 SHALL 根据"保留原始 WAV"开关决定是否在后处理完成后删除原始 WAV。

#### Scenario: 不保留原始
- **WHEN** 用户取消勾选"保留原始 WAV"且后处理成功产出成品
- **THEN** 系统删除原始 WAV，仅保留成品文件，录音记录指向成品路径

#### Scenario: 保留原始
- **WHEN** 用户勾选"保留原始 WAV"
- **THEN** 原始 WAV 与成品文件同时保留，录音记录主路径指向成品，并记录原始路径以便回溯

#### Scenario: 后处理失败不删原始
- **WHEN** 后处理失败
- **THEN** 无论"保留原始"开关取值，原始 WAV 都不被删除

### Requirement: ffmpeg 复用与错误处理
系统 SHALL 复用既有打包的 ffmpeg/ffprobe（src/main/audio/ffmpeg.ts），不引入新二进制依赖；若 ffmpeg 不可用则降级为不进行后处理并提示用户。

#### Scenario: ffmpeg 缺失降级
- **WHEN** 系统启动时检测到 ffmpeg 二进制缺失
- **THEN** 后处理面板的所有开关呈禁用态并提示"ffmpeg 不可用，将仅保存原始 WAV"
