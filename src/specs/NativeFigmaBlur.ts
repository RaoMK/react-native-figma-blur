import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Capabilities {
  /** True when a real GPU backdrop blur is available on this device. */
  hasBackdropBlur: boolean;
  /** True when the exact-sigma path is active; false means calibrated approximation. */
  hasExactRadius: boolean;
  /** True when the platform's own Liquid Glass material is available. */
  hasNativeGlass: boolean;
  /** True when glass can be synthesised via a runtime shader (Android). */
  hasShaderGlass: boolean;
  /** Which implementation is live, for diagnostics: e.g. "ios.caFilter". */
  engine: string;
  /** OS API level (Android) or major version (iOS). */
  apiLevel: number;
}

export interface Spec extends TurboModule {
  getCapabilities(): Capabilities;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeFigmaBlur');
