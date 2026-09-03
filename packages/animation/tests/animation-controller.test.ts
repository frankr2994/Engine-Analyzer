import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SharedCrankAngleController, FakeClock } from '../src/index.js';
import { FOUR_STROKE_TDC_CONVENTION, TWO_STROKE_TDC_CONVENTION, AnimationStateSnapshot } from '@engine-analyzer/contracts';
import { createCrankAngleGrid } from '@engine-analyzer/kinematics';

describe('Shared Crank Angle Controller (Phase 7)', () => {
  let clock: FakeClock;
  let controller: SharedCrankAngleController;

  beforeEach(() => {
    clock = new FakeClock();
    controller = new SharedCrankAngleController({
      clock,
      rpm: 1200, // 1200 RPM = 20 rev/s = 7200 deg/s
      initialAngleDeg: 0,
    });
  });

  afterEach(() => {
    controller.dispose();
  });

  it('starts in paused state with immutable initial state snapshot', () => {
    const state = controller.getState();
    expect(state.isPlaying).toBe(false);
    expect(state.angleDegrees).toBe(0);
    expect(state.sampleIndex).toBe(0);
    expect(state.cycleDegrees).toBe(720);
    expect(Object.isFrozen(state)).toBe(true);
  });

  it('advances angle accurately with fake clock ticks and wraps at 720 degrees', () => {
    controller.play();
    expect(controller.getState().isPlaying).toBe(true);

    // Advance 50ms at 1200 RPM (7200 deg/s):
    // Expected advance = 7200 * 0.05 = 360 deg
    clock.advanceTime(50);
    const state1 = controller.getState();
    expect(state1.angleDegrees).toBeCloseTo(360.0, 1);
    expect(state1.normalizedCycleProgress).toBeCloseTo(0.5, 2);

    // Advance another 60ms (expected +432 deg => 792 deg => wrapped to 72 deg)
    clock.advanceTime(60);
    const state2 = controller.getState();
    expect(state2.angleDegrees).toBeCloseTo(72.0, 1);
    expect(state2.angleDegrees).toBeLessThan(720.0);
  });

  it('handles pause and resume transitions cleanly', () => {
    controller.play();
    clock.advanceTime(25); // ~180 deg
    const angleBeforePause = controller.getState().angleDegrees;

    controller.pause();
    expect(controller.getState().isPlaying).toBe(false);

    // Clock advances while paused, angle must not change
    clock.advanceTime(100);
    expect(controller.getState().angleDegrees).toBe(angleBeforePause);

    controller.play();
    clock.advanceTime(25);
    expect(controller.getState().angleDegrees).toBeGreaterThan(angleBeforePause);
  });

  it('seeks accurately to angle, progress, and sample index', () => {
    controller.seekToAngle(180.5);
    expect(controller.getState().angleDegrees).toBe(180.5);

    controller.seekToProgress(0.75); // 0.75 * 720 = 540 deg
    expect(controller.getState().angleDegrees).toBe(540.0);

    controller.seekToSampleIndex(90);
    expect(controller.getState().angleDegrees).toBe(90.0);
    expect(controller.getState().sampleIndex).toBe(90);
  });

  it('adjusts playback rate (e.g. 2x speed)', () => {
    controller.setPlaybackRate(2.0);
    controller.play();
    // 25ms at 2x rate = 25ms * 7200 deg/s * 2 = 360 deg
    clock.advanceTime(25);
    expect(controller.getState().angleDegrees).toBeCloseTo(360.0, 1);
  });

  it('notifies multiple concurrent observers with identical state and revision', () => {
    const snapshotsA: AnimationStateSnapshot[] = [];
    const snapshotsB: AnimationStateSnapshot[] = [];

    const unsubA = controller.subscribe((s) => snapshotsA.push(s));
    const unsubB = controller.subscribe((s) => snapshotsB.push(s));

    controller.seekToAngle(240);

    expect(snapshotsA.length).toBeGreaterThan(0);
    expect(snapshotsB.length).toBeGreaterThan(0);

    const lastA = snapshotsA[snapshotsA.length - 1]!;
    const lastB = snapshotsB[snapshotsB.length - 1]!;

    expect(lastA.revision).toBe(lastB.revision);
    expect(lastA.angleDegrees).toBe(240);
    expect(lastB.angleDegrees).toBe(240);

    unsubA();
    unsubB();
  });

  it('correctly maps sample indices and normalizes angles for grids with non-zero startAngleDeg', () => {
    // Grid starting at 30 deg, resolution 5 deg, 360 deg cycle (72 samples)
    const samples = Array.from({ length: 72 }, (_, i) => 30 + i * 5);
    const nonZeroGrid = {
      convention: TWO_STROKE_TDC_CONVENTION,
      startAngleDeg: 30,
      endAngleDeg: 390,
      resolutionDeg: 5.0,
      sampleCount: 72,
      samples,
    };

    const ctrl = new SharedCrankAngleController({
      clock,
      grid: nonZeroGrid,
      initialAngleDeg: 30,
    });

    // 1. Initial state at start angle
    const s0 = ctrl.getState();
    expect(s0.angleDegrees).toBe(30.0);
    expect(s0.sampleIndex).toBe(0);
    expect(s0.normalizedCycleProgress).toBe(0.0);

    // 2. Seek to angle 35 -> index 1
    ctrl.seekToAngle(35.0);
    const s1 = ctrl.getState();
    expect(s1.angleDegrees).toBe(35.0);
    expect(s1.sampleIndex).toBe(1);

    // 3. Seek to angle 50 -> index 4 ((50 - 30) / 5 = 4)
    ctrl.seekToAngle(50.0);
    const s4 = ctrl.getState();
    expect(s4.angleDegrees).toBe(50.0);
    expect(s4.sampleIndex).toBe(4);

    // 4. Seek to sample index 10 -> angle 30 + 10 * 5 = 80
    ctrl.seekToSampleIndex(10);
    const s10 = ctrl.getState();
    expect(s10.angleDegrees).toBe(80.0);
    expect(s10.sampleIndex).toBe(10);

    // 5. Seek to progress 0.5 -> angle 30 + 0.5 * 360 = 210
    ctrl.seekToProgress(0.5);
    const sHalf = ctrl.getState();
    expect(sHalf.angleDegrees).toBe(210.0);
    expect(sHalf.sampleIndex).toBe(36);
    expect(sHalf.normalizedCycleProgress).toBe(0.5);

    // 6. Angle wrapping beyond 390 deg wraps back into [30, 390)
    ctrl.seekToAngle(400.0); // 400 - 30 = 370 -> 370 % 360 = 10 -> angle 40
    const sWrap = ctrl.getState();
    expect(sWrap.angleDegrees).toBe(40.0);
    expect(sWrap.sampleIndex).toBe(2);

    ctrl.dispose();
  });

  it('correctly manages partial grids where grid span is smaller than convention cycle', () => {
    // Partial grid covering only 180 to 540 deg (span 360 deg) on a 4-stroke 720 deg convention
    const samples = Array.from({ length: 361 }, (_, i) => 180 + i * 1.0);
    const partialGrid = {
      convention: { ...FOUR_STROKE_TDC_CONVENTION, endpointIncluded: true },
      startAngleDeg: 180,
      endAngleDeg: 540,
      resolutionDeg: 1.0,
      sampleCount: 361,
      samples,
    };

    const ctrl = new SharedCrankAngleController({
      clock,
      grid: partialGrid,
      initialAngleDeg: 180,
    });

    const s0 = ctrl.getState();
    expect(s0.angleDegrees).toBe(180.0);
    expect(s0.sampleIndex).toBe(0);
    expect(s0.normalizedCycleProgress).toBe(0.0);

    // Progress 0.5 should be at midpoint 180 + 0.5 * 360 = 360 deg
    ctrl.seekToProgress(0.5);
    const sMid = ctrl.getState();
    expect(sMid.angleDegrees).toBe(360.0);
    expect(sMid.sampleIndex).toBe(180);
    expect(sMid.normalizedCycleProgress).toBe(0.5);

    // Progress 1.0 with endpointIncluded should seek to exactly 540 deg
    ctrl.seekToProgress(1.0);
    const sEnd = ctrl.getState();
    expect(sEnd.angleDegrees).toBe(540.0);
    expect(sEnd.sampleIndex).toBe(360);

    // Wrapping past 540 wraps within [180, 540)
    ctrl.seekToAngle(560.0); // 560 - 180 = 380 -> 380 % 360 = 20 -> 180 + 20 = 200
    const sWrapped = ctrl.getState();
    expect(sWrapped.angleDegrees).toBe(200.0);
    expect(sWrapped.sampleIndex).toBe(20);

    ctrl.dispose();
  });
});
