package com.figmablur

import android.graphics.BlendMode
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.RenderEffect
import android.graphics.RenderNode
import android.graphics.RuntimeShader
import android.graphics.Shader
import android.os.Build
import android.view.View
import androidx.annotation.RequiresApi
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.random.Random

/**
 * Everything that needs API 31+ lives here, and nothing else does.
 *
 * The separation is not stylistic. [FigmaBlurView] is loaded on every device the
 * library installs on, down to API 24, and a class that merely *mentions*
 * RenderNode in a method body can fail ART's verifier on a platform where that
 * class does not exist. Keeping the framework calls inside a type that is only
 * ever instantiated behind a version check means the verifier never looks at
 * them on an old device.
 */
@RequiresApi(Build.VERSION_CODES.S)
class HardwareBackdrop {

  private val node = RenderNode("FigmaBlurBackdrop")
  private var noisePaint: Paint? = null

  companion object {
    private const val NOISE_TILE = 128
    private val HAS_SHADER_GLASS = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
  }

  fun discard() {
    node.discardDisplayList()
    noisePaint = null
  }

  // --- effect ------------------------------------------------------------

  fun updateEffect(
    plan: BlurPlan,
    saturation: Double,
    glassVariant: String,
    glassTintColor: Int,
    cornerRadiusPx: Float,
    bounds: RectF,
    capturePad: Int,
    density: Float,
  ) {
    var effect: RenderEffect? =
      if (plan.radiusPx > 0f) {
        // CLAMP rather than DECAL: DECAL samples transparent past the texture
        // edge and fades the blur out around its own border. The 3-sigma capture
        // padding puts the clamped region off-screen anyway.
        RenderEffect.createBlurEffect(plan.radiusPx, plan.radiusPx, Shader.TileMode.CLAMP)
      } else null

    if (abs(saturation - 1.0) > 0.01) {
      val matrix = ColorMatrix().apply { setSaturation(saturation.toFloat()) }
      val saturate = RenderEffect.createColorFilterEffect(ColorMatrixColorFilter(matrix))
      effect = if (effect != null) RenderEffect.createChainEffect(saturate, effect) else saturate
    }

    val glass = glassEffect(glassVariant, glassTintColor, cornerRadiusPx, bounds, capturePad,
                            density, plan.downsample)
    if (glass != null) {
      effect = if (effect != null) RenderEffect.createChainEffect(glass, effect) else glass
    }

    node.setRenderEffect(effect)
  }

  private fun glassEffect(
    variant: String,
    tintColor: Int,
    cornerRadiusPx: Float,
    bounds: RectF,
    capturePad: Int,
    density: Float,
    downsample: Int,
  ): RenderEffect? {
    if (!HAS_SHADER_GLASS || variant == "none" || bounds.isEmpty) return null

    val d = downsample.toFloat()
    // The shader runs inside the downscaled node, so every length handed to it is
    // expressed in that space — otherwise the rim would grow with the blur radius.
    val shader = RuntimeShader(GlassShader.AGSL).apply {
      setFloatUniform(
        "uSize",
        (bounds.width() + capturePad * 2) / d,
        (bounds.height() + capturePad * 2) / d,
      )
      setFloatUniform("uRadius", cornerRadiusPx / d)
      setFloatUniform("uBand", (GlassShader.BAND_DP * density / d).toFloat())
      setFloatUniform("uRefraction", (GlassShader.REFRACTION_DP * density / d).toFloat())
      setFloatUniform(
        "uSpecular",
        (if (variant == "clear") GlassShader.SPECULAR_CLEAR
         else GlassShader.SPECULAR_REGULAR).toFloat(),
      )
      setColorUniform("uTint", tintColor)
    }
    return RenderEffect.createRuntimeShaderEffect(shader, "backdrop")
  }

  /** Layer blur: filter the host's own children rather than what is behind it. */
  fun applyLayerBlur(host: View, sigmaPx: Double) {
    if (sigmaPx <= 0.0) {
      host.setRenderEffect(null)
      return
    }
    val radius = BlurMath.sigmaToSkiaRadius(sigmaPx)
      .coerceAtMost(BlurMath.MAX_BLUR_RADIUS_PX).toFloat()
    // DECAL, not CLAMP: a layer blur falls off at the content's own edge, which
    // is what Figma's Layer blur does.
    host.setRenderEffect(RenderEffect.createBlurEffect(radius, radius, Shader.TileMode.DECAL))
  }

  fun clearLayerBlur(host: View) {
    host.setRenderEffect(null)
  }

  // --- capture -----------------------------------------------------------

  private val location = IntArray(2)
  private val rootLocation = IntArray(2)

  fun capture(host: View, root: View, downsample: Int, capturePad: Int) {
    if (host.width == 0 || host.height == 0) return

    val capW = host.width + capturePad * 2
    val capH = host.height + capturePad * 2
    val scaledW = ceil(capW.toDouble() / downsample).toInt().coerceAtLeast(1)
    val scaledH = ceil(capH.toDouble() / downsample).toInt().coerceAtLeast(1)

    host.getLocationOnScreen(location)
    root.getLocationOnScreen(rootLocation)
    val originX = (location[0] - rootLocation[0] - capturePad).toFloat()
    val originY = (location[1] - rootLocation[1] - capturePad).toFloat()

    node.setPosition(0, 0, scaledW, scaledH)

    // Exclude the host from its own backdrop, or the blur is fed its previous
    // output and smears a little more every frame.
    //
    // This has to be done with visibility rather than with a "skip drawing"
    // flag. On a hardware canvas ViewGroup.drawChild never calls a child's
    // draw(Canvas) — it emits drawRenderNode(child), and that reference resolves
    // at composite time, by which point the host's node holds the blur again. An
    // INVISIBLE child is skipped during dispatchDraw itself, so nothing
    // referring to the host is ever recorded.
    val restoreVisibility = host.visibility
    host.visibility = View.INVISIBLE

    val canvas = node.beginRecording(scaledW, scaledH)
    try {
      canvas.scale(1f / downsample, 1f / downsample)
      canvas.translate(-originX, -originY)
      root.draw(canvas)
    } finally {
      node.endRecording()
      host.visibility = restoreVisibility
    }
  }

  // --- draw --------------------------------------------------------------

  fun draw(canvas: Canvas, capturePad: Int, downsample: Int): Boolean {
    if (!node.hasDisplayList()) return false
    // drawRenderNode needs a hardware canvas. A software canvas here means
    // something is capturing the host into a bitmap, and the fallback colour is a
    // more honest answer than an unblurred backdrop.
    if (!canvas.isHardwareAccelerated) return false

    // Host space -> node space: the node holds a region starting `capturePad`
    // above and left of the host, stored at 1/downsample scale.
    canvas.translate(-capturePad.toFloat(), -capturePad.toFloat())
    canvas.scale(downsample.toFloat(), downsample.toFloat())
    canvas.drawRenderNode(node)
    return true
  }

  // --- noise -------------------------------------------------------------

  /**
   * A large flat blur bands visibly on an 8-bit display. A little grain dithers
   * the steps away. One 128px tile, generated once and repeated.
   */
  fun noisePaint(opacity: Double): Paint? {
    if (opacity <= 0.001) {
      noisePaint = null
      return null
    }
    val paint = noisePaint ?: Paint(Paint.ANTI_ALIAS_FLAG).also {
      it.shader = android.graphics.BitmapShader(
        buildNoiseTile(), Shader.TileMode.REPEAT, Shader.TileMode.REPEAT
      )
      it.blendMode = BlendMode.OVERLAY
      noisePaint = it
    }
    paint.alpha = (opacity.coerceIn(0.0, 1.0) * 255).toInt()
    return paint
  }

  private fun buildNoiseTile(): Bitmap {
    val pixels = IntArray(NOISE_TILE * NOISE_TILE)
    // Seeded, so every view and every run produces the same grain. Random noise
    // that changes between frames reads as shimmer, not as texture.
    val random = Random(0)
    for (i in pixels.indices) {
      val v = random.nextInt(256)
      pixels[i] = Color.argb(255, v, v, v)
    }
    return Bitmap.createBitmap(pixels, NOISE_TILE, NOISE_TILE, Bitmap.Config.ARGB_8888)
  }
}
