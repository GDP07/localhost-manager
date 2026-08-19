import { PlatformAdapter } from '../platform/PlatformAdapter';

export class BrowserService {
  constructor(private platformAdapter: PlatformAdapter) {}

  async openUrl(url: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.platformAdapter.openBrowser(url);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
