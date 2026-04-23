## ADDED Requirements

### Requirement: Save dialog appears immediately after floating recording stops
The system SHALL replace the floating recorder content with a save dialog immediately after a floating recording session stops.

#### Scenario: Show save dialog after shortcut stop
- **WHEN** the user stops floating recording with the global shortcut
- **THEN** the floating window shows a save dialog without opening a separate window

#### Scenario: Show save dialog after stop button
- **WHEN** the user stops floating recording with the stop control in the floating window
- **THEN** the floating window shows a save dialog without opening a separate window

### Requirement: Save dialog supports optional proofreading task creation
The save dialog SHALL allow the user to choose whether saving the recording also creates a proofreading task.

#### Scenario: Save with proofreading task
- **WHEN** the save dialog is visible, the user enables the proofreading option, and clicks save
- **THEN** the system saves the recording and creates a proofreading task linked to the saved recording

#### Scenario: Save without proofreading task
- **WHEN** the save dialog is visible, the user leaves the proofreading option disabled, and clicks save
- **THEN** the system saves the recording without creating a proofreading task

### Requirement: Save dialog supports discarding floating recordings
The save dialog SHALL allow the user to discard the completed floating recording instead of saving it.

#### Scenario: Discard completed recording
- **WHEN** the save dialog is visible and the user clicks discard
- **THEN** the system closes the floating window and does not save the recording

### Requirement: Saved floating recordings appear in the realtime recording list
The system SHALL store floating recordings using the same persistence flow as fullscreen recordings so they appear in the shared realtime recording list.

#### Scenario: View saved floating recording in list
- **WHEN** a user saves a completed floating recording
- **THEN** the saved recording appears in the realtime recording list alongside recordings created from fullscreen mode