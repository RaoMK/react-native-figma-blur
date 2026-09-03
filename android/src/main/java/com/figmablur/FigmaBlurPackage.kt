package com.figmablur

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ModuleSpec
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class FigmaBlurPackage : BaseReactPackage() {

  override fun getModule(name: String, context: ReactApplicationContext): NativeModule? =
    if (name == NativeFigmaBlurModule.NAME) NativeFigmaBlurModule(context) else null

  override fun getReactModuleInfoProvider() = ReactModuleInfoProvider {
    mapOf(
      NativeFigmaBlurModule.NAME to ReactModuleInfo(
        NativeFigmaBlurModule.NAME,
        NativeFigmaBlurModule.NAME,
        false, // canOverrideExistingModule
        false, // needsEagerInit
        false, // isCxxModule
        true,  // isTurboModule
      )
    )
  }

  // getViewManagers rather than createViewManagers: BaseReactPackage builds the
  // latter from these specs, and its return type is narrower than it looks.
  override fun getViewManagers(reactContext: ReactApplicationContext): List<ModuleSpec> =
    listOf(ModuleSpec.viewManagerSpec { FigmaBlurViewManager() })
}
