#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

/// The platform's own Liquid Glass material, when the OS has one.
///
/// Resolved through the runtime rather than compiled against `UIGlassEffect`
/// directly, so the pod still builds on an Xcode whose SDK predates it. Returns
/// nil from the initialiser when unavailable, which is the caller's signal to fall
/// back to the synthesised glass.
@interface FigmaBlurGlass : UIView

+ (BOOL)isAvailable;

/// `regular` or `clear`.
- (nullable instancetype)initWithVariant:(NSString *)variant;

@property (nonatomic, strong, nullable) UIColor *glassTintColor;
@property (nonatomic, assign) BOOL interactive;

- (void)setCornerRadius:(CGFloat)radius;

@end

NS_ASSUME_NONNULL_END
