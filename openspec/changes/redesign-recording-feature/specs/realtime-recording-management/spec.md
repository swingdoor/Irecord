## ADDED Requirements

### Requirement: Create realtime recording record
The system SHALL create a new realtime recording record when user completes a recording session.

#### Scenario: Successful recording creation
- **WHEN** user clicks "结束录音" in confirmation dialog
- **THEN** system creates a record with title, timestamp, duration, word count, audio file path, text, and segments

#### Scenario: Recording with proofreading enabled
- **WHEN** user clicks "结束录音" with "精准校对" checkbox enabled
- **THEN** system creates both a realtime recording record and a file analysis task

### Requirement: Store recording data
The system SHALL store realtime recording data in a separate database table named realtime_recordings.

#### Scenario: Database schema
- **WHEN** system initializes database
- **THEN** realtime_recordings table contains fields: id, title, filePath, fileSize, duration, wordCount, createdAt, text, segments

### Requirement: Query recording records
The system SHALL allow querying all realtime recording records ordered by creation time.

#### Scenario: List all recordings
- **WHEN** user opens "实时录音" tab
- **THEN** system displays all recordings sorted by newest first

### Requirement: Delete recording record
The system SHALL allow users to delete a realtime recording record.

#### Scenario: Delete with confirmation
- **WHEN** user clicks delete button and confirms
- **THEN** system removes the database record and optionally deletes the WAV file

### Requirement: Export recording as WAV
The system SHALL allow users to download the original WAV file.

#### Scenario: Download WAV file
- **WHEN** user clicks "下载 WAV" button
- **THEN** system opens save dialog with the WAV file

### Requirement: Export recording as TXT
The system SHALL allow users to export the transcription as a text file.

#### Scenario: Export with timestamps
- **WHEN** user clicks "导出 TXT" button
- **THEN** system exports text file with timestamps and segment content

### Requirement: Generate unique recording title
The system SHALL generate unique recording titles using timestamp format.

#### Scenario: Title generation
- **WHEN** user starts a new recording
- **THEN** system generates title as "语音_YYYYMMDDHHmmss" (14 digits)
