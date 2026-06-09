import { join, dirname, basename, extname } from 'path'
import { existsSync, unlinkSync, statSync } from 'fs'
import { randomUUID } from 'crypto'
import ffmpeg from 'fluent-ffmpeg'
import { getFfmpegPath, getFfprobePath } from '../utils/paths'

// Set ffmpeg paths
ffmpeg.setFfmpegPath(getFfmpegPath())
ffmpeg.setFfprobePath(getFfprobePath())

export interface PostProcessingOptions {
  denoise: boolean
  trimSilence: boolean
  normalizeLoudness: boolean
  compress: boolean
  compressFormat?: 'm4a' | 'mp3'
  keepOriginal: boolean
}

export interface PostProcessingResult {
  outputPath: string
  fileSize: number
  originalPath?: string
}

/**
 * Process recording with ffmpeg filters
 */
export async function processRecording(
  inputPath: string,
  options: PostProcessingOptions,
  onProgress?: (progress: number) => void
): Promise<PostProcessingResult> {
  // If no processing options are enabled, return original
  if (!options.denoise && !options.trimSilence && !options.normalizeLoudness && !options.compress) {
    const fileSize = existsSync(inputPath) ? statSync(inputPath).size : 0
    return {
      outputPath: inputPath,
      fileSize
    }
  }

  // Build filter chain
  const filters: string[] = []

  if (options.denoise) {
    filters.push('afftdn=nf=-25')
  }

  if (options.trimSilence) {
    filters.push('silenceremove=start_periods=1:start_silence=0.2:start_threshold=-40dB:stop_periods=1:stop_silence=0.5:stop_threshold=-40dB')
  }

  if (options.normalizeLoudness) {
    filters.push('loudnorm=I=-16:TP=-1.5:LRA=11')
  }

  // Determine output path and format
  const dir = dirname(inputPath)
  const baseName = basename(inputPath, extname(inputPath))
  let outputPath: string
  let audioCodec: string
  let audioOptions: string[] = []

  if (options.compress) {
    const format = options.compressFormat || 'm4a'
    if (format === 'm4a') {
      outputPath = join(dir, `${baseName}.m4a`)
      audioCodec = 'aac'
      audioOptions = ['-b:a', '64k']
    } else {
      outputPath = join(dir, `${baseName}.mp3`)
      audioCodec = 'libmp3lame'
      audioOptions = ['-b:a', '128k']
    }
  } else {
    outputPath = join(dir, `${baseName}_processed.wav`)
    audioCodec = 'pcm_s16le'
  }

  // If output exists, make unique
  if (existsSync(outputPath)) {
    const ext = extname(outputPath)
    const nameWithoutExt = basename(outputPath, ext)
    outputPath = join(dir, `${nameWithoutExt}_${randomUUID().substring(0, 8)}${ext}`)
  }

  return new Promise((resolve, reject) => {
    let command = ffmpeg(inputPath)

    // Apply audio filters if any
    if (filters.length > 0) {
      command = command.audioFilters(filters.join(','))
    }

    // Apply codec and options
    command = command
      .audioCodec(audioCodec)
      .outputOptions(audioOptions)
      .format(options.compress ? (options.compressFormat === 'mp3' ? 'mp3' : 'mp4') : 'wav')

    // Progress tracking
    command.on('progress', (progress) => {
      if (onProgress && progress.percent) {
        // Clamp to 0-100
        const percent = Math.max(0, Math.min(100, progress.percent))
        onProgress(percent / 100)
      }
    })

    command.on('end', () => {
      const fileSize = existsSync(outputPath) ? statSync(outputPath).size : 0

      // Delete original if requested
      if (!options.keepOriginal && inputPath !== outputPath) {
        try {
          unlinkSync(inputPath)
        } catch (err) {
          // Ignore deletion errors
          console.warn('Failed to delete original file:', err)
        }
      }

      resolve({
        outputPath,
        fileSize,
        originalPath: options.keepOriginal ? inputPath : undefined
      })
    })

    command.on('error', (err) => {
      reject(new Error(`FFmpeg processing failed: ${err.message}`))
    })

    command.save(outputPath)
  })
}
