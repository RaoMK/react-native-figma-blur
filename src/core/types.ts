import type { ColorValue, ViewProps } from 'react-native';

export type BlurMode = 'backdrop' | 'layer';
export type GlassVariant = 'none' | 'regular' | 'clear';

export interface FigmaBlurProps extends ViewProps {
  /** Blur amount in Figma units — the number shown in Figma's inspector. */
  blurRadius?: number;
  blurMode?: BlurMode;
  tintColor?: ColorValue;
  /** 1.0 = Figma-neutral (no saturation boost). */
  saturation?: number;
  /** 0 = auto. */
  downsampleFactor?: number;
  noiseOpacity?: number;
  glass?: GlassVariant;
  glassTintColor?: ColorValue;
  glassInteractive?: boolean;
  fallbackColor?: ColorValue;
  enabled?: boolean;
}
