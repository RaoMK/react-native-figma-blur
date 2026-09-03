#import "FigmaBlurGlass.h"
#import <objc/message.h>

static Class FBGlassEffectClass(void) {
  static Class cls;
  static dispatch_once_t once;
  dispatch_once(&once, ^{ cls = NSClassFromString(@"UIGlassEffect"); });
  return cls;
}

@implementation FigmaBlurGlass {
  UIVisualEffectView *_effectView;
  UIVisualEffect *_effect;
}

+ (BOOL)isAvailable {
  return FBGlassEffectClass() != nil;
}

- (nullable instancetype)initWithVariant:(NSString *)variant {
  Class glassClass = FBGlassEffectClass();
  if (glassClass == nil) return nil;

  if (!(self = [super initWithFrame:CGRectZero])) return nil;

  UIVisualEffect *effect = [[glassClass alloc] init];

  // `clear` is the more transparent of the two glass styles. It is set through
  // the runtime because the style enum does not exist on older SDKs; an OS that
  // has UIGlassEffect but not this key simply stays on the default style.
  if ([variant isEqualToString:@"clear"]) {
    @try { [effect setValue:@(1) forKey:@"style"]; }
    @catch (__unused NSException *e) {}
  }

  _effect = effect;
  _effectView = [[UIVisualEffectView alloc] initWithEffect:effect];
  _effectView.userInteractionEnabled = NO;
  self.userInteractionEnabled = NO;
  [self addSubview:_effectView];
  return self;
}

- (void)setGlassTintColor:(UIColor *)glassTintColor {
  _glassTintColor = glassTintColor;
  @try { [_effect setValue:glassTintColor forKey:@"tintColor"]; }
  @catch (__unused NSException *e) {}
  // Reassigning is what makes the effect view pick the change up; mutating the
  // effect in place leaves the rendered material on the old value.
  _effectView.effect = _effect;
}

- (void)setInteractive:(BOOL)interactive {
  _interactive = interactive;
  @try { [_effect setValue:@(interactive) forKey:@"interactive"]; }
  @catch (__unused NSException *e) {}
  _effectView.effect = _effect;
}

- (void)setCornerRadius:(CGFloat)radius {
  // Glass carries its own edge lensing, and it is drawn relative to the corner
  // radius — so this has to reach the effect view's layer, not just clip it.
  _effectView.layer.cornerRadius = radius;
  _effectView.layer.cornerCurve = kCACornerCurveContinuous;
  _effectView.layer.masksToBounds = radius > 0;
}

- (void)layoutSubviews {
  [super layoutSubviews];
  _effectView.frame = self.bounds;
}

@end
