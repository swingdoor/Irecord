class AudioChunkProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0]
    if (input && input[0] && input[0].length > 0) {
      const channelData = input[0]

      // Send the Float32Array directly without transfer
      this.port.postMessage(channelData)
    }
    return true
  }
}

registerProcessor('audio-chunk-processor', AudioChunkProcessor)
