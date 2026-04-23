## ADDED Requirements

### Requirement: Settings tabs are grouped by function
The settings modal SHALL organize configuration items into 5 tabs: 基础设置, 实时录音, 文件识别, LLM 配置, 快捷键.

#### Scenario: Open settings modal
- **WHEN** user opens the settings modal
- **THEN** the modal displays 5 tabs in order: 基础设置, 实时录音, 文件识别, LLM 配置, 快捷键

### Requirement: Basic settings tab contains path configuration only
The 基础设置 tab SHALL contain only the model folder path and FFmpeg folder path fields.

#### Scenario: View basic settings
- **WHEN** user selects the 基础设置 tab
- **THEN** the tab shows model folder path and FFmpeg folder path inputs with folder selection buttons

### Requirement: File recognition tab contains model and ASR parameters
The 文件识别 tab SHALL contain the default model selector, default strategy selector, and all ASR parameter fields.

#### Scenario: View file recognition settings
- **WHEN** user selects the 文件识别 tab
- **THEN** the tab shows default model, default strategy, clustering threshold, VAD threshold, min silence duration, min speech duration, max segment duration, and max file duration

### Requirement: Shortcut tab displays current shortcut
The 快捷键 tab SHALL display the current global recording shortcut key.

#### Scenario: View shortcut settings
- **WHEN** user selects the 快捷键 tab
- **THEN** the tab shows the current shortcut key (Ctrl+Shift+R) as read-only display
