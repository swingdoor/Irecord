## ADDED Requirements

### Requirement: Automatic data migration
The system SHALL automatically migrate existing records to the new file management model on database initialization.

#### Scenario: Migrate existing realtime recordings
- **WHEN** database initializes and finds realtime_recordings with filePath but no fileId
- **THEN** system registers each file and sets the fileId on the recording record

#### Scenario: Migrate existing tasks
- **WHEN** database initializes and finds tasks with filePath but no fileId
- **THEN** system registers each file (or reuses existing file ID if path matches) and sets the fileId on the task record

#### Scenario: Shared file detection during migration
- **WHEN** a task and a recording reference the same filePath during migration
- **THEN** system creates one managed_files entry and two file_references entries

#### Scenario: Skip already migrated records
- **WHEN** database initializes and a record already has a fileId
- **THEN** system skips that record without re-registering

#### Scenario: Handle missing files during migration
- **WHEN** migrating a record whose filePath does not exist on disk
- **THEN** system registers the file entry with fileSize 0 and logs a warning
