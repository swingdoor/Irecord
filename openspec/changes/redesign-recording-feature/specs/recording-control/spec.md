## ADDED Requirements

### Requirement: Manual recording start
The system SHALL require user to manually click start button to begin recording.

#### Scenario: Manual start
- **WHEN** user enters recording page
- **THEN** system displays "开始" button and waits for user action

### Requirement: Pause recording
The system SHALL allow user to temporarily pause recording without ending the session.

#### Scenario: Pause action
- **WHEN** user clicks "暂停" button during recording
- **THEN** system stops audio input and recognition, displays "继续" button

#### Scenario: Resume after pause
- **WHEN** user clicks "继续" button
- **THEN** system resumes audio input and recognition from current time

### Requirement: Discard audio during pause
The system SHALL NOT store or process audio data during pause period.

#### Scenario: Pause behavior
- **WHEN** recording is paused
- **THEN** system discards incoming audio data and does not send to recognition engine

### Requirement: Exclude pause duration
The system SHALL exclude pause duration from total recording time.

#### Scenario: Duration calculation
- **WHEN** user pauses and resumes recording
- **THEN** system only counts active recording time in total duration

### Requirement: Stop recording
The system SHALL display confirmation dialog when user clicks stop button.

#### Scenario: Stop action
- **WHEN** user clicks "停止" button
- **THEN** system displays confirmation dialog with save options
