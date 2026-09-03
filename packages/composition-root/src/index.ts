import {
  InMemoryCalibrationRepository,
  BASELINE_NATURALLY_ASPIRATED_2L,
  PERFORMANCE_TURBO_2L,
} from '@engine-analyzer/calibration';
import { PluginRegistry } from '@engine-analyzer/plugins';
import { BaselineEngineModel } from '@engine-analyzer/baseline-engine';
import { TwoStrokeEngineModel } from '@engine-analyzer/plugin-two-stroke';
import { SimulationOrchestrator } from '@engine-analyzer/orchestrator';
import { SharedCrankAngleController, AnimationControllerOptions } from '@engine-analyzer/animation';
import {
  PressureVolumeChartComponent,
  CrankAngleTimelineOverlayComponent,
  CylinderEngineRendererComponent,
  PerformanceDashboardComponent,
} from '@engine-analyzer/presentation';
import { SimulationResultV1 } from '@engine-analyzer/contracts';

export interface PresentationSuite {
  readonly pvChart: PressureVolumeChartComponent;
  readonly timeline: CrankAngleTimelineOverlayComponent;
  readonly renderer: CylinderEngineRendererComponent;
  readonly dashboard: PerformanceDashboardComponent;
}

export interface SimulationSession {
  readonly result: SimulationResultV1;
  readonly controller: SharedCrankAngleController;
  readonly presentation: PresentationSuite;
  dispose(): void;
}

export interface EngineSimulationApp {
  readonly calibrationRepository: InMemoryCalibrationRepository;
  readonly pluginRegistry: PluginRegistry;
  readonly orchestrator: SimulationOrchestrator;
  createAnimationController(options?: AnimationControllerOptions): SharedCrankAngleController;
  createAnimationController(
    result: SimulationResultV1,
    options?: Omit<AnimationControllerOptions, 'grid'>
  ): SharedCrankAngleController;
  createPresentation(result: SimulationResultV1, controller: SharedCrankAngleController): PresentationSuite;
  createSession(
    result: SimulationResultV1,
    options?: Omit<AnimationControllerOptions, 'grid'>
  ): SimulationSession;
}

export function createEngineSimulationApp(): EngineSimulationApp {
  const calibrationRepository = new InMemoryCalibrationRepository([
    BASELINE_NATURALLY_ASPIRATED_2L,
    PERFORMANCE_TURBO_2L,
  ]);

  const pluginRegistry = new PluginRegistry();
  pluginRegistry.register(new BaselineEngineModel());
  pluginRegistry.register(new TwoStrokeEngineModel());

  const orchestrator = new SimulationOrchestrator({
    calibrationRepository,
    pluginRegistry,
  });

  return {
    calibrationRepository,
    pluginRegistry,
    orchestrator,
    createAnimationController(
      arg?: SimulationResultV1 | AnimationControllerOptions,
      options?: Omit<AnimationControllerOptions, 'grid'>
    ): SharedCrankAngleController {
      if (arg && typeof arg === 'object' && 'schemaVersion' in arg && arg.schemaVersion === 'simulation-result/1') {
        const result = arg as SimulationResultV1;
        return new SharedCrankAngleController({
          ...options,
          grid: result.crankAngleGrid,
          rpm: options?.rpm ?? (result.normalizedConfiguration?.operating?.rpm ?? 1200.0),
        });
      }
      return new SharedCrankAngleController(arg as AnimationControllerOptions);
    },
    createPresentation(result: SimulationResultV1, controller: SharedCrankAngleController): PresentationSuite {
      return {
        pvChart: new PressureVolumeChartComponent(result, controller),
        timeline: new CrankAngleTimelineOverlayComponent(result, controller),
        renderer: new CylinderEngineRendererComponent(result, controller),
        dashboard: new PerformanceDashboardComponent(result),
      };
    },
    createSession(
      result: SimulationResultV1,
      options?: Omit<AnimationControllerOptions, 'grid'>
    ): SimulationSession {
      const controller = new SharedCrankAngleController({
        ...options,
        grid: result.crankAngleGrid,
        rpm: options?.rpm ?? (result.normalizedConfiguration?.operating?.rpm ?? 1200.0),
      });
      const presentation: PresentationSuite = {
        pvChart: new PressureVolumeChartComponent(result, controller),
        timeline: new CrankAngleTimelineOverlayComponent(result, controller),
        renderer: new CylinderEngineRendererComponent(result, controller),
        dashboard: new PerformanceDashboardComponent(result),
      };
      return {
        result,
        controller,
        presentation,
        dispose() {
          controller.dispose();
          presentation.pvChart.dispose();
          presentation.timeline.dispose();
          presentation.renderer.dispose();
        },
      };
    },
  };
}

export * from '@engine-analyzer/contracts';
