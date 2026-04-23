## ADDED Requirements

### Requirement: Floating recorder window remains visible during recording
The system SHALL show a dedicated floating recorder window in the top-right area of the primary display work area while a floating recording session is active.

#### Scenario: Show window at start of floating recording
- **WHEN** the user starts floating recording via the global shortcut
- **THEN** the system opens a floating recorder window positioned near the top-right of the primary display work area

#### Scenario: Keep window above normal application windows
- **WHEN** the floating recorder window is open during recording
- **THEN** the system keeps the window always on top of normal application windows

### Requirement: Floating recorder window displays live recording status
The floating recorder window SHALL display the current recording state, elapsed duration, and live transcription content for the active floating recording session.

#### Scenario: Show active recording information
- **WHEN** a floating recording session is active
- **THEN** the window shows that recording is in progress, the elapsed recording duration, and the latest live transcription content

#### Scenario: Update transcription while recording
- **WHEN** new real-time transcription segments are produced during floating recording
- **THEN** the window appends the new transcription content and keeps the newest content visible

### Requirement: Floating recorder window supports manual controls
The floating recorder window SHALL provide controls for pause, resume, and stop during a floating recording session.

#### Scenario: Pause recording from floating window
- **WHEN** the user clicks the pause control while floating recording is active
- **THEN** the system pauses audio capture and updates the window to show paused state

#### Scenario: Resume recording from floating window
- **WHEN** the user clicks the resume control while floating recording is paused
- **THEN** the system resumes audio capture and updates the window to show recording state

#### Scenario: Stop recording from floating window
- **WHEN** the user clicks the stop control while floating recording is active or paused
- **THEN** the system stops recording and switches the window to save dialog mode

### Requirement: Floating recorder window can be repositioned during a session
The floating recorder window SHALL be draggable by the user during a floating recording session.

#### Scenario: Drag floating window
- **WHEN** the user drags the floating recorder window by its draggable area
- **THEN** the window moves to the user-selected position for the remainder of the current session