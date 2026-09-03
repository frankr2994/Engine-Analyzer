import {
  AnimationStateSnapshot,
  CrankAngleController,
  SimulationResultV1,
  SimulationError,
} from '@engine-analyzer/contracts';

export interface Viewport2D {
  readonly width: number;
  readonly height: number;
  readonly padding: number;
}

export interface PVChartPoint {
  readonly volumeCm3: number;
  readonly pressureBar: number;
  readonly xPx: number;
  readonly yPx: number;
}

export interface PVChartViewModel {
  readonly points: readonly PVChartPoint[];
  readonly currentPoint?: PVChartPoint;
  readonly xMin: number;
  readonly xMax: number;
  readonly yMin: number;
  readonly yMax: number;
  readonly imepBar: number;
  readonly hasError: boolean;
  readonly errorMessage?: string;
}

export class PressureVolumeChartComponent {
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

  public getViewModel(viewport: Viewport2D = { width: 800, height: 600, padding: 50 }): PVChartViewModel {
    const pChan = this.simulationResult.channels.find((c) => c.channelId === 'cylinder_pressure_bar');
    const vChan = this.simulationResult.channels.find((c) => c.channelId === 'cylinder_volume_cm3');

    if (!pChan || !vChan) {
      return {
        points: [],
        xMin: 0,
        xMax: 0,
        yMin: 0,
        yMax: 0,
        imepBar: 0,
        hasError: true,
        errorMessage: 'Missing required channels: cylinder_pressure_bar or cylinder_volume_cm3',
      };
    }

    const xMin = vChan.min;
    const xMax = vChan.max;
    const yMin = 0;
    const yMax = pChan.max * 1.05;

    const plotW = viewport.width - 2 * viewport.padding;
    const plotH = viewport.height - 2 * viewport.padding;

    const projectX = (v: number) => viewport.padding + ((v - xMin) / (xMax - xMin || 1)) * plotW;
    const projectY = (p: number) => viewport.height - viewport.padding - ((p - yMin) / (yMax - yMin || 1)) * plotH;

    const points: PVChartPoint[] = [];
    const count = Math.min(pChan.samples.length, vChan.samples.length);

    for (let i = 0; i < count; i++) {
      const v = vChan.samples[i] ?? 0;
      const p = pChan.samples[i] ?? 0;
      points.push({
        volumeCm3: v,
        pressureBar: p,
        xPx: Math.round(projectX(v) * 10) / 10,
        yPx: Math.round(projectY(p) * 10) / 10,
      });
    }

    let currentPoint: PVChartPoint | undefined;
    if (this.currentSnapshot) {
      const resultGrid = this.simulationResult.crankAngleGrid;
      const cycle = resultGrid.convention.cycleDegrees;
      const normalizedAngle = ((this.currentSnapshot.angleDegrees % cycle) + cycle) % cycle;
      const authoritativeIdx = Math.min(
        count - 1,
        Math.max(0, Math.round((normalizedAngle - resultGrid.startAngleDeg) / (resultGrid.resolutionDeg || 1.0)))
      );
      currentPoint = points[authoritativeIdx];
    }

    return {
      points,
      currentPoint,
      xMin,
      xMax,
      yMin,
      yMax,
      imepBar: this.simulationResult.summary.imepBar,
      hasError: false,
    };
  }

  public renderSvg(viewport: Viewport2D = { width: 800, height: 600, padding: 50 }): string {
    const vm = this.getViewModel(viewport);
    if (vm.hasError) {
      return `<svg viewBox="0 0 ${viewport.width} ${viewport.height}"><text x="50%" y="50%" text-anchor="middle" fill="red">${vm.errorMessage}</text></svg>`;
    }

    const pathData = vm.points.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.xPx} ${pt.yPx}`).join(' ') + ' Z';
    const currentMarker = vm.currentPoint
      ? `<circle cx="${vm.currentPoint.xPx}" cy="${vm.currentPoint.yPx}" r="6" fill="#e63946" stroke="#ffffff" stroke-width="2" />`
      : '';

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewport.width} ${viewport.height}">
      <rect width="100%" height="100%" fill="#1a1a24"/>
      <!-- Axes -->
      <line x1="${viewport.padding}" y1="${viewport.height - viewport.padding}" x2="${viewport.width - viewport.padding}" y2="${viewport.height - viewport.padding}" stroke="#6c757d" stroke-width="1.5"/>
      <line x1="${viewport.padding}" y1="${viewport.padding}" x2="${viewport.padding}" y2="${viewport.height - viewport.padding}" stroke="#6c757d" stroke-width="1.5"/>
      <!-- PV Trace -->
      <path d="${pathData}" fill="rgba(76, 201, 240, 0.15)" stroke="#4cc9f0" stroke-width="2.5" />
      ${currentMarker}
      <text x="${viewport.width / 2}" y="${viewport.height - 15}" fill="#adb5bd" text-anchor="middle" font-size="12">Volume (cm³)</text>
      <text x="20" y="${viewport.height / 2}" fill="#adb5bd" text-anchor="middle" transform="rotate(-90 20 ${viewport.height / 2})" font-size="12">Pressure (bar)</text>
    </svg>`;
  }

  public dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }
}
