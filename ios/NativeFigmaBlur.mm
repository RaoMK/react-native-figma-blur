#import "NativeFigmaBlur.h"
#import "FigmaBlurBackdrop.h"
#import "FigmaBlurGlass.h"

#import <UIKit/UIKit.h>

@implementation NativeFigmaBlur

RCT_EXPORT_MODULE()

- (NSDictionary *)getCapabilities {
  FigmaBlurEngine engine = FigmaBlurBackdrop.availableEngine;

  BOOL hasBackdropBlur = engine != FigmaBlurEngineFallbackColor;
  // Only the two filter-based engines can be handed an exact sigma. The material
  // path is a fitted approximation and callers deserve to know that, because it
  // is the one case where iOS and Android will not agree to the pixel.
  BOOL hasExactRadius = engine == FigmaBlurEngineBackdropLayer ||
                        engine == FigmaBlurEngineVisualEffectFilter;

  return @{
    @"hasBackdropBlur": @(hasBackdropBlur),
    @"hasExactRadius": @(hasExactRadius),
    @"hasNativeGlass": @([FigmaBlurGlass isAvailable]),
    @"hasShaderGlass": @NO,
    @"engine": FigmaBlurBackdrop.availableEngineName,
    @"apiLevel": @((int)UIDevice.currentDevice.systemVersion.integerValue),
  };
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::NativeFigmaBlurSpecJSI>(params);
}

@end
