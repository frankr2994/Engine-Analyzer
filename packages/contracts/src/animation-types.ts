import { CrankAngleGrid } from './crank-angle.js';

export interface AnimationStateSnapshot {
  readonly revision: number;
  readonly angleDegrees: number;
  readonly sampleIndex: number;
  readonly normalizedCycleProgress: number; // 0.0 to 1.0
  readonly isPlaying: boolean;
  readonly playbackRate: number; // 1.0 = 1x
  readonly cycleDegrees: number; // 720 or 360
  readonly timestampMs: number;
}

export interface ClockPort {
  now(): number;
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

export interface CrankAngleController {
  readonly grid?: CrankAngleGrid;
  play(): void;
  pause(): void;
  togglePlay(): void;
  seekToAngle(angleDeg: number): void;
  seekToProgress(progress0to1: number): void;
  seekToSampleIndex(index: number): void;
  setPlaybackRate(rate: number): void;
  stepForward(degrees?: number): void;
  stepBackward(degrees?: number): void;
  getState(): AnimationStateSnapshot;
  subscribe(listener: (state: AnimationStateSnapshot) => void): () => void;
  dispose(): void;
}
