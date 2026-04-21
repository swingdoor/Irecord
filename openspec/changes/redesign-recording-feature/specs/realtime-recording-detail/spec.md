## ADDED Requirements

### Requirement: Display recording detail page
The system SHALL display a detail page for realtime recording records using the same layout as task detail page.

#### Scenario: Page layout
- **WHEN** user clicks "查看" on a recording record
- **THEN** system displays page with header, left panel (audio player + transcript), and right panel (AI analysis)

### Requirement: Show recording metadata
The system SHALL display recording metadata in the header.

#### Scenario: Header information
- **WHEN** detail page loads
- **THEN** system shows title, creation date, word count, and duration

### Requirement: Provide action buttons
The system SHALL provide export and proofreading action buttons in the header.

#### Scenario: Action buttons
- **WHEN** detail page loads
- **THEN** system displays "导出" and "精准校对" buttons

### Requirement: Display audio player
The system SHALL display an audio player in the left panel for playback.

#### Scenario: Audio playback
- **WHEN** user clicks play button
- **THEN** system plays the WAV file with progress bar and time display

### Requirement: Display transcript with timestamps
The system SHALL display transcribed text with timestamps in the left panel.

#### Scenario: Transcript display
- **WHEN** detail page loads
- **THEN** system shows all segments with format "HH:MM:SS - 识别内容"

#### Scenario: Seek on click
- **WHEN** user clicks on a transcript segment
- **THEN** system seeks audio player to that timestamp

### Requirement: Provide AI analysis panel
The system SHALL provide AI analysis features in the right panel.

#### Scenario: AI features
- **WHEN** detail page loads
- **THEN** system displays buttons for "生成摘要", "识别说话人", "生成会议纪要", "智能问答"

#### Scenario: AI analysis results
- **WHEN** user triggers AI analysis
- **THEN** system displays results in the right panel (same as task detail page)

### Requirement: Support proofreading from detail page
The system SHALL allow users to create proofreading task from the detail page.

#### Scenario: Create proofreading task
- **WHEN** user clicks "精准校对" button
- **THEN** system creates a file analysis task and navigates to "文件上传" tab

### Requirement: Reuse existing components
The system SHALL reuse AudioPlayer, TranscriptPanel, and AiPanel components from task detail page.

#### Scenario: Component reuse
- **WHEN** detail page renders
- **THEN** system uses the same components as TaskDetailPage for consistent UI
