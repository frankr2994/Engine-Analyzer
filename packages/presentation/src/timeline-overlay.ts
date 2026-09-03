import {
  AnimationStateSnapshot,
  CrankAngleController,
  SimulationResultV1,
  SimulationError,
} from '@engine-analyzer/contracts';

export interface TimelinePhase {
  readonly name: string;
  readonly startDeg: number;
  readonly endDeg: number;
  readonly color: string;
}

export interface TimelineViewModel {
  readonly phases: readonly TimelinePhase[];
  readonly currentAngleDeg: number;
  readonly normalizedProgress: number;
  readonly cycleDegrees: number;
  readonly sparkMarkerDeg?: number;
}

export class CrankAngleTimelineOverlayComponent {
  private currentSnapshot: AnimationStateSnapshot | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly simulationResult: SimulationResultV1,
    private readonly controller: CrankAngleController
  ) {
    if (!controller) {
      throw new SimulationError({
        code: 'VALIDATION_FAILED',
        message: 'A synchronized CrankAngleController is required for presentation.',
      });
    }

    const controllerCycle = controller.getState().cycleDegrees;
    const resultGrid = simulationResult.crankAngleGrid;
    const resultCycle = resultGrid.convention.cycleDegrees;
    if (controllerCycle !== resultCycle) {
      throw new SimulationError({
        code: 'INCOMPATIBLE_ANGLE_GRID',
        message: `Controller cycle degrees (${controllerCycle}°) does not match simulation result cycle degrees (${resultCycle}°).`,
        expected: resultCycle,
        actual: controllerCycle,
      });
    }

    if (controller.grid) {
      const cGrid = controller.grid;
      if (
        cGrid.convention.conventionId !== resultGrid.convention.conventionId ||
        cGrid.convention.cycleDegrees !== resultGrid.convention.cycleDegrees ||
        cGrid.resolutionDeg !== resultGrid.resolutionDeg ||
        cGrid.sampleCount !== resultGrid.sampleCount ||
        cGrid.startAngleDeg !== resultGrid.startAngleDeg ||
        cGrid.endAngleDeg !== resultGrid.endAngleDeg
      ) {
        throw new SimulationError({
          code: 'INCOMPATIBLE_ANGLE_GRID',
          message: `Controller grid [${cGrid.convention.conventionId}, ${cGrid.convention.cycleDegrees}°, res=${cGrid.resolutionDeg}°, count=${cGrid.sampleCount}] does not match simulation result grid [${resultGrid.convention.conventionId}, ${resultGrid.convention.cycleDegrees}°, res=${resultGrid.resolutionDeg}°, count=${resultGrid.sampleCount}].`,
          expected: {
            conventionId: resultGrid.convention.conventionId,
            cycleDegrees: resultGrid.convention.cycleDegrees,
            resolutionDeg: resultGrid.resolutionDeg,
            sampleCount: resultGrid.sampleCount,
          },
          actual: {
            conventionId: cGrid.convention.conventionId,
            cycleDegrees: cGrid.convention.cycleDegrees,
            resolutionDeg: cGrid.resolutionDeg,
            sampleCount: cGrid.sampleCount,
          },
        });
      }
    }

    this.unsubscribe = controller.subscribe((state) => {
      this.currentSnapshot = state;
    });
  }

  public getViewModel(): TimelineViewModel {
    const cycle = this.simulationResult.crankAngleGrid.convention.cycleDegrees;

    const phases: TimelinePhase[] = cycle === 720
      ? [
          { name: 'Power (Expansion)', startDeg: 0, endDeg: 180, color: '#f72585' },
          { name: 'Exhaust', startDeg: 180, endDeg: 360, color: '#7209b7' },
          { name: 'Intake', startDeg: 360, endDeg: 540, color: '#4361ee' },
          { name: 'Compression', startDeg: 540, endDeg: 720, color: '#4cc9f0' },
        ]
      : [
          { name: 'Power / Exhaust', startDeg: 0, endDeg: 180, color: '#f72585' },
          { name: 'Scavenge / Compression', startDeg: 180, endDeg: 360, color: '#4cc9f0' },
        ];

    const currentAngle = this.currentSnapshot?.angleDegrees ?? 0;
    const progress = currentAngle / cycle;

    return {
      phases,
      currentAngleDeg: currentAngle,
      normalizedProgress: progress,
      cycleDegrees: cycle,
    };
  }

  public renderHtml(): string {
    const vm = this.getViewModel();
    const phaseBars = vm.phases
      .map((p) => {
        const widthPct = ((p.endDeg - p.startDeg) / vm.cycleDegrees) * 100;
        return `<div style="width: ${widthPct}%; background: ${p.color}; height: 24px; display: inline-block; text-align: center; color: white; font-size: 11px; line-height: 24px;">${p.name}</div>`;
      })
      .join('');

    const needleLeft = (vm.normalizedProgress * 100).toFixed(1);

    return `<div style="position: relative; width: 100%; font-family: sans-serif;">
      <div style="display: flex; width: 100%; border-radius: 4px; overflow: hidden;">${phaseBars}</div>
      <div style="position: absolute; top: -4px; left: ${needleLeft}%; width: 2px; height: 32px; background: #fff; box-shadow: 0 0 4px #000;"></div>
      <div style="margin-top: 6px; font-size: 12px; color: #ced4da;">Current Angle: <strong>${vm.currentAngleDeg.toFixed(1)}°</strong> / ${vm.cycleDegrees}°</div>
    </div>`;
  }

  public dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }
}
