package com.figmablur

import android.annotation.SuppressLint
import android.content.Context
import android.content.res.Configuration
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Rect
import android.graphics.RectF
import android.os.Build
import android.view.View
import android.view.ViewTreeObserver
import com.facebook.react.views.view.ReactViewGroup

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
 * No bitmaps, no readbacks, no CPU blur, no per-frame allocation. Step 1 is a
 * display-list re-record, which is the only CPU cost and scales with the number
 * of views behind the blur rather than with its pixel area.
 *
 * This class itself touches no API newer than the library's minSdk — all of that
 * lives in [HardwareBackdrop], which is only instantiated when the platform can
 * support it. See the note there for why that separation matters.
 */
@SuppressLint("ViewConstructor")
class FigmaBlurView(context: Context) : ReactViewGroup(context) {

  companion object {
    val IS_SUPPORTED = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
    val HAS_SHADER_GLASS = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
  }

  // --- props -------------------------------------------------------------

  var figmaBlurRadius: Double = 0.0
    set(value) { if (field != value) { field = value; invalidateBlurPlan() } }

  var blurMode: String = "backdrop"
    set(value) { if (field != value) { field = value; invalidateBlurPlan() } }

  var overlayColor: Int = Color.TRANSPARENT
    set(value) { if (field != value) { field = value; invalidate() } }

  var fallbackColor: Int = Color.TRANSPARENT
    set(value) { if (field != value) { field = value; invalidate() } }

  var saturation: Double = 1.0
    set(value) { if (field != value) { field = value; invalidateBlurPlan() } }

  var forcedDownsample: Int = 0
    set(value) { if (field != value) { field = value; invalidateBlurPlan() } }

  var noiseOpacity: Double = 0.0
    set(value) { if (field != value) { field = value; invalidate() } }

  var glassVariant: String = "none"
    set(value) { if (field != value) { field = value; invalidateBlurPlan() } }

  var glassTintColor: Int = Color.TRANSPARENT
    set(value) { if (field != value) { field = value; invalidateBlurPlan() } }

  var blurEnabled: Boolean = true
    set(value) { if (field != value) { field = value; invalidateBlurPlan() } }

  private val cornerRadii = FloatArray(8)

  /** Corner order matches Path.addRoundRect: top-left, top-right, BR, BL. */
  fun setCornerRadius(corner: Int, valueDp: Float) {
    val px = valueDp * resources.displayMetrics.density
    val slot = corner * 2
    if (cornerRadii[slot] == px) return
    // One radius per corner, but addRoundRect wants an x and a y for each.
    cornerRadii[slot] = px
    cornerRadii[slot + 1] = px
    rebuildCornerPath()
    invalidateBlurPlan()
  }

  // --- state -------------------------------------------------------------

  private val hardware: HardwareBackdrop? = if (IS_SUPPORTED) HardwareBackdrop() else null

  private var plan: BlurPlan = BlurPlan(0.0, 1, 0f)
  private var capturePad: Int = 0
  private var planDirty = true
  private var blurRoot: View? = null

  private val cornerPath = Path()
  private val visibleRect = Rect()
  private val viewBounds = RectF()
  private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG)

  private val preDrawListener = ViewTreeObserver.OnPreDrawListener {
    captureBackdrop()
    true
  }

  init {
    // ViewGroups skip onDraw unless told otherwise, and the blur is drawn there
    // precisely so it lands beneath the mounted children.
    setWillNotDraw(false)
  }

  // --- lifecycle ---------------------------------------------------------

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    blurRoot = findBlurRoot()
    if (hardware != null) viewTreeObserver.addOnPreDrawListener(preDrawListener)
  }

  override fun onDetachedFromWindow() {
    viewTreeObserver.removeOnPreDrawListener(preDrawListener)
    blurRoot = null
    super.onDetachedFromWindow()
  }

  /**
   * Everything behind the blur has to sit under one ancestor we can record. The
   * activity's content view is that ancestor; preferring it over the decor view
   * keeps the system bars out of the capture, since those are composited by the
   * window rather than by us and including them offsets the backdrop by the
   * status bar height.
   */
  private fun findBlurRoot(): View? =
    rootView?.findViewById(android.R.id.content) ?: rootView

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    viewBounds.set(0f, 0f, w.toFloat(), h.toFloat())
    rebuildCornerPath()
    invalidateBlurPlan()
  }

  /**
   * iOS's glass follows the system appearance rather than the backdrop's
   * brightness, so this reads the same signal: the night-mode configuration.
   */
  private fun isDarkMode(): Boolean =
    (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
      Configuration.UI_MODE_NIGHT_YES

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    // Switching appearance changes the material, not just the colours around it.
    invalidateBlurPlan()
  }

  private fun rebuildCornerPath() {
    cornerPath.reset()
    if (viewBounds.isEmpty) return
    cornerPath.addRoundRect(viewBounds, cornerRadii, Path.Direction.CW)
  }

  // --- blur plan ---------------------------------------------------------

  private fun invalidateBlurPlan() {
    planDirty = true
    invalidate()
  }

  private fun isBackdropActive(): Boolean =
    hardware != null && blurEnabled && blurMode == "backdrop" &&
      (figmaBlurRadius > 0.0 || glassVariant != "none")

  private fun recomputePlanIfNeeded() {
    if (!planDirty) return
    planDirty = false

    val hw = hardware ?: return
    val density = resources.displayMetrics.density
    plan = BlurMath.blurRadiusPx(figmaBlurRadius, density, forcedDownsample)
    capturePad = BlurMath.capturePaddingPx(plan.sigmaPx)

    if (blurMode == "layer") {
      hw.applyLayerBlur(this, if (blurEnabled) plan.sigmaPx else 0.0)
    } else {
      hw.clearLayerBlur(this)
      hw.updateEffect(
        plan = plan,
        saturation = saturation,
        glassVariant = glassVariant,
        glassTintColor = glassTintColor,
        cornerRadiusPx = cornerRadii[0],
        bounds = viewBounds,
        capturePad = capturePad,
        density = density,
        isDarkMode = isDarkMode(),
      )
    }
  }

  // --- capture -----------------------------------------------------------

  private fun captureBackdrop() {
    if (!isBackdropActive()) return
    val hw = hardware ?: return
    val root = blurRoot ?: return

    // Skip anything the user cannot see.
    //
    // A list keeps cells attached beyond the viewport, and an attached blur view
    // still receives a pre-draw callback every frame. Capturing a backdrop for a
    // row that is scrolled off screen is work nobody will ever look at, and in a
    // long list it is most of the work.
    if (!isShown || !getGlobalVisibleRect(visibleRect)) return

    recomputePlanIfNeeded()

    // Each view records its own region. Sharing one screen-sized recording
    // between every blur view was prototyped and is not obviously a win: a
    // RenderEffect forces each blur node into an offscreen layer, and
    // rasterising that traverses the display list it references, at a cost that
    // follows the operation count rather than the clip — so each view may end up
    // walking the whole screen instead of its own region. An attempt to measure
    // that was confounded by thermal drift and settled nothing either way. See
    // ROADMAP before trying again, and interleave the two builds.
    hw.capture(this, root, plan.downsample, capturePad)
  }

  // --- paint -------------------------------------------------------------

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    if (viewBounds.isEmpty) return
    // Layer mode never reaches captureBackdrop, so this is where its plan lands.
    recomputePlanIfNeeded()

    var drewBlur = false
    if (isBackdropActive()) {
      val hw = hardware
      if (hw != null) {
        canvas.save()
        canvas.clipPath(cornerPath)
        drewBlur = hw.draw(canvas, capturePad, plan.downsample)
        canvas.restore()
      }
    }

    if (!drewBlur && fallbackColor != Color.TRANSPARENT) {
      fillPaint.color = fallbackColor
      canvas.drawPath(cornerPath, fillPaint)
    }

    if (overlayColor != Color.TRANSPARENT) {
      fillPaint.color = overlayColor
      canvas.drawPath(cornerPath, fillPaint)
    }

    hardware?.noisePaint(noiseOpacity)?.let { canvas.drawPath(cornerPath, it) }
  }

  fun recycle() {
    hardware?.discard()
  }
}
