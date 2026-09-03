import {
  PluginManifest,
  SimulationError,
  SimulationModel,
  parsePluginManifest,
  deepFreeze,
} from '@engine-analyzer/contracts';

export class PluginRegistry {
  private readonly models = new Map<string, SimulationModel>();
  public static readonly SUPPORTED_SCHEMA_MAJOR = 1;

  public register(model: SimulationModel): void {
    if (!model || !model.manifest) {
      throw new SimulationError({
        code: 'INCOMPATIBLE_PLUGIN',
        message: 'Simulation model must have a valid manifest.',
      });
    }

    // Validate manifest schema
    const manifest = parsePluginManifest(model.manifest);

    // Enforce schema major version compatibility
    if (manifest.contractSchemaMajor !== PluginRegistry.SUPPORTED_SCHEMA_MAJOR) {
      throw new SimulationError({
        code: 'INCOMPATIBLE_PLUGIN',
        message: `Plugin '${manifest.id}' has incompatible contractSchemaMajor: ${manifest.contractSchemaMajor}. Host requires major ${PluginRegistry.SUPPORTED_SCHEMA_MAJOR}.`,
        target: manifest.id,
        expected: PluginRegistry.SUPPORTED_SCHEMA_MAJOR,
        actual: manifest.contractSchemaMajor,
      });
    }

    // Enforce unique model IDs
    if (this.models.has(manifest.id)) {
      throw new SimulationError({
        code: 'INCOMPATIBLE_PLUGIN',
        message: `Plugin with ID '${manifest.id}' is already registered. Duplicate plugin IDs are forbidden.`,
        target: manifest.id,
      });
    }

    this.models.set(manifest.id, model);
  }

  public getModel(id: string): SimulationModel {
    const found = this.models.get(id);
    if (!found) {
      throw new SimulationError({
        code: 'MODEL_NOT_FOUND',
        message: `Simulation model '${id}' not found in registry.`,
        target: id,
      });
    }
    return found;
  }

  public hasModel(id: string): boolean {
    return this.models.has(id);
  }

  public listManifests(): readonly PluginManifest[] {
    const list: PluginManifest[] = [];
    for (const m of this.models.values()) {
      list.push(m.manifest);
    }
    return deepFreeze(list);
  }

  public unregister(id: string): boolean {
    return this.models.delete(id);
  }
}
