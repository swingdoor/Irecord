## ADDED Requirements

### Requirement: Auto-navigate to upload tab after file task submission
When the user successfully adds file transcription tasks (via file picker or drag-and-drop), the system SHALL automatically switch the active tab to "文件上传" (upload).

#### Scenario: Files added via file picker
- **WHEN** user clicks the upload button and selects files, and at least one task is created successfully
- **THEN** the active tab SHALL switch to "upload"

#### Scenario: Files added via drag-and-drop
- **WHEN** user drops files onto the page, and at least one task is created successfully
- **THEN** the active tab SHALL switch to "upload"

#### Scenario: No files selected or all files rejected
- **WHEN** user cancels the file picker or all dropped files fail validation
- **THEN** the active tab SHALL NOT change

### Requirement: Auto-navigate to knowledge tab after knowledge doc creation
When the user successfully creates a knowledge document, the system SHALL automatically switch the active tab to "知识整理" (knowledge). This behavior already exists and SHALL be preserved.

#### Scenario: Knowledge doc created successfully
- **WHEN** user submits the create-doc modal and a document is created
- **THEN** the active tab SHALL switch to "knowledge"
