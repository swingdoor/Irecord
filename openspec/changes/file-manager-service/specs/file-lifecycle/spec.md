## ADDED Requirements

### Requirement: File registration
The system SHALL register audio files into the managed file system when they are created or uploaded, assigning a unique file ID and establishing the initial reference.

#### Scenario: Register new realtime recording file
- **WHEN** realtime recording engine creates a WAV file
- **THEN** system registers the file with owner type 'recording' and returns a file ID

#### Scenario: Register uploaded file
- **WHEN** user uploads an audio file for transcription
- **THEN** system registers the file with owner type 'task' and returns a file ID

#### Scenario: Duplicate file path registration
- **WHEN** attempting to register a file path that already exists in managed_files
- **THEN** system returns the existing file ID without creating a duplicate entry

### Requirement: Reference management
The system SHALL track all references to managed files through a reference table, allowing multiple owners to share the same file.

#### Scenario: Add reference to existing file
- **WHEN** creating a proofreading task from a realtime recording
- **THEN** system adds a new reference with owner type 'task' without duplicating the file

#### Scenario: Remove reference on deletion
- **WHEN** user deletes a task or recording
- **THEN** system removes the corresponding file reference but preserves the file if other references exist

#### Scenario: Query file references
- **WHEN** checking if a file can be safely deleted
- **THEN** system returns all active references (owner IDs and types)

### Requirement: Orphan file cleanup
The system SHALL automatically identify and delete files that have no active references.

#### Scenario: Cleanup on application startup
- **WHEN** application starts
- **THEN** system scans for files with zero references and deletes them from both database and filesystem

#### Scenario: Manual cleanup trigger
- **WHEN** administrator triggers manual cleanup
- **THEN** system reports the number of files deleted and space freed

#### Scenario: Preserve files with references
- **WHEN** cleanup runs and a file has at least one active reference
- **THEN** system skips that file and does not delete it

### Requirement: File metadata tracking
The system SHALL store file metadata including path, size, MIME type, and access timestamps.

#### Scenario: Record file size on registration
- **WHEN** registering a file
- **THEN** system reads and stores the actual file size in bytes

#### Scenario: Update last accessed timestamp
- **WHEN** file is accessed for playback
- **THEN** system updates the lastAccessedAt field

#### Scenario: Infer MIME type from extension
- **WHEN** registering a file with .wav extension
- **THEN** system sets mimeType to 'audio/wav'

### Requirement: File integrity verification
The system SHALL detect and report inconsistencies between database records and filesystem state.

#### Scenario: Detect missing files
- **WHEN** verification runs and a managed file's path does not exist on disk
- **THEN** system reports the file ID and path as missing

#### Scenario: Detect broken references
- **WHEN** verification runs and a reference points to a non-existent file ID
- **THEN** system reports the broken reference with owner details

#### Scenario: Successful integrity check
- **WHEN** all managed files exist on disk and all references are valid
- **THEN** system reports zero issues
