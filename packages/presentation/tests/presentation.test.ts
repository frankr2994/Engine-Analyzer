import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  PressureVolumeChartComponent,
  CrankAngleTimelineOverlayComponent,
  CylinderEngineRendererComponent,
  PerformanceDashboardComponent,
} from '../src/index.js';
import { SharedCrankAngleController, FakeClock } from '@engine-analyzer/animation';
import { BaselineEngineModel } from '@engine-analyzer/baseline-engine';
import { BASELINE_NATURALLY_ASPIRATED_2L } from '@engine-analyzer/calibration';
import { SimulationModelInput, SimulationResultV1 } from '@engine-analyzer/contracts';

describe('Presentation Components and Visual Projections (Phase 8)', () => {
  let simulationResult: SimulationResultV1;
  let clock: FakeClock;
  let controller: SharedCrankAngleController;

  beforeEach(() => {
    const model = new BaselineEngineModel();
    const input: SimulationModelInput = {
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
    simulationResult = model.simulate(input, BASELINE_NATURALLY_ASPIRATED_2L);
    clock = new FakeClock();
    controller = new SharedCrankAngleController({ clock, grid: simulationResult.crankAngleGrid });
  });

  afterEach(() => {
    controller.dispose();
  });

  it('projects Pressure-Volume diagram correctly and updates current state marker on animation', () => {
    const pvChart = new PressureVolumeChartComponent(simulationResult, controller);
    const vmInitial = pvChart.getViewModel();

    expect(vmInitial.hasError).toBe(false);
    expect(vmInitial.points.length).toBe(720);
    expect(vmInitial.currentPoint).toBeDefined();
    expect(vmInitial.currentPoint?.volumeCm3).toBeCloseTo(vmInitial.xMin, 1); // at 0 deg TDC

    // Advance controller to 180 deg BDC
    controller.seekToAngle(180);
    const vmBdc = pvChart.getViewModel();
    expect(vmBdc.currentPoint?.volumeCm3).toBeCloseTo(vmBdc.xMax, 1);

    const svg = pvChart.renderSvg();
    expect(svg).toContain('<svg');
    expect(svg).toContain('Volume (cm³)');

    pvChart.dispose();
  });

  it('renders timeline overlay with correct 4-stroke cycle phases', () => {
    const timeline = new CrankAngleTimelineOverlayComponent(simulationResult, controller);
    const vm = timeline.getViewModel();

    expect(vm.phases.length).toBe(4);
    expect(vm.phases[0]?.name).toContain('Power');
    expect(vm.phases[1]?.name).toContain('Exhaust');
    expect(vm.phases[2]?.name).toContain('Intake');
    expect(vm.phases[3]?.name).toContain('Compression');

    controller.seekToAngle(270);
    expect(timeline.getViewModel().currentAngleDeg).toBe(270);

    const html = timeline.renderHtml();
    expect(html).toContain('Current Angle:');
    expect(html).toContain('270.0°');

    timeline.dispose();
  });

  it('projects cylinder visual coordinates strictly from channel values without inline physics', () => {
    const renderer = new CylinderEngineRendererComponent(simulationResult, controller);

    // At TDC (0 deg)
    controller.seekToAngle(0);
    const vmTdc = renderer.getViewModel();
    expect(vmTdc.hasError).toBe(false);
    expect(vmTdc.pistonPositionMm).toBeCloseTo(0.0, 2);

    // At BDC (180 deg)
    controller.seekToAngle(180);
    const vmBdc = renderer.getViewModel();
    expect(vmBdc.pistonPositionMm).toBeCloseTo(90.0, 2);
    expect(vmBdc.pistonYPx).toBeGreaterThan(vmTdc.pistonYPx);

    const svg = renderer.renderSvg();
    expect(svg).toContain('Cylinder Chamber Background');
    expect(svg).toContain('Spark Plug');

    renderer.dispose();
  });

  it('gracefully handles missing channel data with structured error view instead of crash', () => {
    const incompleteResult: SimulationResultV1 = {
      ...simulationResult,
      channels: [], // Empty channels
    };

    const pvChart = new PressureVolumeChartComponent(incompleteResult, controller);
    const vm = pvChart.getViewModel();

    expect(vm.hasError).toBe(true);
    expect(vm.errorMessage).toContain('Missing required channels');

    const svg = pvChart.renderSvg();
    expect(svg).toContain('Missing required channels');

    pvChart.dispose();
  });

  it('strictly rejects attaching mismatched controller (e.g. 720 deg controller on 360 deg result)', () => {
    // 360-degree two-stroke result
    const twoStrokeResult: SimulationResultV1 = {
      ...simulationResult,
      crankAngleGrid: {
        ...simulationResult.crankAngleGrid,
        convention: {
          ...simulationResult.crankAngleGrid.convention,
          conventionId: 'TWO_STROKE_TDC_0_360',
          cycleDegrees: 360,
          strokeCount: 2,
        },
        endAngleDeg: 360,
        sampleCount: 360,
      },
    };

    // 720 deg controller
    const controller720 = new SharedCrankAngleController({ clock, grid: simulationResult.crankAngleGrid });

    expect(() => new CrankAngleTimelineOverlayComponent(twoStrokeResult, controller720)).toThrowError(/INCOMPATIBLE_ANGLE_GRID/);
    expect(() => new PressureVolumeChartComponent(twoStrokeResult, controller720)).toThrowError(/INCOMPATIBLE_ANGLE_GRID/);
    expect(() => new CylinderEngineRendererComponent(twoStrokeResult, controller720)).toThrowError(/INCOMPATIBLE_ANGLE_GRID/);

    controller720.dispose();
  });

  it('strictly rejects attaching controller with mismatched grid resolution (e.g. 2° grid on 1° result)', () => {
    // 720 deg controller with 2 deg resolution (360 samples)
    const grid2Deg = {
      ...simulationResult.crankAngleGrid,
      resolutionDeg: 2.0,
      sampleCount: 360,
      samples: Array.from({ length: 360 }, (_, i) => i * 2),
    };
    const controller2Deg = new SharedCrankAngleController({ clock, grid: grid2Deg });

    // simulationResult is 720 deg with 1.0 deg resolution (720 samples)
    expect(() => new PressureVolumeChartComponent(simulationResult, controller2Deg)).toThrowError(/INCOMPATIBLE_ANGLE_GRID/);
    expect(() => new CylinderEngineRendererComponent(simulationResult, controller2Deg)).toThrowError(/INCOMPATIBLE_ANGLE_GRID/);
    expect(() => new CrankAngleTimelineOverlayComponent(simulationResult, controller2Deg)).toThrowError(/INCOMPATIBLE_ANGLE_GRID/);

    controller2Deg.dispose();
  });

  it('correctly maps angle to authoritative result sample index across the full cycle', () => {
    const pvChart = new PressureVolumeChartComponent(simulationResult, controller);
    const renderer = new CylinderEngineRendererComponent(simulationResult, controller);

    // At 90 deg ATDC
    controller.seekToAngle(90.0);
    const pvVm = pvChart.getViewModel();
    const rendVm = renderer.getViewModel();

    const expectedPosChan = simulationResult.channels.find((c) => c.channelId === 'piston_position_mm')!;
    const expectedPressChan = simulationResult.channels.find((c) => c.channelId === 'cylinder_pressure_bar')!;

    // Sample at index 90 on 1 deg grid
    expect(pvVm.currentPoint?.pressureBar).toBeCloseTo(expectedPressChan.samples[90]!, 2);
    expect(rendVm.pistonPositionMm).toBeCloseTo(expectedPosChan.samples[90]!, 2);

    pvChart.dispose();
    renderer.dispose();
  });

  it('rejects component instantiation without a controller', () => {
    expect(() => new CrankAngleTimelineOverlayComponent(simulationResult, undefined as any)).toThrowError(/VALIDATION_FAILED/);
    expect(() => new PressureVolumeChartComponent(simulationResult, undefined as any)).toThrowError(/VALIDATION_FAILED/);
    expect(() => new CylinderEngineRendererComponent(simulationResult, undefined as any)).toThrowError(/VALIDATION_FAILED/);
  });

  it('renders performance dashboard summary cards from versioned summary', () => {
    const dashboard = new PerformanceDashboardComponent(simulationResult);
    const cards = dashboard.getMetricCards();

    expect(cards.length).toBe(12);
    const powerCard = cards.find((c) => c.label === 'Brake Power')!;
    expect(powerCard.value).toBe(simulationResult.summary.brakePowerKw);
    expect(powerCard.unit).toBe('kW');

    const html = dashboard.renderHtml();
    expect(html).toContain('Brake Power');
    expect(html).toContain('IMEP');
  });

  it('satisfies performance budget (< 16ms per frame for 720 points projection)', () => {
    const pvChart = new PressureVolumeChartComponent(simulationResult, controller);
    const renderer = new CylinderEngineRendererComponent(simulationResult, controller);

    const startTime = performance.now();
    const iterations = 100;

    for (let i = 0; i < iterations; i++) {
      controller.seekToAngle((i * 7.2) % 720);
      pvChart.getViewModel();
      renderer.getViewModel();
    }

    const totalTimeMs = performance.now() - startTime;
    const timePerFrameMs = totalTimeMs / iterations;

    // Budget: each frame update must take well under 16ms (typically < 1ms)
    expect(timePerFrameMs).toBeLessThan(16.0);

    pvChart.dispose();
    renderer.dispose();
  });
});
