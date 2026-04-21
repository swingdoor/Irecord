class AudioChunkProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.chunkCount = 0
  }

  process(inputs) {
    const input = inputs[0]
    if (input && input[0] && input[0].length > 0) {
      const channelData = input[0]

      // Log first few chunks
      if (this.chunkCount < 5) {
        const max = Math.max(...channelData)
        const min = Math.min(...channelData)
        console.log(`[AudioWorklet] Chunk ${this.chunkCount}:`, {
          length: channelData.length,
          firstSamples: Array.from(channelData.slice(0, 10)),
          max,
          min
        })
        this.chunkCount++
      }

      // Send the Float32Array directly without transfer
      this.port.postMessage(channelData)
    }
    return true
  }
}

registerProcessor('audio-chunk-processor', AudioChunkProcessor)
