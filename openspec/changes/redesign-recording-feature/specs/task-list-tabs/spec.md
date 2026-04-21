## ADDED Requirements

### Requirement: Display tabs in task list area
The system SHALL display tabs to separate realtime recordings and file upload tasks.

#### Scenario: Tab structure
- **WHEN** user views main page
- **THEN** system displays two tabs: "实时录音" and "文件上传"

### Requirement: Preserve feature cards
The system SHALL keep the existing feature cards above the task list area.

#### Scenario: Feature cards position
- **WHEN** main page loads
- **THEN** system displays three feature cards (实时录音, 上传音视频, 实时字幕) above the tabs

### Requirement: Show realtime recordings in first tab
The system SHALL display realtime recording records in the "实时录音" tab.

#### Scenario: Realtime recordings tab
- **WHEN** user selects "实时录音" tab
- **THEN** system displays table with columns: 标题, 时间, 时长, 字数, 操作

### Requirement: Show file tasks in second tab
The system SHALL display file upload tasks in the "文件上传" tab.

#### Scenario: File upload tab
- **WHEN** user selects "文件上传" tab
- **THEN** system displays existing task table

### Requirement: Remember active tab
The system SHALL remember which tab was active when user returns to main page.

#### Scenario: Tab persistence
- **WHEN** user navigates away and returns
- **THEN** system displays the previously active tab

### Requirement: Provide recording operations
The system SHALL provide operations for each recording record in the table.

#### Scenario: Recording operations menu
- **WHEN** user clicks operations button on a recording
- **THEN** system shows menu with: 下载 WAV, 导出 TXT, 精准校对, 删除
