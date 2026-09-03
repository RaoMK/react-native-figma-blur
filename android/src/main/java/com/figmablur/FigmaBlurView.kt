package com.figmablur

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BlendMode
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.RenderEffect
import android.graphics.RenderNode
import android.graphics.RuntimeShader
import android.graphics.Shader
import android.os.Build
import android.view.View
import android.view.ViewTreeObserver
import com.facebook.react.views.view.ReactViewGroup
import kotlin.math.ceil
import kotlin.random.Random

/**
 * Hardware backdrop blur for Android.
 *
 * The pipeline, once per frame, entirely on the GPU:
 *
 *   1. Record the ancestor tree behind this view into a RenderNode, downscaled,
 *      and padded outward by 3 sigma so edge pixels blur from real content.
 *   2. Hang a RenderEffect off that node — blur, optionally chained with the
 *      glass shader.
 *   3. Draw the node back, scaled up and clipped to the rounded rect.
 *
 * No bitmaps, no readbacks, no CPU blur, no snapshot allocation per frame. Step 1
 * is a display-list re-record, which is the only CPU cost and is proportional to
 * the view count behind the blur rather than to its pixel area.
 */
@SuppressLint("ViewConstructor")
class FigmaBlurView(context: Context) : ReactViewGroup(context) {

  companion object {
    val IS_SUPPORTED = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
    val HAS_SHADER_GLASS = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
    private const val NOISE_TILE = 128
  }

  // --- props -------------------------------------------------------------

  var figmaBlurRadius: Double = 0.0
    set(value) { if (field != value) { field = value; invalidateBlurPlan() } }

  var blurMode: String = "backdrop"
    set(value) { if (field != value) { field = value; invalidateBlurPlan() } }

  var overlayColor: Int = Color.TRANSPARENT
    set(value) { if (field != value) { field = value; tintPaint.color = value; invalidate() } }

  var fallbackColor: Int = Color.TRANSPARENT
    set(value) { if (field != value) { field = value; invalidate() } }

  var saturation: Double = 1.0
    set(value) { if (field != value) { field = value; invalidateBlurPlan() } }

  var forcedDownsample: Int = 0
    set(value) { if (field != value) { field = value; invalidateBlurPlan() } }

  var noiseOpacity: Double = 0.0
    set(value) { if (field != value) { field = value; updateNoisePaint(); invalidate() } }

  var glassVariant: String = "none"
    set(value) { if (field != value) { field = value; invalidateBlurPlan() } }

  var glassTintColor: Int = Color.TRANSPARENT
    set(value) { if (field != value) { field = value; invalidateBlurPlan() } }

  var blurEnabled: Boolean = true
    set(value) { if (field != value) { field = value; invalidateBlurPlan() } }

  private val cornerRadii = FloatArray(8)

  fun setCornerRadius(index: Int, valueDp: Float) {
    val px = valueDp * resources.displayMetrics.density
    // Path.addRoundRect takes x and y radii per corner; we only expose circular
    // corners, so each corner writes both of its slots.
    val a = index * 2
    if (cornerRadii[a] == px) return
    cornerRadii[a] = px
    cornerRadii[a + 1] = px
    rebuildCornerPath()
    invalidateBlurPlan()
    invalidate()
  }

  // --- state -------------------------------------------------------------

  private val blurNode: RenderNode? =
    if (IS_SUPPORTED) RenderNode("FigmaBlurBackdrop") else null

  private var plan: BlurPlan = BlurPlan(0.0, 1, 0f)
  private var capturePad: Int = 0
  private var planDirty = true

  private var blurRoot: View? = null

  private val cornerPath = Path()
  private val bounds = RectF()
  private val tintPaint = Paint(Paint.ANTI_ALIAS_FLAG)
  private var noisePaint: Paint? = null
  private val location = IntArray(2)
  private val rootLocation = IntArray(2)

  private val preDrawListener = ViewTreeObserver.OnPreDrawListener {
    captureBackdrop()
    true
  }

  init {
    // ViewGroups skip onDraw unless told otherwise, and the blur is drawn there
    // precisely so that it lands beneath the mounted children.
    setWillNotDraw(false)
  }

  // --- lifecycle ---------------------------------------------------------

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    blurRoot = findBlurRoot()
    if (IS_SUPPORTED) viewTreeObserver.addOnPreDrawListener(preDrawListener)
  }

  override fun onDetachedFromWindow() {
    viewTreeObserver.removeOnPreDrawListener(preDrawListener)
    blurRoot = null
    super.onDetachedFromWindow()
  }

  /**
   * Everything behind the blur has to live under a single ancestor we can record.
   * The activity's content view is that ancestor, and preferring it over the decor
   * view keeps system bars out of the capture — they are composited by the window,
   * not by us, and including them shifts the backdrop by the status bar height.
   */
  private fun findBlurRoot(): View? =
    rootView?.findViewById(android.R.id.content) ?: rootView

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    bounds.set(0f, 0f, w.toFloat(), h.toFloat())
    rebuildCornerPath()
    invalidateBlurPlan()
  }

  private fun rebuildCornerPath() {
    cornerPath.reset()
    if (bounds.isEmpty) return
    cornerPath.addRoundRect(bounds, cornerRadii, Path.Direction.CW)
  }

  // --- blur plan ---------------------------------------------------------

  private fun invalidateBlurPlan() {
    planDirty = true
    invalidate()
  }

  private fun isBlurActive(): Boolean =
    IS_SUPPORTED && blurEnabled && blurMode == "backdrop" &&
      (figmaBlurRadius > 0.0 || glassVariant != "none")

  private fun recomputePlanIfNeeded() {
    if (!planDirty) return
    planDirty = false

    val density = resources.displayMetrics.density
    plan = BlurMath.blurRadiusPx(figmaBlurRadius, density, forcedDownsample)
    capturePad = BlurMath.capturePaddingPx(plan.sigmaPx)

    applyLayerMode(density)

    val node = blurNode ?: return
    node.setRenderEffect(buildRenderEffect(density))
  }

  /**
   * Layer blur blurs this view's own children instead of what is behind it, which
   * is a RenderEffect on the view itself rather than on the backdrop node. Same
   * sigma, same conversion — only the surface being filtered differs.
   */
  private fun applyLayerMode(@Suppress("UNUSED_PARAMETER") density: Float) {
    if (!IS_SUPPORTED) return
    if (blurMode != "layer" || !blurEnabled || plan.sigmaPx <= 0.0) {
      setRenderEffect(null)
      return
    }
    // Full-resolution radius, not `plan.radiusPx`: that one is pre-divided for
    // the downscaled backdrop node, and there is no downscale on this path.
    val radius = BlurMath.sigmaToSkiaRadius(plan.sigmaPx)
      .coerceAtMost(BlurMath.MAX_BLUR_RADIUS_PX).toFloat()
    // DECAL, not CLAMP: a layer blur is meant to fall off at the content's own
    // edge, which is what Figma's layer blur does too.
    setRenderEffect(RenderEffect.createBlurEffect(radius, radius, Shader.TileMode.DECAL))
  }

  private fun buildRenderEffect(density: Float): RenderEffect? {
    if (!IS_SUPPORTED) return null

    val blur: RenderEffect? =
      if (plan.radiusPx > 0f) {
        // CLAMP rather than DECAL: DECAL samples transparent past the texture
        // edge and fades the result out around its own border. The 3-sigma
        // capture padding means the clamped region is off-screen anyway.
        RenderEffect.createBlurEffect(plan.radiusPx, plan.radiusPx, Shader.TileMode.CLAMP)
      } else null

    val saturate: RenderEffect? =
      if (kotlin.math.abs(saturation - 1.0) > 0.01) {
        val m = android.graphics.ColorMatrix().apply { setSaturation(saturation.toFloat()) }
        RenderEffect.createColorFilterEffect(android.graphics.ColorMatrixColorFilter(m))
      } else null

    var effect = blur
    if (saturate != null) {
      effect = if (effect != null) RenderEffect.createChainEffect(saturate, effect) else saturate
    }

    val glass = buildGlassEffect(density)
    if (glass != null) {
      effect = if (effect != null) RenderEffect.createChainEffect(glass, effect) else glass
    }
    return effect
  }

  private fun buildGlassEffect(density: Float): RenderEffect? {
    if (!HAS_SHADER_GLASS || glassVariant == "none") return null
    if (bounds.isEmpty) return null

    val d = plan.downsample.toFloat()
    // The shader runs inside the downscaled node, so every length it is given has
    // to be expressed in that space or the rim would scale with the blur radius.
    val shader = RuntimeShader(GlassShader.AGSL).apply {
      setFloatUniform("uSize", (bounds.width() + capturePad * 2) / d,
                               (bounds.height() + capturePad * 2) / d)
      setFloatUniform("uRadius", cornerRadii[0] / d)
      setFloatUniform("uBand", (GlassShader.BAND_DP * density / d).toFloat())
      setFloatUniform("uRefraction", (GlassShader.REFRACTION_DP * density / d).toFloat())
      setFloatUniform(
        "uSpecular",
        (if (glassVariant == "clear") GlassShader.SPECULAR_CLEAR
         else GlassShader.SPECULAR_REGULAR).toFloat()
      )
      setColorUniform("uTint", glassTintColor)
    }
    return RenderEffect.createRuntimeShaderEffect(shader, "backdrop")
  }

  // --- capture -----------------------------------------------------------

  private fun captureBackdrop() {
    if (!isBlurActive()) return
    val node = blurNode ?: return
    val root = blurRoot ?: return
    if (width == 0 || height == 0) return

    recomputePlanIfNeeded()

    val d = plan.downsample
    val capW = width + capturePad * 2
    val capH = height + capturePad * 2
    val scaledW = ceil(capW.toDouble() / d).toInt().coerceAtLeast(1)
    val scaledH = ceil(capH.toDouble() / d).toInt().coerceAtLeast(1)

    getLocationOnScreen(location)
    root.getLocationOnScreen(rootLocation)
    val originX = (location[0] - rootLocation[0] - capturePad).toFloat()
    val originY = (location[1] - rootLocation[1] - capturePad).toFloat()

    node.setPosition(0, 0, scaledW, scaledH)

    // Exclude ourselves from our own backdrop, or the blur is fed its previous
    // output and smears a little more every frame.
    //
    // This has to be done with visibility rather than with a "skip drawing"
    // flag. On a hardware canvas, ViewGroup.drawChild does not call a child's
    // draw(Canvas) at all — it emits drawRenderNode(child), and that reference
    // is resolved at composite time, by which point our node holds the blur
    // again. An INVISIBLE child, by contrast, is skipped during dispatchDraw
    // itself, so nothing referring to us is ever recorded.
    val restoreVisibility = visibility
    super.setVisibility(INVISIBLE)

    val canvas = node.beginRecording(scaledW, scaledH)
    try {
      canvas.scale(1f / d, 1f / d)
      canvas.translate(-originX, -originY)
      root.draw(canvas)
    } finally {
      node.endRecording()
      super.setVisibility(restoreVisibility)
    }
  }

  // --- paint -------------------------------------------------------------

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    if (bounds.isEmpty) return
    // Layer mode never reaches captureBackdrop, so this is where its plan lands.
    recomputePlanIfNeeded()

    val drewBlur = drawBackdrop(canvas)
    if (!drewBlur && fallbackColor != Color.TRANSPARENT) {
      tintPaint.color = fallbackColor
      canvas.drawPath(cornerPath, tintPaint)
      tintPaint.color = overlayColor
    }

    if (overlayColor != Color.TRANSPARENT) {
      canvas.drawPath(cornerPath, tintPaint)
    }
    noisePaint?.let { canvas.drawPath(cornerPath, it) }
  }

  private fun drawBackdrop(canvas: Canvas): Boolean {
    val node = blurNode ?: return false
    if (!isBlurActive() || !node.hasDisplayList()) return false
    // drawRenderNode is only available on a hardware canvas. A software canvas
    // here means something is capturing us into a bitmap, and the fallback colour
    // is the honest answer rather than an unblurred backdrop.
    if (!canvas.isHardwareAccelerated) return false

    canvas.save()
    canvas.clipPath(cornerPath)
    // View space -> node space: the node holds a region that starts `capturePad`
    // above and left of us, stored at 1/downsample scale.
    canvas.translate(-capturePad.toFloat(), -capturePad.toFloat())
    canvas.scale(plan.downsample.toFloat(), plan.downsample.toFloat())
    canvas.drawRenderNode(node)
    canvas.restore()
    return true
  }

  private fun updateNoisePaint() {
    if (noiseOpacity <= 0.001) {
      noisePaint = null
      return
    }
    val paint = noisePaint ?: Paint(Paint.ANTI_ALIAS_FLAG).also {
      it.shader = android.graphics.BitmapShader(
        buildNoiseTile(), Shader.TileMode.REPEAT, Shader.TileMode.REPEAT
      )
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        it.blendMode = BlendMode.OVERLAY
      }
      noisePaint = it
    }
    paint.alpha = (noiseOpacity.coerceIn(0.0, 1.0) * 255).toInt()
  }

  /**
   * A large flat blur bands visibly on an 8-bit display. A little grain dithers
   * the steps away. One 128px tile, generated once per view and repeated.
   */
  private fun buildNoiseTile(): Bitmap {
    val pixels = IntArray(NOISE_TILE * NOISE_TILE)
    val random = Random(0)
    for (i in pixels.indices) {
      val v = random.nextInt(256)
      pixels[i] = Color.argb(255, v, v, v)
    }
    return Bitmap.createBitmap(pixels, NOISE_TILE, NOISE_TILE, Bitmap.Config.ARGB_8888)
  }

  fun recycle() {
    blurNode?.discardDisplayList()
    noisePaint = null
  }
}
