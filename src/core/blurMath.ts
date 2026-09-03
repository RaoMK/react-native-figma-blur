/**
 * The canonical blur model.
 *
 * Everything in this library — iOS, Android, and the parity harness — derives its
 * numbers from this one file. There is exactly one definition of "how blurry",
 * expressed as the standard deviation (sigma) of a Gaussian, in density-independent
 * points. Each platform then converts sigma into whatever unit its blur primitive
 * happens to want. That conversion is the *only* place platforms differ, which is
 * what makes them match.
 *
 * Do not introduce a second notion of "radius" anywhere else.
 */

/**
 * Figma's blur value -> Gaussian sigma.
 *
 * A Figma layer/background blur of N renders as a Gaussian with sigma = N/2.
 * This is verifiable: Figma's own "Copy as CSS" emits `filter: blur(N/2 px)`, and
 * the CSS Filter Effects spec defines `blur(<length>)` as the standard deviation.
 *
 * Verified end-to-end by `parity/measure.mjs` against exported Figma PNGs.
 */
export const FIGMA_BLUR_TO_SIGMA = 0.5;

/**
 * Skia's radius->sigma conversion, used verbatim by Android's
 * `RenderEffect.createBlurEffect`, which passes its radius argument through
 * `SkBlurMask::ConvertRadiusToSigma` before handing it to `SkImageFilters::Blur`.
 *
 *   sigma = 0.57735 * radius + 0.5
 *
 * We need the inverse, because we speak sigma and it wants radius.
 */
const SKIA_RADIUS_TO_SIGMA_SLOPE = 0.57735;
const SKIA_RADIUS_TO_SIGMA_INTERCEPT = 0.5;

/** Android caps a single RenderEffect blur pass at this radius, in pixels. */
export const ANDROID_MAX_BLUR_RADIUS_PX = 250;

export function skiaRadiusToSigma(radius: number): number {
  if (radius <= 0) return 0;
  return SKIA_RADIUS_TO_SIGMA_SLOPE * radius + SKIA_RADIUS_TO_SIGMA_INTERCEPT;
}

export function skiaSigmaToRadius(sigma: number): number {
  if (sigma <= SKIA_RADIUS_TO_SIGMA_INTERCEPT) return 0;
  return (sigma - SKIA_RADIUS_TO_SIGMA_INTERCEPT) / SKIA_RADIUS_TO_SIGMA_SLOPE;
}

/**
 * Core Animation's `gaussianBlur` filter takes `inputRadius` in *points*, and it
 * behaves as the Gaussian sigma directly — so the default factor is 1.0.
 *
 * It is a named constant rather than an inlined `1` because it is a calibration
 * target: `parity/measure.mjs` fits it against a Figma reference render, and if a
 * future iOS changes the filter's interpretation this is the single number to move.
 */
export const IOS_SIGMA_TO_INPUT_RADIUS = 1.0;

/** Figma blur value -> sigma in points. The one entry point. */
export function figmaBlurToSigma(figmaBlur: number): number {
  return Math.max(0, figmaBlur) * FIGMA_BLUR_TO_SIGMA;
}

export function sigmaToIosInputRadius(sigmaPoints: number): number {
  return sigmaPoints * IOS_SIGMA_TO_INPUT_RADIUS;
}

/**
 * Choose how far to downscale the backdrop before blurring it on Android.
 *
 * Downscaling is what makes a large blur cheap: blurring at 1/4 scale is ~16x less
 * work, and the result is visually indistinguishable because we are about to throw
 * away high frequencies anyway. We target a post-downscale sigma of ~4px, which is
 * small enough to be nearly free on a low-end GPU and large enough that the
 * downscale itself is not the dominant term.
 *
 * Also keeps the radius under Android's 250px hard cap: at sigma 4 the radius is
 * ~6px, so the cap is unreachable no matter how large the requested blur.
 */
const TARGET_DOWNSCALED_SIGMA_PX = 4;
const MAX_DOWNSAMPLE = 8;

export function chooseDownsample(sigmaPx: number): number {
  if (sigmaPx <= TARGET_DOWNSCALED_SIGMA_PX) return 1;
  const ideal = Math.round(sigmaPx / TARGET_DOWNSCALED_SIGMA_PX);
  return Math.min(MAX_DOWNSAMPLE, Math.max(1, ideal));
}

/**
 * The sigma to apply *in downscaled space* so that the final upscaled result has
 * the sigma we actually asked for.
 *
 * The naive answer is `sigmaPx / d`, but that overshoots: the bilinear downscale is
 * itself a box filter of width d, and it contributes its own blur. Blurs compose in
 * variance, not in sigma, so we subtract the box filter's variance ((d^2 - 1)/12)
 * before dividing. Skipping this is why most downscaling blur implementations come
 * out visibly softer than the reference they are trying to match.
 */
export function downscaledSigma(sigmaPx: number, downsample: number): number {
  if (downsample <= 1) return sigmaPx;
  const boxVariance = (downsample * downsample - 1) / 12;
  const corrected = Math.sqrt(Math.max(0, sigmaPx * sigmaPx - boxVariance));
  return corrected / downsample;
}

/** Full Android pipeline: Figma blur value -> the radius to hand RenderEffect. */
export function figmaBlurToAndroidRadiusPx(
  figmaBlur: number,
  density: number,
  downsample?: number
): { radiusPx: number; downsample: number } {
  const sigmaPx = figmaBlurToSigma(figmaBlur) * density;
  const d = downsample ?? chooseDownsample(sigmaPx);
  const radiusPx = skiaSigmaToRadius(downscaledSigma(sigmaPx, d));
  return {
    radiusPx: Math.min(radiusPx, ANDROID_MAX_BLUR_RADIUS_PX),
    downsample: d,
  };
}
