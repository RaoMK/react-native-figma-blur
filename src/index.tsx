export { FigmaBlurView, type FigmaBlurViewInstance } from './FigmaBlurView';
export { GlassView, type GlassViewProps } from './GlassView';
export { Materials, type MaterialName } from './core/presets';
export type { FigmaBlurProps, BlurMode, GlassVariant } from './core/types';

export {
  FIGMA_BLUR_TO_SIGMA,
  figmaBlurToSigma,
  figmaBlurToAndroidRadiusPx,
  sigmaToIosInputRadius,
  skiaRadiusToSigma,
  skiaSigmaToRadius,
  chooseDownsample,
  downscaledSigma,
} from './core/blurMath';

import NativeFigmaBlur, { type Capabilities } from './specs/NativeFigmaBlur';

export type { Capabilities };

/** What the blur backend on this device can actually do. Useful in bug reports. */
export function getCapabilities(): Capabilities {
  return NativeFigmaBlur.getCapabilities();
}
