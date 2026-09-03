// Deliberately illegal fixture: orchestrator importing non-allowlisted kinematics package
import { KinematicsCalculationModule } from '@engine-analyzer/kinematics';

export interface BadOrchestrator {
  module: KinematicsCalculationModule;
}
