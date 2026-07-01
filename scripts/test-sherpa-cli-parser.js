const { readFileSync } = require('fs')
const { join } = require('path')

function parseDiarizationOutput(stdout) {
  const segments = []
  const pattern = /^\s*(\d+(?:\.\d+)?)\s+--\s+(\d+(?:\.\d+)?)\s+speaker_([A-Za-z0-9_-]+)\s*$/
  for (const line of stdout.split('\n')) {
    const match = line.match(pattern)
    if (!match) continue
    const start = Number(match[1])
    const end = Number(match[2])
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue
    segments.push({
      start: Math.round(start * 100) / 100,
      end: Math.round(end * 100) / 100,
      speaker: `speaker_${match[3]}`,
    })
  }
  return segments
}

function parseVadOutput(stdout) {
  const segments = []
  const pattern = /^\s*(\d+(?:\.\d+)?)\s+--\s+(\d+(?:\.\d+)?)\s*$/
  for (const line of stdout.split('\n')) {
    const match = line.match(pattern)
    if (!match) continue
    const start = Number(match[1])
    const end = Number(match[2])
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue
    segments.push({
      start: Math.round(start * 100) / 100,
      end: Math.round(end * 100) / 100,
      speaker: 'speaker_00',
    })
  }
  return segments
}

const fixture = join(__dirname, 'fixtures/sherpa-diarization.stdout.txt')
const stdout = readFileSync(fixture, 'utf-8')
const segments = parseDiarizationOutput(stdout)

if (segments.length !== 5) {
  throw new Error(`Expected 5 parsed diarization segments, got ${segments.length}`)
}
if (segments[0].speaker !== 'speaker_00' || segments[0].start !== 4.12) {
  throw new Error(`Unexpected first segment: ${JSON.stringify(segments[0])}`)
}

console.log(`Parsed ${segments.length} diarization segments from ${fixture}`)

const vadSegments = parseVadOutput('4.160 -- 29.984\nSaved to /tmp/output.wav\n')
if (vadSegments.length !== 1 || vadSegments[0].start !== 4.16 || vadSegments[0].end !== 29.98 || vadSegments[0].speaker !== 'speaker_00') {
  throw new Error(`Unexpected VAD segment: ${JSON.stringify(vadSegments[0])}`)
}
console.log(`Parsed ${vadSegments.length} VAD segment from inline fixture`)
