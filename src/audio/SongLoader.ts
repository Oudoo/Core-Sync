/**
 * SongLoader — reads and decodes audio files.
 *
 * File selection is handled by the UI (Splash) using a native
 * <label>+<input type="file"> so iOS Safari opens the picker without
 * requiring a programmatic .click() from async context.
 */

export interface LoadedSong {
  name: string;
  rawBuffer: ArrayBuffer;
  audioBuffer: AudioBuffer;
}

export const ACCEPTED_EXTENSIONS = '.mp3,.wav,.ogg,.m4a,.aac,.flac,.weba';

const ACCEPTED_TYPES = [
  'audio/mpeg',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/ogg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
];

export class SongLoader {
  /** Full pipeline: read a File → decode → return LoadedSong. */
  async loadFromFile(file: File, audioContext: AudioContext): Promise<LoadedSong> {
    if (file.type && !ACCEPTED_TYPES.includes(file.type)) {
      throw new Error(`Unsupported audio format: ${file.type}`);
    }

    const name = file.name.replace(/\.[^.]+$/, '');
    const rawBuffer = await file.arrayBuffer();
    // decodeAudioData mutates/consumes the buffer, pass a copy
    const audioBuffer = await audioContext.decodeAudioData(rawBuffer.slice(0));
    return { name, rawBuffer, audioBuffer };
  }
}
