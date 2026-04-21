## ADDED Requirements

### Requirement: Display recording page layout
The system SHALL display recording page with three main sections: header, audio area, and transcript area.

#### Scenario: Page structure
- **WHEN** user enters recording page
- **THEN** system displays header with back button and title, audio area with waveform and controls, and transcript area with real-time text

### Requirement: Show recording title and timestamp
The system SHALL display recording title and creation timestamp in the header.

#### Scenario: Header information
- **WHEN** recording page loads
- **THEN** system shows title "语音_YYYYMMDDHHmmss" and formatted date "2026年04月20日 18:18"

### Requirement: Display waveform visualization
The system SHALL display real-time audio waveform during recording.

#### Scenario: Active waveform
- **WHEN** recording is in progress
- **THEN** system displays animated waveform reflecting audio input

#### Scenario: Static waveform
- **WHEN** recording is paused or stopped
- **THEN** system displays static waveform

### Requirement: Show recording controls
The system SHALL display appropriate control buttons based on recording state.

#### Scenario: Initial state
- **WHEN** page loads
- **THEN** system shows "开始" button

#### Scenario: Recording state
- **WHEN** recording is active
- **THEN** system shows "暂停" and "停止" buttons

#### Scenario: Paused state
- **WHEN** recording is paused
- **THEN** system shows "继续" and "停止" buttons

### Requirement: Display real-time transcript
The system SHALL display transcribed text with timestamps in the transcript area.

#### Scenario: Transcript format
- **WHEN** system receives transcription segments
- **THEN** each segment displays as "HH:MM:SS - 识别内容"

#### Scenario: Auto-scroll
- **WHEN** new transcript segment appears
- **THEN** system automatically scrolls to bottom

### Requirement: Show recording duration
The system SHALL display current recording duration in HH:MM:SS format.

#### Scenario: Duration counter
- **WHEN** recording is active
- **THEN** system updates duration display every second
