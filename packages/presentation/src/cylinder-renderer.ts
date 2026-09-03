import {
  AnimationStateSnapshot,
  CrankAngleController,
  SimulationResultV1,
  SimulationError,
} from '@engine-analyzer/contracts';

export interface CylinderRendererViewModel {
  readonly pistonYPx: number;
  readonly crankPinXPx: number;
  readonly crankPinYPx: number;
  readonly wristPinXPx: number;
  readonly wristPinYPx: number;
  readonly connectingRodAngleDeg: number;
  readonly pistonPositionMm: number;
  readonly cylinderPressureBar: number;
  readonly inCylinderTempK: number;
  readonly hasError: boolean;
  readonly errorMessage?: string;
}

export class CylinderEngineRendererComponent {
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

  public getViewModel(canvasWidth = 400, canvasHeight = 600): CylinderRendererViewModel {
    const posChan = this.simulationResult.channels.find((c) => c.channelId === 'piston_position_mm');
    const rodChan = this.simulationResult.channels.find((c) => c.channelId === 'connecting_rod_angle_deg');
    const pChan = this.simulationResult.channels.find((c) => c.channelId === 'cylinder_pressure_bar');
    const tChan = this.simulationResult.channels.find((c) => c.channelId === 'in_cylinder_temp_k');

    if (!posChan || !rodChan) {
      return {
        pistonYPx: 0,
        crankPinXPx: 0,
        crankPinYPx: 0,
        wristPinXPx: 0,
        wristPinYPx: 0,
        connectingRodAngleDeg: 0,
        pistonPositionMm: 0,
        cylinderPressureBar: 0,
        inCylinderTempK: 0,
        hasError: true,
        errorMessage: 'Missing piston_position_mm or connecting_rod_angle_deg channel',
      };
    }

    const resultGrid = this.simulationResult.crankAngleGrid;
    const cycle = resultGrid.convention.cycleDegrees;
    const sampleIdx = this.currentSnapshot
      ? Math.min(
          posChan.samples.length - 1,
          Math.max(
            0,
            Math.round(
              ((((this.currentSnapshot.angleDegrees % cycle) + cycle) % cycle) - resultGrid.startAngleDeg) /
                (resultGrid.resolutionDeg || 1.0)
            )
          )
        )
      : 0;

    const pistonPosMm = posChan.samples[sampleIdx] ?? 0;
    const rodAngleDeg = rodChan.samples[sampleIdx] ?? 0;
    const pressureBar = pChan ? (pChan.samples[sampleIdx] ?? 1.0) : 1.0;
    const tempK = tChan ? (tChan.samples[sampleIdx] ?? 300.0) : 300.0;

    // Visual-only coordinate mapping:
    // Cylinder center X at canvas center
    const centerX = canvasWidth / 2.0;
    const tdcY = 120; // Top of stroke pixel Y
    const strokeScale = 2.2; // pixels per mm

    const pistonYPx = tdcY + pistonPosMm * strokeScale;
    const crankCenterY = 480;
    const crankRadiusPx = (posChan.max / 2.0) * strokeScale;

    const angleDeg = this.currentSnapshot?.angleDegrees ?? 0;
    const angleRad = (angleDeg * Math.PI) / 180.0;

    // Visual crank pin coordinates
    const crankPinXPx = centerX + crankRadiusPx * Math.sin(angleRad);
    const crankPinYPx = crankCenterY - crankRadiusPx * Math.cos(angleRad);

    const wristPinXPx = centerX;
    const wristPinYPx = pistonYPx + 40; // wrist pin offset from crown

    return {
      pistonYPx: Math.round(pistonYPx * 10) / 10,
      crankPinXPx: Math.round(crankPinXPx * 10) / 10,
      crankPinYPx: Math.round(crankPinYPx * 10) / 10,
      wristPinXPx: Math.round(wristPinXPx * 10) / 10,
      wristPinYPx: Math.round(wristPinYPx * 10) / 10,
      connectingRodAngleDeg: Math.round(rodAngleDeg * 100) / 100,
      pistonPositionMm: Math.round(pistonPosMm * 100) / 100,
      cylinderPressureBar: Math.round(pressureBar * 100) / 100,
      inCylinderTempK: Math.round(tempK),
      hasError: false,
    };
  }

  public renderSvg(width = 400, height = 600): string {
    const vm = this.getViewModel(width, height);
    if (vm.hasError) {
      return `<svg viewBox="0 0 ${width} ${height}"><text x="50%" y="50%" fill="red">${vm.errorMessage}</text></svg>`;
    }

    const centerX = width / 2;
    const cylinderWidth = 140;
    const cylinderLeft = centerX - cylinderWidth / 2;
    const cylinderRight = centerX + cylinderWidth / 2;

    // Chamber color based on pressure/temperature
    const heatAlpha = Math.min(0.8, (vm.cylinderPressureBar / 50.0) * 0.7 + 0.1);
    const chamberColor = `rgba(255, 107, 107, ${heatAlpha.toFixed(2)})`;

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
      <rect width="100%" height="100%" fill="#12121c"/>
      <!-- Cylinder Chamber Background -->
      <rect x="${cylinderLeft}" y="60" width="${cylinderWidth}" height="${vm.pistonYPx - 60}" fill="${chamberColor}"/>
      <!-- Cylinder Walls -->
      <line x1="${cylinderLeft}" y1="60" x2="${cylinderLeft}" y2="380" stroke="#8d99ae" stroke-width="4"/>
      <line x1="${cylinderRight}" y1="60" x2="${cylinderRight}" y2="380" stroke="#8d99ae" stroke-width="4"/>
      <!-- Cylinder Head -->
      <line x1="${cylinderLeft - 10}" y1="60" x2="${cylinderRight + 10}" y2="60" stroke="#8d99ae" stroke-width="8"/>
      <!-- Spark Plug -->
      <rect x="${centerX - 4}" y="40" width="8" height="20" fill="#ffd166"/>
      <!-- Connecting Rod -->
      <line x1="${vm.wristPinXPx}" y1="${vm.wristPinYPx}" x2="${vm.crankPinXPx}" y2="${vm.crankPinYPx}" stroke="#adb5bd" stroke-width="12" stroke-linecap="round"/>
      <!-- Piston -->
      <rect x="${cylinderLeft + 2}" y="${vm.pistonYPx}" width="${cylinderWidth - 4}" height="65" rx="4" fill="#4a5568" stroke="#cbd5e0" stroke-width="2"/>
      <!-- Wrist Pin -->
      <circle cx="${vm.wristPinXPx}" cy="${vm.wristPinYPx}" r="7" fill="#edf2f7"/>
      <!-- Crankshaft Center & Journal -->
      <circle cx="${centerX}" cy="480" r="14" fill="#2b2d42" stroke="#6c757d" stroke-width="2"/>
      <line x1="${centerX}" y1="480" x2="${vm.crankPinXPx}" y2="${vm.crankPinYPx}" stroke="#495057" stroke-width="16" stroke-linecap="round"/>
      <circle cx="${vm.crankPinXPx}" cy="${vm.crankPinYPx}" r="9" fill="#f8f9fa"/>
      <!-- Readouts -->
      <text x="20" y="30" fill="#e0e1dd" font-size="13">Pressure: ${vm.cylinderPressureBar} bar</text>
      <text x="20" y="48" fill="#e0e1dd" font-size="13">Temp: ${vm.inCylinderTempK} K</text>
      <text x="${width - 20}" y="30" fill="#e0e1dd" font-size="13" text-anchor="end">Pos: ${vm.pistonPositionMm} mm</text>
    </svg>`;
  }

  public dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }
}
