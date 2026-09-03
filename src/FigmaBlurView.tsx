import * as React from 'react';
import {
  StyleSheet,
  type HostInstance,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import NativeFigmaBlurView from './specs/FigmaBlurNativeComponent';
import type { FigmaBlurProps } from './core/types';

type Corners = {
  borderRadiusTopLeft: number;
  borderRadiusTopRight: number;
  borderRadiusBottomRight: number;
  borderRadiusBottomLeft: number;
};

/**
 * The native view needs the corner radii as four explicit numbers so it can build
 * the rounded-rect mask the blur is clipped to. RN's own border handling would
 * clip the *children*, but the backdrop is composited beneath them and has to be
 * masked separately — so we resolve the style here and pass it down.
 */
function resolveCorners(style: StyleProp<ViewStyle>): Corners {
  const flat = StyleSheet.flatten(style) ?? {};
  const base = flat.borderRadius ?? 0;
  const n = (v: number | string | undefined, fallback: number) =>
    typeof v === 'number' ? v : fallback;
  const b = typeof base === 'number' ? base : 0;
  return {
    borderRadiusTopLeft: n(flat.borderTopLeftRadius, b),
    borderRadiusTopRight: n(flat.borderTopRightRadius, b),
    borderRadiusBottomRight: n(flat.borderBottomRightRadius, b),
    borderRadiusBottomLeft: n(flat.borderBottomLeftRadius, b),
  };
}

/**
 * Ref type for both components. Named explicitly rather than inferred, because an
 * inferred ref type resolves into react-native's internal type paths and cannot be
 * emitted into a portable .d.ts.
 */
export type FigmaBlurViewInstance = HostInstance;

export const FigmaBlurView: React.ForwardRefExoticComponent<
  FigmaBlurProps & React.RefAttributes<FigmaBlurViewInstance>
> = React.forwardRef<FigmaBlurViewInstance, FigmaBlurProps>(function FigmaBlurView(
  {
    blurRadius = 0,
    blurMode = 'backdrop',
    saturation = 1.0,
    downsampleFactor = 0,
    noiseOpacity = 0,
    glass = 'none',
    glassInteractive = false,
    enabled = true,
    style,
    children,
    ...rest
  },
  ref
) {
  const corners = React.useMemo(() => resolveCorners(style), [style]);

  return (
    <NativeFigmaBlurView
      ref={ref}
      style={style}
      blurRadius={blurRadius}
      blurMode={blurMode}
      saturation={saturation}
      downsampleFactor={downsampleFactor}
      noiseOpacity={noiseOpacity}
      glass={glass}
      glassInteractive={glassInteractive}
      enabled={enabled}
      {...corners}
      {...rest}
    >
      {children}
    </NativeFigmaBlurView>
  );
});
