import * as React from 'react';
import { FigmaBlurView, type FigmaBlurViewInstance } from './FigmaBlurView';
import type { FigmaBlurProps, GlassVariant } from './core/types';

export interface GlassViewProps extends Omit<FigmaBlurProps, 'glass'> {
  variant?: Exclude<GlassVariant, 'none'>;
}

/**
 * Liquid Glass.
 *
 * On iOS 26+ this is the platform's own glass material. Everywhere else it is
 * synthesised — blur, edge refraction, and a specular rim — from the same sigma
 * model, so the two read as the same material rather than merely both being
 * "frosted".
 *
 * The blurRadius default is the one the platform material itself uses, so the
 * synthesised and native paths land on the same softness.
 */
export const GlassView: React.ForwardRefExoticComponent<
  GlassViewProps & React.RefAttributes<FigmaBlurViewInstance>
> = React.forwardRef<FigmaBlurViewInstance, GlassViewProps>(function GlassView({ variant = 'regular', blurRadius, ...rest }, ref) {
  return (
    <FigmaBlurView
      ref={ref}
      glass={variant}
      blurRadius={blurRadius ?? (variant === 'clear' ? 30 : 60)}
      {...rest}
    />
  );
});
