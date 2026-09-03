package com.figmablur

import android.os.Build
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.Arguments
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = NativeFigmaBlurModule.NAME)
class NativeFigmaBlurModule(reactContext: ReactApplicationContext) :
  NativeFigmaBlurSpec(reactContext) {

  companion object {
    const val NAME = "NativeFigmaBlur"
  }

  override fun getName(): String = NAME

  override fun getCapabilities(): WritableMap = Arguments.createMap().apply {
    putBoolean("hasBackdropBlur", FigmaBlurView.IS_SUPPORTED)
    // RenderEffect takes a radius that maps to sigma by a known, exact formula,
    // so when it exists the requested sigma is the sigma that gets rendered.
    putBoolean("hasExactRadius", FigmaBlurView.IS_SUPPORTED)
    putBoolean("hasNativeGlass", false)
    putBoolean("hasShaderGlass", FigmaBlurView.HAS_SHADER_GLASS)
    putString(
      "engine",
      when {
        FigmaBlurView.HAS_SHADER_GLASS -> "android.renderEffect+agsl"
        FigmaBlurView.IS_SUPPORTED -> "android.renderEffect"
        else -> "android.fallbackColor"
      }
    )
    putInt("apiLevel", Build.VERSION.SDK_INT)
  }
}
