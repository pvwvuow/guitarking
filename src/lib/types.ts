/** Shared types for GuitarKing analysis results (mirrors python/chord_detect.py output). */

export interface ChordSegment {
  chord: string;
  start: number;
  end: number;
}

export interface SongSection {
  id: number;
  label: string;
  color?: string;
  start: number;
  end: number;
  segments: ChordSegment[];
  progression: string[];
}

export interface KeyInfo {
  tonic: string;
  mode: string;
  confidence: number;
  tonicFa: string;
  modeFa: string;
}

export interface ChordUsage {
  chord: string;
  seconds: number;
  percent: number;
}

export interface AnalysisResult {
  ok: true;
  engine?: string;
  duration: number;
  tempo: number;
  key: KeyInfo;
  confidence: number;
  sections: SongSection[];
  segments: ChordSegment[];
  chordSeconds: ChordUsage[];
  /** engine v7: beat grid (s); every chord change sits on one of these */
  beats?: number[];
  /** engine v7: bar lines (s) */
  downbeats?: number[];
  /** engine v7: beats per bar (4 or 3) */
  bpb?: number;
}

export interface AnalysisError {
  ok: false;
  error: string;
}

export type AnalysisResponse = AnalysisResult | AnalysisError;
