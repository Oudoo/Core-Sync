/**
 * Note definitions and types.
 */

export enum NoteType {
  TAP = 'tap',
  HOLD = 'hold',
  SPARK = 'spark',
}

export interface Note {
  id: string;
  time: number;       // Trigger time in seconds
  type: NoteType;
  lane: number;       // Lane index (0 to LANE_COUNT - 1)
  duration: number;   // Duration in seconds (only for HOLD notes, 0 otherwise)
  velocity: number;   // Speed scale modifier
  strength: number;   // Visual intensity scale (derived from onset strength)
}
