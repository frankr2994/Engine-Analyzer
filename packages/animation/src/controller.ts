import {
  AnimationStateSnapshot,
  ClockPort,
  CrankAngleController,
  CrankAngleGrid,
  deepFreeze,
  FOUR_STROKE_TDC_CONVENTION,
  SimulationResultV1,
} from '@engine-analyzer/contracts';

export class SystemClock implements ClockPort {
  public now(): number {
    return Date.now();
  }

  public setTimeout(callback: () => void, ms: number): unknown {
    return setTimeout(callback, ms);
  }

  public clearTimeout(id: unknown): void {
    clearTimeout(id as ReturnType<typeof setTimeout>);
  }
}

export class FakeClock implements ClockPort {
  private currentTime = 0;
  private nextTimerId = 1;
  private timers = new Map<number, { callback: () => void; triggerTime: number }>();

  public now(): number {
    return this.currentTime;
  }

  public setTimeout(callback: () => void, ms: number): unknown {
    const id = this.nextTimerId++;
    this.timers.set(id, { callback, triggerTime: this.currentTime + ms });
    return id;
  }

  public clearTimeout(id: unknown): void {
    this.timers.delete(id as number);
  }

  public advanceTime(ms: number): void {
    this.currentTime += ms;
    const dueTimers: { id: number; callback: () => void }[] = [];
    for (const [id, timer] of this.timers.entries()) {
      if (timer.triggerTime <= this.currentTime) {
        dueTimers.push({ id, callback: timer.callback });
      }
    }
    for (const due of dueTimers) {
      this.timers.delete(due.id);
      due.callback();
    }
  }
}

export interface AnimationControllerOptions {
  readonly clock?: ClockPort;
  readonly grid?: CrankAngleGrid;
  readonly rpm?: number;
  readonly initialAngleDeg?: number;
  readonly playbackRate?: number;
}

export class SharedCrankAngleController implements CrankAngleController {
  private readonly clock: ClockPort;
  public readonly grid: CrankAngleGrid;
  private readonly cycleDegrees: number;
  private currentAngleDeg: number;
  private isPlayingState = false;
  private rate: number;
  private nominalRpm: number;
  private revisionNumber = 0;
  private timerHandle: unknown = null;
  private lastTickTimeMs = 0;
  private readonly listeners = new Set<(state: AnimationStateSnapshot) => void>();

  public static fromResult(
    result: SimulationResultV1,
    options: Omit<AnimationControllerOptions, 'grid'> = {}
  ): SharedCrankAngleController {
    return new SharedCrankAngleController({
      ...options,
      grid: result.crankAngleGrid,
      rpm: options.rpm ?? (result.normalizedConfiguration?.operating?.rpm ?? 1200.0),
    });
  }

  constructor(options: AnimationControllerOptions = {}) {
    this.clock = options.clock ?? new SystemClock();
    if (options.grid) {
      this.grid = options.grid;
    } else {
      const samples = Array.from({ length: 720 }, (_, i) => i);
      this.grid = deepFreeze({
        convention: FOUR_STROKE_TDC_CONVENTION,
        startAngleDeg: 0,
        endAngleDeg: 720,
        resolutionDeg: 1.0,
        sampleCount: 720,
        samples,
      });
    }
    this.cycleDegrees = this.grid.convention.cycleDegrees;
    this.currentAngleDeg = options.initialAngleDeg ?? 0;
    this.rate = options.playbackRate ?? 1.0;
    this.nominalRpm = options.rpm ?? 1200.0;
    this.normalizeAngle();
  }

  private normalizeAngle(): void {
    let angle = this.currentAngleDeg % this.cycleDegrees;
    if (angle < 0) {
      angle += this.cycleDegrees;
    }
    this.currentAngleDeg = angle;
  }

  private getClosestSampleIndex(angle: number): number {
    const res = this.grid.resolutionDeg;
    const idx = Math.round(angle / res);
    return Math.max(0, Math.min(this.grid.sampleCount - 1, idx));
  }

  public getState(): AnimationStateSnapshot {
    const sampleIdx = this.getClosestSampleIndex(this.currentAngleDeg);
    const progress = this.currentAngleDeg / this.cycleDegrees;

    return deepFreeze({
      revision: this.revisionNumber,
      angleDegrees: Math.round(this.currentAngleDeg * 1000) / 1000,
      sampleIndex: sampleIdx,
      normalizedCycleProgress: Math.round(progress * 10000) / 10000,
      isPlaying: this.isPlayingState,
      playbackRate: this.rate,
      cycleDegrees: this.cycleDegrees,
      timestampMs: this.clock.now(),
    });
  }

  private notify(): void {
    this.revisionNumber++;
    const snapshot = this.getState();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  public play(): void {
    if (this.isPlayingState) return;
    this.isPlayingState = true;
    this.lastTickTimeMs = this.clock.now();
    this.scheduleNextTick();
    this.notify();
  }

  public pause(): void {
    if (!this.isPlayingState) return;
    this.isPlayingState = false;
    if (this.timerHandle !== null) {
      this.clock.clearTimeout(this.timerHandle);
      this.timerHandle = null;
    }
    this.notify();
  }

  public togglePlay(): void {
    if (this.isPlayingState) {
      this.pause();
    } else {
      this.play();
    }
  }

  public seekToAngle(angleDeg: number): void {
    this.currentAngleDeg = angleDeg;
    this.normalizeAngle();
    this.notify();
  }

  public seekToProgress(progress0to1: number): void {
    const clampedProgress = Math.max(0, Math.min(1.0, progress0to1));
    this.currentAngleDeg = clampedProgress * this.cycleDegrees;
    this.normalizeAngle();
    this.notify();
  }

  public seekToSampleIndex(index: number): void {
    const clampedIdx = Math.max(0, Math.min(this.grid.sampleCount - 1, index));
    this.currentAngleDeg = this.grid.samples[clampedIdx] ?? 0;
    this.normalizeAngle();
    this.notify();
  }

  public setPlaybackRate(rate: number): void {
    this.rate = rate;
    this.notify();
  }

  public stepForward(degrees = 5.0): void {
    this.currentAngleDeg += degrees;
    this.normalizeAngle();
    this.notify();
  }

  public stepBackward(degrees = 5.0): void {
    this.currentAngleDeg -= degrees;
    this.normalizeAngle();
    this.notify();
  }

  public advanceDeltaMs(deltaMs: number): void {
    if (deltaMs <= 0) return;
    // Angle delta: dTheta = (360 * RPM / 60) * (deltaMs / 1000) * rate
    const degPerSecond = (360.0 * this.nominalRpm) / 60.0;
    const angleDelta = degPerSecond * (deltaMs / 1000.0) * this.rate;
    this.currentAngleDeg += angleDelta;
    this.normalizeAngle();
    this.notify();
  }

  private scheduleNextTick(): void {
    if (!this.isPlayingState) return;
    const intervalMs = 16; // ~60 FPS update interval
    this.timerHandle = this.clock.setTimeout(() => {
      const now = this.clock.now();
      const deltaMs = now - this.lastTickTimeMs;
      this.lastTickTimeMs = now;
      this.advanceDeltaMs(deltaMs > 0 ? deltaMs : 16);
      this.scheduleNextTick();
    }, intervalMs);
  }

  public subscribe(listener: (state: AnimationStateSnapshot) => void): () => void {
    this.listeners.add(listener);
    // Initial notification on subscribe
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  public dispose(): void {
    this.pause();
    this.listeners.clear();
  }
}
