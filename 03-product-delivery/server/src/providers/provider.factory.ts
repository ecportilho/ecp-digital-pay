import type { PaymentProvider } from './payment-provider.interface.js';
import { AsaasAdapter } from './asaas/asaas.adapter.js';
import { InternalAdapter } from './internal/internal.adapter.js';
import { getFeatureFlag, setFeatureFlag } from '../shared/utils/feature-flags.js';
import { auditLog } from '../shared/utils/audit.js';

export type ProviderMode = 'internal' | 'external';

export class ProviderFactory {
  private static instance: PaymentProvider | null = null;
  private static currentMode: ProviderMode | null = null;

  static getProvider(): PaymentProvider {
    const mode = (getFeatureFlag('PAYMENT_PROVIDER', 'internal') as ProviderMode);

    if (!this.instance || this.currentMode !== mode) {
      this.instance = mode === 'external'
        ? new AsaasAdapter()
        : new InternalAdapter();
      this.currentMode = mode;
    }

    return this.instance;
  }

  static getCurrentMode(): ProviderMode {
    return this.currentMode ?? (getFeatureFlag('PAYMENT_PROVIDER', 'internal') as ProviderMode);
  }

  static switchProvider(mode: ProviderMode, userId: string): void {
    const previousMode = this.currentMode;
    setFeatureFlag('PAYMENT_PROVIDER', mode, userId);
    auditLog({
      userId,
      action: 'SWITCH_PROVIDER',
      resource: 'provider',
      metadata: { from: previousMode, to: mode },
    });
    this.instance = null; // force recreation on next getProvider()
    this.currentMode = mode;
  }
}
