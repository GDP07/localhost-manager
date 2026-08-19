import { PlatformAdapter } from '../platform/PlatformAdapter';
import { ConfigService } from './ConfigService';

export class TerminalService {
  constructor(
    private platformAdapter: PlatformAdapter,
    private configService: ConfigService
  ) {}

  async openTerminal(dirPath: string): Promise<{ success: boolean; error?: string }> {
    try {
      const config = this.configService.getConfig();
      await this.platformAdapter.openTerminal(dirPath, config.terminalEmulator);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
