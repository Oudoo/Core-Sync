import { Note } from './Note';

export enum Difficulty {
  EASY = 'easy',
  NORMAL = 'normal',
  HARD = 'hard',
  EXTREME = 'extreme',
}

export interface Chart {
  difficulty: Difficulty;
  bpm: number;
  notes: Note[];
  unquantized: boolean;
  version: number;
}
