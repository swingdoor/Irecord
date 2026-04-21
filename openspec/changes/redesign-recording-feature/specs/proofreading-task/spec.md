## ADDED Requirements

### Requirement: Create proofreading task from recording
The system SHALL create a file analysis task using the recording's WAV file when user enables proofreading.

#### Scenario: Proofreading from confirmation dialog
- **WHEN** user clicks "结束录音" with "精准校对" enabled
- **THEN** system creates a task in tasks table with filePath pointing to the recording WAV, modelType set to default model, and status set to "pending"

#### Scenario: Proofreading from recording list
- **WHEN** user clicks "精准校对" in recording list operations menu
- **THEN** system creates a file analysis task and switches to "文件上传" tab

#### Scenario: Proofreading from detail page
- **WHEN** user clicks "精准校对" button on recording detail page
- **THEN** system creates a file analysis task and navigates to "文件上传" tab

### Requirement: Start task queue after proofreading
The system SHALL automatically start the task processing queue after creating a proofreading task.

#### Scenario: Queue start
- **WHEN** proofreading task is created
- **THEN** system starts task queue to process the new task

### Requirement: Share WAV file between recording and task
The system SHALL use the same WAV file for both the recording record and the proofreading task.

#### Scenario: File sharing
- **WHEN** proofreading task is created
- **THEN** task's filePath points to the same WAV file as the recording record
