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
});
