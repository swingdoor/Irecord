## ADDED Requirements

### Requirement: System can start and stop recording via global shortcut
The system SHALL register a global shortcut `Ctrl+Shift+R` at application startup and use it to toggle floating recording state.

#### Scenario: Start recording from idle state
- **WHEN** the application is running and no recording is in progress, and the user presses `Ctrl+Shift+R`
- **THEN** the system starts a new floating recording session and shows the floating recorder window

#### Scenario: Stop recording from active floating session
- **WHEN** a floating recording session is in progress and the user presses `Ctrl+Shift+R`
- **THEN** the system stops the recording session and switches the floating window to save dialog mode

#### Scenario: Ignore shortcut during save dialog
- **WHEN** the floating window is showing the save dialog after recording stops, and the user presses `Ctrl+Shift+R`
- **THEN** the system does not start a new recording or alter the save dialog state

### Requirement: System prevents concurrent recording modes
The system SHALL allow only one active recording session at a time across floating and fullscreen modes.

#### Scenario: Reject floating recording when fullscreen recording is active
- **WHEN** a fullscreen recording session is already in progress and the user presses the global shortcut
- **THEN** the system does not start floating recording

#### Scenario: Reject fullscreen recording when floating recording is active
- **WHEN** a floating recording session is already in progress and the user tries to start fullscreen recording from the main window
- **THEN** the system does not start fullscreen recording

### Requirement: System reports shortcut registration conflicts
The system SHALL detect when the global shortcut cannot be registered and SHALL notify the user that the shortcut is unavailable.

#### Scenario: Shortcut registration fails
- **WHEN** the application starts and `Ctrl+Shift+R` is already occupied by another application or the operating system
- **THEN** the system does not register the shortcut and notifies the user that the shortcut is unavailable