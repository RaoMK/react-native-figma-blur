#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

/// Which implementation actually ended up running, resolved once at launch.
typedef NS_ENUM(NSInteger, FigmaBlurEngine) {
  /// CABackdropLayer + CAFilter. Exact sigma, live GPU capture, full control of
  /// saturation. The only path that can match Android exactly.
  FigmaBlurEngineBackdropLayer = 0,
  /// UIVisualEffectView with its internal gaussianBlur radius overridden.
  /// Exact sigma, but the system owns the layer and may reset it.
  FigmaBlurEngineVisualEffectFilter,
  /// UIVisualEffectView driven by a paused animator. Smooth, but the radius is
  /// not settable — parity becomes a fitted approximation.
  FigmaBlurEngineMaterialIntensity,
  /// No blur available. Paints fallbackColor.
  FigmaBlurEngineFallbackColor,
};

/// A live backdrop blur with an exactly specified Gaussian sigma.
///
/// Owns a layer that samples whatever is rendered behind it and blurs it on the
/// GPU every frame, for free during scrolling — no snapshotting, no display link.
@interface FigmaBlurBackdrop : UIView

/// Resolved once per process. Read it to report capabilities.
@property (class, nonatomic, readonly) FigmaBlurEngine availableEngine;
@property (class, nonatomic, readonly) NSString *availableEngineName;

@property (nonatomic, readonly) FigmaBlurEngine engine;

/// Gaussian standard deviation in points. This is the number the whole library
/// is organised around; see src/core/blurMath.ts.
@property (nonatomic, assign) CGFloat sigma;

/// 1.0 is Figma-neutral. iOS materials ship ~1.8, which is the main reason a
/// stock blur looks wrong next to the mock it came from.
@property (nonatomic, assign) CGFloat saturation;

/// Composited above the blur. Named `overlayColor` rather than `tintColor`
/// because UIView already owns `tintColor` for tint-colour inheritance, and
/// shadowing it breaks that propagation for every descendant.
@property (nonatomic, strong, nullable) UIColor *overlayColor;
@property (nonatomic, strong, nullable) UIColor *fallbackColor;
@property (nonatomic, assign) CGFloat noiseOpacity;

/// Per-corner radii in points, clockwise from top-left.
- (void)setCornerRadiiTopLeft:(CGFloat)tl
                     topRight:(CGFloat)tr
                  bottomRight:(CGFloat)br
                   bottomLeft:(CGFloat)bl;

@end

NS_ASSUME_NONNULL_END
