## ADDED Requirements

### Requirement: Show confirmation dialog on stop
The system SHALL display a confirmation dialog when user clicks stop button or back button during recording.

#### Scenario: Stop button clicked
- **WHEN** user clicks "停止" button
- **THEN** system displays confirmation dialog with title "确定结束录音？"

#### Scenario: Back button clicked during recording
- **WHEN** user clicks back button while recording is active
- **THEN** system displays confirmation dialog

### Requirement: Provide proofreading option
The system SHALL provide a checkbox option to enable precise proofreading in the confirmation dialog.

#### Scenario: Default state
- **WHEN** confirmation dialog opens
- **THEN** "开启精准校对（推荐）" checkbox is checked by default

#### Scenario: Proofreading description
- **WHEN** dialog displays
- **THEN** system shows explanation text about proofreading benefits

### Requirement: Provide three action buttons
The system SHALL provide three action buttons in the confirmation dialog: discard, continue, and finish.

#### Scenario: Button layout
- **WHEN** dialog displays
- **THEN** system shows "不保存" (gray), "继续录音" (white), and "结束录音" (blue primary) buttons

### Requirement: Handle discard action
The system SHALL discard all recording data when user clicks "不保存".

#### Scenario: Discard recording
- **WHEN** user clicks "不保存" button
- **THEN** system discards audio data, closes dialog, and returns to main page

### Requirement: Handle continue action
The system SHALL resume recording when user clicks "继续录音".

#### Scenario: Continue recording
- **WHEN** user clicks "继续录音" button
- **THEN** system closes dialog and returns to recording state

### Requirement: Handle finish action
The system SHALL save recording when user clicks "结束录音".

#### Scenario: Finish without proofreading
- **WHEN** user clicks "结束录音" with proofreading unchecked
- **THEN** system saves recording record and returns to main page

#### Scenario: Finish with proofreading
- **WHEN** user clicks "结束录音" with proofreading checked
- **THEN** system saves recording record, creates analysis task, and returns to main page

### Requirement: Show close button
The system SHALL provide a close button (×) in the dialog header.

#### Scenario: Close button behavior
- **WHEN** user clicks × button
- **THEN** system closes dialog and returns to recording state (same as "继续录音")
