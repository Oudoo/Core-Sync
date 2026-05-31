/**
 * SongStore — IndexedDB persistence for songs + analysis.
 *
 * Stores the raw audio ArrayBuffer + serialized FeatureMap so the user
 * never re-uploads or re-analyzes. AudioBuffer is rebuilt from rawBuffer
 * via decodeAudioData each play (fast; not serialisable anyway).
 */

import { FeatureMap } from '../audio/FeatureMap';

export interface SongMeta {
  id: string;
  name: string;
  bpm: number;
  duration: number;
  sampleRate: number;
  addedAt: number;
}

interface StoredRecord extends SongMeta {
  rawBuffer: ArrayBuffer;
  featureMapJson: string;
}

const DB_NAME = 'CoreSyncDB';
const DB_VERSION = 1;
const STORE = 'songs';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: 'id' });
        os.createIndex('addedAt', 'addedAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export class SongStore {
  private db: IDBDatabase | null = null;

  async open(): Promise<void> {
    this.db = await openDB();
  }

  private ensureOpen(): IDBDatabase {
    if (!this.db) throw new Error('SongStore not opened');
    return this.db;
  }

  /** Save (or overwrite) a song entry. */
  async save(meta: SongMeta, rawBuffer: ArrayBuffer, featureMap: FeatureMap): Promise<void> {
    const db = this.ensureOpen();
    const record: StoredRecord = {
      ...meta,
      rawBuffer,
      featureMapJson: JSON.stringify(featureMap),
    };
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /** List all stored song metas (no buffers — fast). */
  async listMeta(): Promise<SongMeta[]> {
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).index('addedAt').getAll();
      req.onsuccess = () => {
        const metas: SongMeta[] = req.result.map(
          ({ id, name, bpm, duration, sampleRate, addedAt }) =>
            ({ id, name, bpm, duration, sampleRate, addedAt }),
        );
        resolve(metas);
      };
      req.onerror = () => reject(req.error);
    });
  }

  /** Load the full record for a song (rawBuffer + featureMap). */
  async loadFull(id: string): Promise<{ rawBuffer: ArrayBuffer; featureMap: FeatureMap } | null> {
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
      req.onsuccess = () => {
        const r: StoredRecord | undefined = req.result;
        if (!r) return resolve(null);
        resolve({
          rawBuffer: r.rawBuffer,
          featureMap: JSON.parse(r.featureMapJson) as FeatureMap,
        });
      };
      req.onerror = () => reject(req.error);
    });
  }

  /** Delete a song. */
  async remove(id: string): Promise<void> {
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}
