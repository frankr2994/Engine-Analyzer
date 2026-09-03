import { describe, it, expect } from 'vitest';
import { createEngineSimulationApp } from '../src/index.js';

describe('Composition Root End-to-End Application Wiring (Phase 8)', () => {
  it('instantiates the complete modular application, runs simulation, and renders presentation without error', () => {
    const app = createEngineSimulationApp();

    expect(app.pluginRegistry.listManifests().length).toBe(2);
    expect(app.calibrationRepository.list().length).toBe(2);

    const input = {
      engine: {
        boreMm: 84.0,
        strokeMm: 90.0,
        connectingRodLengthMm: 145.0,
        compressionRatio: 10.5,
        cylinderCount: 4,
      },
      operating: {
        rpm: 3000.0,
        intakePressureBar: 1.0,
        intakeTemperatureK: 298.15,
        sparkTimingDegBtdc: 18.0,
        airFuelRatio: 14.7,
      },
      calibrationId: 'cal.baseline.naturally_aspirated_2l',
      calibrationVersion: '1.0.0',
      resolutionDeg: 1.0,
    };

    // Run baseline simulation
    const result = app.orchestrator.runSimulation(input, 'model.four-stroke.baseline');
    expect(result.status).toBe('SUCCESS');

    // Create animation controller and presentation suite
    const controller = app.createAnimationController({ grid: result.crankAngleGrid, rpm: input.operating.rpm });
    const presentation = app.createPresentation(result, controller);

    // Initial check
    const pvVm = presentation.pvChart.getViewModel();
    expect(pvVm.hasError).toBe(false);
    expect(pvVm.points.length).toBe(720);

    const timelineVm = presentation.timeline.getViewModel();
    expect(timelineVm.phases.length).toBe(4);

    const rendererVm = presentation.renderer.getViewModel();
    expect(rendererVm.hasError).toBe(false);

    const dashboardCards = presentation.dashboard.getMetricCards();
    expect(dashboardCards.length).toBe(12);

    // Play animation and observe synchronized state updates across all views
    controller.seekToAngle(360);

    expect(presentation.timeline.getViewModel().currentAngleDeg).toBe(360);
    expect(presentation.pvChart.getViewModel().currentPoint?.volumeCm3).toBeCloseTo(pvVm.xMin, 1);
    expect(presentation.renderer.getViewModel().connectingRodAngleDeg).toBeCloseTo(0.0, 1);

    // Cleanup
    controller.dispose();
  });

  it('creates unified SimulationSession instance coupling result and controller', () => {
    const app = createEngineSimulationApp();
    const input = {
      engine: {
        boreMm: 84.0,
        strokeMm: 90.0,
        connectingRodLengthMm: 145.0,
        compressionRatio: 10.5,
        cylinderCount: 4,
      },
      operating: {
        rpm: 3000.0,
        intakePressureBar: 1.0,
        intakeTemperatureK: 298.15,
        sparkTimingDegBtdc: 18.0,
        airFuelRatio: 14.7,
      },
      calibrationId: 'cal.baseline.naturally_aspirated_2l',
      calibrationVersion: '1.0.0',
      resolutionDeg: 1.0,
    };

    const result = app.orchestrator.runSimulation(input);
    const session = app.createSession(result);

    expect(session.result.resultId).toBeDefined();
    expect(session.controller.getState().cycleDegrees).toBe(720);
    expect(session.presentation.pvChart.getViewModel().hasError).toBe(false);
    expect(session.presentation.timeline.getViewModel().phases.length).toBe(4);

    session.controller.seekToAngle(180);
    expect(session.presentation.timeline.getViewModel().currentAngleDeg).toBe(180);

    session.dispose();
  });

  it('enforces shared crank angle invariant across two-stroke and four-stroke models', () => {
    const app = createEngineSimulationApp();
    const input2Stroke = {
      engine: {
        boreMm: 54.0,
        strokeMm: 54.0,
        connectingRodLengthMm: 110.0,
        compressionRatio: 7.5,
        cylinderCount: 1,
      },
      operating: {
        rpm: 8000.0,
        intakePressureBar: 1.0,
        intakeTemperatureK: 298.15,
        sparkTimingDegBtdc: 20.0,
        airFuelRatio: 12.5,
      },
      calibrationId: 'cal.baseline.naturally_aspirated_2l',
      calibrationVersion: '1.0.0',
      resolutionDeg: 1.0,
    };

    const result2Stroke = app.orchestrator.runSimulation(input2Stroke, 'model.two-stroke.baseline');
    expect(result2Stroke.crankAngleGrid.convention.cycleDegrees).toBe(360);

    // Creating a session automatically binds a 360-degree controller
    const session2Stroke = app.createSession(result2Stroke);
    expect(session2Stroke.controller.getState().cycleDegrees).toBe(360);
    expect(session2Stroke.presentation.timeline.getViewModel().cycleDegrees).toBe(360);
    expect(session2Stroke.presentation.timeline.getViewModel().phases.length).toBe(2);

    // Attaching a 720 controller to a 360 result throws INCOMPATIBLE_ANGLE_GRID
    const controller720 = app.createAnimationController(); // Default 720 deg
    expect(() => app.createPresentation(result2Stroke, controller720)).toThrowError(/INCOMPATIBLE_ANGLE_GRID/);

    session2Stroke.dispose();
    controller720.dispose();
  });
});
