/** Base64 → bytes, for audio payloads that travel as JSON strings. */
export function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const INT16_FULL_SCALE = 32768;

/**
 * Wraps raw signed 16-bit PCM in an `AudioBuffer`.
 *
 * The synthesizer returns headerless samples, so `decodeAudioData` cannot be
 * used — the conversion to float has to be done by hand.
 */
export function pcm16ToAudioBuffer(
  samples: Uint8Array,
  context: BaseAudioContext,
  sampleRate: number,
  channelCount: number,
): AudioBuffer {
  const pcm = new Int16Array(samples.buffer, samples.byteOffset, Math.floor(samples.byteLength / 2));
  const frameCount = Math.floor(pcm.length / channelCount);
  const buffer = context.createBuffer(channelCount, frameCount, sampleRate);

  for (let channel = 0; channel < channelCount; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let frame = 0; frame < frameCount; frame++) {
      channelData[frame] = pcm[frame * channelCount + channel] / INT16_FULL_SCALE;
    }
  }

  return buffer;
}
