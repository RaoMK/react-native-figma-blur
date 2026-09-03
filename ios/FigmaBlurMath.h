#pragma once
#include <math.h>

/**
 * C mirror of src/core/blurMath.ts. Kept deliberately tiny and dependency-free so
 * the same arithmetic runs on both platforms and in the parity harness.
 *
 * If you change a constant here, change it there. `parity/measure.mjs` asserts the
 * two agree, so a drift fails CI rather than silently desyncing the platforms.
 */

static const double kFigmaBlurToSigma = 0.5;
static const double kIosSigmaToInputRadius = 1.0;
static const double kTargetDownscaledSigmaPx = 4.0;
static const double kMaxDownsample = 8.0;

static inline double FBFigmaBlurToSigma(double figmaBlur) {
  return (figmaBlur > 0 ? figmaBlur : 0) * kFigmaBlurToSigma;
}

/// See blurMath.ts: blurs compose in variance, so the downscale's own box filter
/// has to be subtracted out or the result lands visibly softer than the reference.
static inline double FBDownscaledSigma(double sigmaPx, double downsample) {
  if (downsample <= 1.0) return sigmaPx;
  double boxVariance = (downsample * downsample - 1.0) / 12.0;
  double v = sigmaPx * sigmaPx - boxVariance;
  return sqrt(v > 0 ? v : 0) / downsample;
}

static inline double FBChooseDownsample(double sigmaPx) {
  if (sigmaPx <= kTargetDownscaledSigmaPx) return 1.0;
  double ideal = round(sigmaPx / kTargetDownscaledSigmaPx);
  if (ideal > kMaxDownsample) return kMaxDownsample;
  return ideal < 1.0 ? 1.0 : ideal;
}

static inline double FBSigmaToInputRadius(double sigmaPoints) {
  return sigmaPoints * kIosSigmaToInputRadius;
}

/**
 * Fitted curve for the approximate path only (FigmaBlurEngineMaterialIntensity),
 * where the radius genuinely cannot be set and all we can vary is how far a system
 * material is "faded in". Saturating, because a material's blur stops growing.
 * Only ever reached if the exact paths are unavailable.
 */
static inline double FBSigmaToMaterialFraction(double sigmaPoints) {
  double f = 1.0 - exp(-sigmaPoints / 18.0);
  if (f < 0.0) return 0.0;
  if (f > 1.0) return 1.0;
  return f;
}
