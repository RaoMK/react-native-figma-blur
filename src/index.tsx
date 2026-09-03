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

export { getCapabilities } from './core/capabilities';
export type { Capabilities } from './specs/NativeFigmaBlur';
