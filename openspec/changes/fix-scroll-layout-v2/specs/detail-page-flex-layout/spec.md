## ADDED Requirements

### Requirement: 详情页左右分栏高度确定
TaskDetailPage 主体区 SHALL 使用纯 flex 布局实现左右固定比例分栏（左 58%，右 42%），两侧均获得确定的像素高度，不依赖 antd 栅格组件。

#### Scenario: 左右分栏填满剩余高度
- **WHEN** 详情页加载完成
- **THEN** Header 下方主体区撑满页面剩余高度，左右两栏等高

#### Scenario: 窗口缩放后比例不变
- **WHEN** 用户调整应用窗口大小
- **THEN** 左右分栏比例保持 58:42，内容区高度跟随窗口变化

### Requirement: TranscriptPanel 内部滚动
左侧 TranscriptPanel 区域 SHALL 在高度确定的容器内滚动，音频播放器固定在顶部不随内容滚动。

#### Scenario: 转写内容超出可视高度时滚动
- **WHEN** 转写内容超出左侧面板可视高度
- **THEN** 转写区域内部出现滚动，音频播放器保持固定在左侧顶部

### Requirement: AiPanel tab 切换不跳高
AiPanel 各 tab（摘要/发言人/纪要/问答/提问）切换时 SHALL NOT 引起面板高度变化，每个 tab 内容区在面板固定高度内滚动。

#### Scenario: 切换 tab 面板高度不变
- **WHEN** 用户点击 AiPanel 内的不同 tab 标签
- **THEN** 右侧面板整体高度保持不变，tab 内容区在面板内部滚动

#### Scenario: 内容超出 tab 可视区时滚动
- **WHEN** 某个 tab 的内容高度超出面板可用高度
- **THEN** 该 tab 内容区出现纵向滚动
