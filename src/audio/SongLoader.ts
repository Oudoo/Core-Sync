/**
 * SongLoader — handles file picking, reading, and decoding to AudioBuffer.
 *
 * DECISION: Uses a hidden <input type="file"> triggered programmatically.
 * Returns the raw ArrayBuffer (for hashing) and the decoded AudioBuffer
 * (for analysis + playback).
 */

export interface LoadedSong {
  /** Original filename without extension. */
  name: string;
  /** Raw file bytes — kept for hashing (chart cache key). */
  rawBuffer: ArrayBuffer;
  /** Decoded audio ready for analysis and playback. */
  audioBuffer: AudioBuffer;
}

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

const ACCEPTED_EXTENSIONS = '.mp3,.wav,.ogg,.m4a,.aac,.flac,.weba';

export class SongLoader {
  private fileInput: HTMLInputElement;

  constructor() {
    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.accept = ACCEPTED_EXTENSIONS;
    this.fileInput.style.display = 'none';
    document.body.appendChild(this.fileInput);
  }

  /**
   * Open the file picker and return the selected audio file.
   * Throws if the user cancels or the file is invalid.
   */
  pickFile(): Promise<File> {
    return new Promise((resolve, reject) => {
      const onChange = () => {
        cleanup();
        const file = this.fileInput.files?.[0];
        if (!file) {
          reject(new Error('No file selected'));
          return;
        }
        // Validate type — some browsers report empty type for m4a
        if (file.type && !ACCEPTED_TYPES.includes(file.type)) {
          reject(new Error(`Unsupported audio format: ${file.type}`));
          return;
        }
        resolve(file);
      };

      const onCancel = () => {
        // 'cancel' event fires when the dialog is closed without selection
        cleanup();
        reject(new Error('File selection cancelled'));
      };

      const cleanup = () => {
        this.fileInput.removeEventListener('change', onChange);
        this.fileInput.removeEventListener('cancel', onCancel);
        // Reset so the same file can be re-selected
        this.fileInput.value = '';
      };

      this.fileInput.addEventListener('change', onChange);
      this.fileInput.addEventListener('cancel', onCancel);
      this.fileInput.click();
    });
  }

  /**
   * Read a File into an ArrayBuffer.
   */
  async readFile(file: File): Promise<ArrayBuffer> {
    return file.arrayBuffer();
  }

  /**
   * Decode an ArrayBuffer into an AudioBuffer using the given AudioContext.
   */
  async decode(
    arrayBuffer: ArrayBuffer,
    audioContext: AudioContext,
  ): Promise<AudioBuffer> {
    // decodeAudioData consumes the buffer, so we pass a copy
    const copy = arrayBuffer.slice(0);
    return audioContext.decodeAudioData(copy);
  }

  /**
   * Full pipeline: pick → read → decode → return LoadedSong.
   */
  async load(audioContext: AudioContext): Promise<LoadedSong> {
    const file = await this.pickFile();
    const name = file.name.replace(/\.[^.]+$/, '');

    const rawBuffer = await this.readFile(file);
    const audioBuffer = await this.decode(rawBuffer, audioContext);

    return { name, rawBuffer, audioBuffer };
  }

  /**
   * Cleanup DOM element.
   */
  destroy(): void {
    this.fileInput.remove();
  }
}
