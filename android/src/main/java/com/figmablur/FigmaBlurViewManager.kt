package com.figmablur

import android.graphics.Color
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewGroupManager
import com.facebook.react.uimanager.ViewManagerDelegate
import com.facebook.react.viewmanagers.FigmaBlurViewManagerDelegate
import com.facebook.react.viewmanagers.FigmaBlurViewManagerInterface

@ReactModule(name = FigmaBlurViewManager.NAME)
class FigmaBlurViewManager :
  ViewGroupManager<FigmaBlurView>(),
  FigmaBlurViewManagerInterface<FigmaBlurView> {

  companion object {
    const val NAME = "FigmaBlurView"
  }

  private val delegate: ViewManagerDelegate<FigmaBlurView> = FigmaBlurViewManagerDelegate(this)

  override fun getDelegate(): ViewManagerDelegate<FigmaBlurView> = delegate

  override fun getName(): String = NAME

  override fun createViewInstance(context: ThemedReactContext): FigmaBlurView =
    FigmaBlurView(context)

  override fun onDropViewInstance(view: FigmaBlurView) {
    view.recycle()
    super.onDropViewInstance(view)
  }

  override fun setBlurRadius(view: FigmaBlurView, value: Float) {
    view.figmaBlurRadius = value.toDouble()
  }

  override fun setBlurMode(view: FigmaBlurView, value: String?) {
    view.blurMode = value ?: "backdrop"
  }

  override fun setTintColor(view: FigmaBlurView, value: Int?) {
    view.overlayColor = value ?: Color.TRANSPARENT
  }

  override fun setSaturation(view: FigmaBlurView, value: Float) {
    view.saturation = value.toDouble()
  }

  override fun setDownsampleFactor(view: FigmaBlurView, value: Int) {
    view.forcedDownsample = value
  }

  override fun setNoiseOpacity(view: FigmaBlurView, value: Float) {
    view.noiseOpacity = value.toDouble()
  }

  // Corner indices follow Path.addRoundRect's order: top-left, top-right,
  // bottom-right, bottom-left.
  override fun setBorderRadiusTopLeft(view: FigmaBlurView, value: Float) {
    view.setCornerRadius(0, value)
  }

  override fun setBorderRadiusTopRight(view: FigmaBlurView, value: Float) {
    view.setCornerRadius(1, value)
  }

  override fun setBorderRadiusBottomRight(view: FigmaBlurView, value: Float) {
    view.setCornerRadius(2, value)
  }

  override fun setBorderRadiusBottomLeft(view: FigmaBlurView, value: Float) {
    view.setCornerRadius(3, value)
  }

  override fun setGlass(view: FigmaBlurView, value: String?) {
    view.glassVariant = value ?: "none"
  }

  override fun setGlassTintColor(view: FigmaBlurView, value: Int?) {
    view.glassTintColor = value ?: Color.TRANSPARENT
  }

  override fun setGlassInteractive(view: FigmaBlurView, value: Boolean) {
    // Android's glass is synthesised in a shader with no touch response of its
    // own. Accepted and ignored so shared JS renders identically on both
    // platforms rather than throwing on a prop iOS honours.
  }

  override fun setFallbackColor(view: FigmaBlurView, value: Int?) {
    view.fallbackColor = value ?: Color.TRANSPARENT
  }

  override fun setEnabled(view: FigmaBlurView, value: Boolean) {
    view.blurEnabled = value
  }
}
