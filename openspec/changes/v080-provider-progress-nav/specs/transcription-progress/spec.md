## ADDED Requirements

### Requirement: Display transcription progress percentage
When a file transcription task is in `processing` status, the system SHALL display the current progress as a percentage alongside the status tag, in a horizontal layout: Tag + stage text + percent + progress bar + timer.

#### Scenario: Task begins processing
- **WHEN** a task transitions to `processing` status and the first progress event arrives with `{ stage: 'initializing', percent: 10 }`
- **THEN** the UI SHALL display `[处理中] 初始化 10%` with a progress bar at 10% and the elapsed timer

#### Scenario: Task is in recognition phase
- **WHEN** a progress event arrives with `{ stage: 'recognizing', percent: 72 }`
- **THEN** the UI SHALL display `[处理中] 识别中 72%` with a progress bar at 72%

#### Scenario: Task completes
- **WHEN** a progress event arrives with `{ stage: 'done', percent: 100 }`
- **THEN** the progress display SHALL be removed and the status SHALL change to the completed state

### Requirement: Listen to existing task-progress IPC event
The renderer process SHALL subscribe to the `onTaskProgress` event (already exposed in preload) and maintain a state map of `{ [taskId]: { stage, percent } }` for all active tasks.

#### Scenario: Multiple tasks queued
- **WHEN** task A is processing and task B is pending
- **THEN** only task A SHALL show progress information; task B SHALL show "排队中" without progress

#### Scenario: Progress state cleanup on task completion
- **WHEN** a task's status changes to `completed`, `failed`, or `stopped`
- **THEN** the progress entry for that task SHALL be removed from the state map

### Requirement: Stage text mapping
The system SHALL map progress stage identifiers to Chinese display text: `initializing` → "初始化", `segmenting` → "分段中", `recognizing` → "识别中", `done` → "完成".

#### Scenario: Unknown stage
- **WHEN** a progress event arrives with an unmapped stage value
- **THEN** the system SHALL display the raw stage string as fallback
