package com.figmablur

import kotlin.math.exp
import kotlin.math.roundToInt
import kotlin.math.sqrt

/**
 * Kotlin mirror of src/core/blurMath.ts and ios/FigmaBlurMath.h.
 *
 * There is one blur model in this library and this is its Android face. The only
 * thing that differs from iOS is the last step, where sigma is converted into the
 * unit the platform's blur primitive expects — which is precisely why the two
 * platforms end up looking the same.
 *
 * `parity/measure.mjs` asserts these constants match their TypeScript originals,
 * so a drift fails CI instead of quietly desyncing the platforms.
 */
object BlurMath {

  /** A Figma blur of N renders as a Gaussian with sigma = N/2. */
  const val FIGMA_BLUR_TO_SIGMA = 0.5

  /**
   * Skia's own radius->sigma conversion. `RenderEffect.createBlurEffect` does not
   * take a sigma: it passes its radius argument through
   * `SkBlurMask::ConvertRadiusToSigma` before reaching `SkImageFilters::Blur`.
   * We speak sigma, so we invert it.
   */
  private const val SKIA_SLOPE = 0.57735
  private const val SKIA_INTERCEPT = 0.5

  /** Hard cap on a single RenderEffect blur pass, in pixels. */
  const val MAX_BLUR_RADIUS_PX = 250.0

  private const val TARGET_DOWNSCALED_SIGMA_PX = 4.0
  private const val MAX_DOWNSAMPLE = 8

  fun figmaBlurToSigma(figmaBlur: Double): Double =
    (if (figmaBlur > 0) figmaBlur else 0.0) * FIGMA_BLUR_TO_SIGMA

  fun sigmaToSkiaRadius(sigma: Double): Double =
    if (sigma <= SKIA_INTERCEPT) 0.0 else (sigma - SKIA_INTERCEPT) / SKIA_SLOPE

  fun skiaRadiusToSigma(radius: Double): Double =
    if (radius <= 0) 0.0 else SKIA_SLOPE * radius + SKIA_INTERCEPT

  /**
   * How far to shrink the backdrop before blurring it.
   *
   * Blurring at 1/4 scale is ~16x less work and visually identical, because the
   * detail thrown away by the downscale is detail the blur was about to destroy.
   * This is the single biggest reason the Android path stays smooth on a low-end
   * GPU. It also puts the radius permanently out of reach of the 250px cap: at a
   * post-downscale sigma of ~4 the radius is ~6.
   */
  fun chooseDownsample(sigmaPx: Double): Int {
    if (sigmaPx <= TARGET_DOWNSCALED_SIGMA_PX) return 1
    val ideal = (sigmaPx / TARGET_DOWNSCALED_SIGMA_PX).roundToInt()
    return ideal.coerceIn(1, MAX_DOWNSAMPLE)
  }

  /**
   * The sigma to apply in downscaled space so the upscaled result has the sigma
   * that was actually asked for.
   *
   * `sigmaPx / d` is the tempting answer and it is wrong: the downscale is itself
   * a box filter of width d and contributes its own blur. Blurs compose in
   * variance rather than in sigma, so the box's variance comes out first. Omitting
   * this is why most downscaling blur implementations land visibly softer than
   * their reference.
   */
  fun downscaledSigma(sigmaPx: Double, downsample: Int): Double {
    if (downsample <= 1) return sigmaPx
    val boxVariance = (downsample.toDouble() * downsample - 1.0) / 12.0
    return sqrt((sigmaPx * sigmaPx - boxVariance).coerceAtLeast(0.0)) / downsample
  }

  /** Full pipeline: Figma blur value -> the radius to hand RenderEffect. */
  fun blurRadiusPx(figmaBlur: Double, density: Float, forcedDownsample: Int): BlurPlan {
    val sigmaPx = figmaBlurToSigma(figmaBlur) * density
    val downsample = if (forcedDownsample > 0) forcedDownsample else chooseDownsample(sigmaPx)
    val radius = sigmaToSkiaRadius(downscaledSigma(sigmaPx, downsample))
    return BlurPlan(
      sigmaPx = sigmaPx,
      downsample = downsample,
      radiusPx = radius.coerceAtMost(MAX_BLUR_RADIUS_PX).toFloat(),
    )
  }

  /**
   * How far past the view's own bounds the backdrop capture has to reach.
   *
   * A Gaussian is effectively zero beyond 3 sigma, so capturing that much extra
   * means every pixel inside the view is blurred from real content rather than
   * from a clamped edge. Skip this and the blur visibly changes character in a
   * band around the border — the classic tell of a home-grown backdrop blur.
   */
  fun capturePaddingPx(sigmaPx: Double): Int = kotlin.math.ceil(sigmaPx * 3.0).toInt()

  /** Approximation curve, mirrored from the iOS material fallback. */
  fun sigmaToMaterialFraction(sigmaPx: Double): Double =
    (1.0 - exp(-sigmaPx / 18.0)).coerceIn(0.0, 1.0)
}

data class BlurPlan(
  val sigmaPx: Double,
  val downsample: Int,
  val radiusPx: Float,
)
