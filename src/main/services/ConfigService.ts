import fs from 'fs';
import path from 'path';
import os from 'os';
import { EventEmitter } from 'events';
import { AppConfig, DEFAULT_CONFIG } from '../../shared/types/config';

/**
 * Persists AppConfig to ~/.localhost-manager/config.json and emits `config-changed`
 * so long-lived consumers (polling timers, the tray) can react without a restart.
 */
export class ConfigService extends EventEmitter {
  private configDir: string;
  private configFile: string;
  private config: AppConfig;

  /** `configDir` is injectable so tests do not read or write the real user config. */
  constructor(configDir: string = path.join(os.homedir(), '.localhost-manager')) {
    super();
    this.configDir = configDir;
    this.configFile = path.join(this.configDir, 'config.json');
    this.config = this.loadConfig();
  }

  private loadConfig(): AppConfig {
    try {
      if (fs.existsSync(this.configFile)) {
        const raw = fs.readFileSync(this.configFile, 'utf-8');
        return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
      }
    } catch (err) {
      console.warn('Failed to load config, using defaults:', err);
    }
    return { ...DEFAULT_CONFIG };
  }

  getConfig(): AppConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<AppConfig>): AppConfig {
    const previous = this.config;
    this.config = { ...previous, ...updates };

    try {
      fs.mkdirSync(this.configDir, { recursive: true });
      fs.writeFileSync(this.configFile, JSON.stringify(this.config, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save config:', err);
    }

    this.emit('config-changed', this.getConfig(), previous);
    return this.getConfig();
  }
}
