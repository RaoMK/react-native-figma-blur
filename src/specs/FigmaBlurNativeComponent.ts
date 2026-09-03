import type {
  CodegenTypes,
  ColorValue,
  HostComponent,
  ViewProps,
} from 'react-native';
import codegenNativeComponent from 'react-native/Libraries/Utilities/codegenNativeComponent';


type Float = CodegenTypes.Float;
type Int32 = CodegenTypes.Int32;

export interface NativeProps extends ViewProps {
  /**
   * Blur amount in *Figma units* — paste the number straight off the Figma
   * inspector. Converted to a Gaussian sigma identically on both platforms.
   */
  blurRadius?: CodegenTypes.WithDefault<Float, 0>;

  /**
   * 'backdrop' blurs what is behind the view (Figma "Background blur").
   * 'layer'    blurs the view's own children (Figma "Layer blur").
   */
  blurMode?: CodegenTypes.WithDefault<'backdrop' | 'layer', 'backdrop'>;

  /** Overlay tint composited above the blur, matching a Figma fill. */
  tintColor?: ColorValue;

  /**
   * 1.0 is Figma-neutral. iOS system materials saturate the backdrop by ~1.8,
   * which is the single biggest reason stock blurs do not match a Figma mock;
   * we force it back to whatever this says.
   */
  saturation?: CodegenTypes.WithDefault<Float, 1.0>;

  /** 0 = pick automatically from the blur radius. Higher = cheaper, softer. */
  downsampleFactor?: CodegenTypes.WithDefault<Int32, 0>;

  /** Film grain over the blur, 0..1. Hides banding on large flat blurs. */
  noiseOpacity?: CodegenTypes.WithDefault<Float, 0>;

  borderRadiusTopLeft?: CodegenTypes.WithDefault<Float, 0>;
  borderRadiusTopRight?: CodegenTypes.WithDefault<Float, 0>;
  borderRadiusBottomRight?: CodegenTypes.WithDefault<Float, 0>;
  borderRadiusBottomLeft?: CodegenTypes.WithDefault<Float, 0>;

  /**
   * Liquid Glass. 'regular' and 'clear' map to the platform glass material on
   * iOS 26+, and to an AGSL-synthesised equivalent on Android 33+.
   */
  glass?: CodegenTypes.WithDefault<'none' | 'regular' | 'clear', 'none'>;
  glassTintColor?: ColorValue;
  /** Glass reacts to touch with the platform's lensing/highlight response. */
  glassInteractive?: CodegenTypes.WithDefault<boolean, false>;

  /** Painted instead of a blur when no GPU blur backend is available. */
  fallbackColor?: ColorValue;

  /** Set false to cheaply disable the blur without unmounting. */
  enabled?: CodegenTypes.WithDefault<boolean, true>;
}

export default codegenNativeComponent<NativeProps>(
  'FigmaBlurView'
) as HostComponent<NativeProps>;
