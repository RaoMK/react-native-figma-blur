#import "FigmaBlurBackdrop.h"
#import "FigmaBlurMath.h"

#import <QuartzCore/QuartzCore.h>
#import <objc/message.h>

/**
 * A note on private API.
 *
 * The exact paths below use CABackdropLayer and CAFilter, which are private. They
 * are used openly here — plain string literals, no obfuscation — because the point
 * is that you can see exactly what the library touches and decide for yourself.
 * See README "App Store risk" before shipping.
 *
 * Every lookup is nil-checked and every path degrades. A missing class produces a
 * softer blur, never a crash.
 */
static NSString *const kCABackdropLayerClassName = @"CABackdropLayer";
static NSString *const kCAFilterClassName = @"CAFilter";
static NSString *const kGaussianBlurFilterType = @"gaussianBlur";
static NSString *const kSaturateFilterType = @"colorSaturate";

static Class FBBackdropLayerClass(void) {
  static Class cls;
  static dispatch_once_t once;
  dispatch_once(&once, ^{ cls = NSClassFromString(kCABackdropLayerClassName); });
  return cls;
}

static Class FBFilterClass(void) {
  static Class cls;
  static dispatch_once_t once;
  dispatch_once(&once, ^{ cls = NSClassFromString(kCAFilterClassName); });
  return cls;
}

/// Returns nil rather than throwing if the private filter type is unknown.
static id FBMakeFilter(NSString *type) {
  Class filterClass = FBFilterClass();
  if (filterClass == nil) return nil;
  SEL sel = NSSelectorFromString(@"filterWithType:");
  if (![filterClass respondsToSelector:sel]) return nil;
  id (*create)(id, SEL, NSString *) = (id (*)(id, SEL, NSString *))objc_msgSend;
  return create(filterClass, sel, type);
}

/// Probe once: can we build the filters we need, on a layer that samples backdrop?
static FigmaBlurEngine FBResolveEngine(void) {
  if (FBBackdropLayerClass() != nil && FBMakeFilter(kGaussianBlurFilterType) != nil) {
    return FigmaBlurEngineBackdropLayer;
  }
  if (FBMakeFilter(kGaussianBlurFilterType) != nil) {
    return FigmaBlurEngineVisualEffectFilter;
  }
  if ([UIVisualEffectView class] != nil) {
    return FigmaBlurEngineMaterialIntensity;
  }
  return FigmaBlurEngineFallbackColor;
}

#pragma mark - Rounded rect with four independent radii

/**
 * UIBezierPath's `byRoundingCorners:` applies one radius to every corner it is
 * given, so it cannot express a Figma card with, say, 24/24/0/0. This builds the
 * path by hand. Radii are clamped so adjacent pairs can never overlap, which is
 * what CSS and Figma both do and what stops the path self-intersecting on small
 * views.
 */
static CGPathRef FBCreateRoundedPath(CGRect r, CGFloat tl, CGFloat tr, CGFloat br, CGFloat bl) {
  CGFloat w = CGRectGetWidth(r), h = CGRectGetHeight(r);
  CGFloat scale = 1.0;
  CGFloat pairs[4][2] = {{tl, tr}, {br, bl}, {tl, bl}, {tr, br}};
  CGFloat limits[4] = {w, w, h, h};
  for (int i = 0; i < 4; i++) {
    CGFloat sum = pairs[i][0] + pairs[i][1];
    if (sum > limits[i] && sum > 0) scale = MIN(scale, limits[i] / sum);
  }
  tl *= scale; tr *= scale; br *= scale; bl *= scale;

  CGMutablePathRef p = CGPathCreateMutable();
  CGFloat x = CGRectGetMinX(r), y = CGRectGetMinY(r);
  CGPathMoveToPoint(p, NULL, x + tl, y);
  CGPathAddLineToPoint(p, NULL, x + w - tr, y);
  CGPathAddArcToPoint(p, NULL, x + w, y, x + w, y + tr, tr);
  CGPathAddLineToPoint(p, NULL, x + w, y + h - br);
  CGPathAddArcToPoint(p, NULL, x + w, y + h, x + w - br, y + h, br);
  CGPathAddLineToPoint(p, NULL, x + bl, y + h);
  CGPathAddArcToPoint(p, NULL, x, y + h, x, y + h - bl, bl);
  CGPathAddLineToPoint(p, NULL, x, y + tl);
  CGPathAddArcToPoint(p, NULL, x, y, x + tl, y, tl);
  CGPathCloseSubpath(p);
  return p;
}

#pragma mark - Noise

/**
 * A large flat Gaussian blur bands badly on 8-bit displays — you get visible steps
 * across a gradient backdrop. A little grain dithers those steps away. Generated
 * once and tiled, so it costs one small texture for the whole app.
 */
static UIImage *FBNoiseImage(void) {
  static UIImage *image;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    const int size = 128;
    UIGraphicsImageRendererFormat *fmt = [UIGraphicsImageRendererFormat preferredFormat];
    fmt.scale = 1.0;
    fmt.opaque = NO;
    UIGraphicsImageRenderer *renderer =
        [[UIGraphicsImageRenderer alloc] initWithSize:CGSizeMake(size, size) format:fmt];
    image = [renderer imageWithActions:^(UIGraphicsImageRendererContext *ctx) {
      for (int y = 0; y < size; y++) {
        for (int x = 0; x < size; x++) {
          CGFloat v = (CGFloat)(arc4random_uniform(256)) / 255.0;
          CGContextSetRGBFillColor(ctx.CGContext, v, v, v, 1.0);
          CGContextFillRect(ctx.CGContext, CGRectMake(x, y, 1, 1));
        }
      }
    }];
  });
  return image;
}

#pragma mark -

@implementation FigmaBlurBackdrop {
  UIVisualEffectView *_effectView;
  UIViewPropertyAnimator *_intensityAnimator;
  CALayer *_overlayLayer;
  CALayer *_noiseLayer;
  CAShapeLayer *_maskLayer;
  CGFloat _tl, _tr, _br, _bl;
}

+ (Class)layerClass {
  Class backdrop = FBBackdropLayerClass();
  return backdrop ?: [CALayer class];
}

+ (FigmaBlurEngine)availableEngine {
  static FigmaBlurEngine engine;
  static dispatch_once_t once;
  dispatch_once(&once, ^{ engine = FBResolveEngine(); });
  return engine;
}

+ (NSString *)availableEngineName {
  switch ([self availableEngine]) {
    case FigmaBlurEngineBackdropLayer:      return @"ios.backdropLayer";
    case FigmaBlurEngineVisualEffectFilter: return @"ios.visualEffectFilter";
    case FigmaBlurEngineMaterialIntensity:  return @"ios.materialIntensity";
    case FigmaBlurEngineFallbackColor:      return @"ios.fallbackColor";
  }
}

- (instancetype)initWithFrame:(CGRect)frame {
  if (self = [super initWithFrame:frame]) {
    _engine = [[self class] availableEngine];
    _sigma = 0;
    _saturation = 1.0;
    _noiseOpacity = 0;
    self.userInteractionEnabled = NO;
    self.layer.allowsGroupOpacity = NO;

    if (_engine == FigmaBlurEngineVisualEffectFilter ||
        _engine == FigmaBlurEngineMaterialIntensity) {
      [self setUpEffectView];
    }

    _overlayLayer = [CALayer layer];
    _overlayLayer.actions = @{@"backgroundColor": [NSNull null], @"bounds": [NSNull null]};
    [self.layer addSublayer:_overlayLayer];

    [self applyBlur];
  }
  return self;
}

- (void)setUpEffectView {
  _effectView = [[UIVisualEffectView alloc]
      initWithEffect:[UIBlurEffect effectWithStyle:UIBlurEffectStyleRegular]];
  _effectView.userInteractionEnabled = NO;
  [self addSubview:_effectView];

  // The system material paints its own tint on top of the blur. We composite our
  // own tint from the Figma fill, so the built-in one has to go or the two stack
  // and everything reads too milky.
  if (_effectView.subviews.count > 1) {
    [_effectView.subviews[1] removeFromSuperview];
  }
}

- (void)dealloc {
  // A running animator retains the view it animates; stopping it here avoids
  // leaking the effect view on unmount.
  [_intensityAnimator stopAnimation:YES];
}

#pragma mark - Blur application

- (void)setSigma:(CGFloat)sigma {
  if (fabs(_sigma - sigma) < 0.01) return;
  _sigma = sigma;
  [self applyBlur];
}

- (void)setSaturation:(CGFloat)saturation {
  if (fabs(_saturation - saturation) < 0.01) return;
  _saturation = saturation;
  [self applyBlur];
}

- (void)applyBlur {
  switch (_engine) {
    case FigmaBlurEngineBackdropLayer:      [self applyBackdropLayerBlur]; break;
    case FigmaBlurEngineVisualEffectFilter: [self applyVisualEffectFilterBlur]; break;
    case FigmaBlurEngineMaterialIntensity:  [self applyMaterialIntensityBlur]; break;
    case FigmaBlurEngineFallbackColor:      [self applyFallbackColor]; break;
  }
}

- (void)applyBackdropLayerBlur {
  CALayer *layer = self.layer;

  // The sigma goes to the filter at full resolution, with no downsample
  // correction.
  //
  // An earlier version set CABackdropLayer's `scale` to 1/d and divided the
  // radius to match, mirroring what the Android path does. Measuring the
  // rendered result against the model (parity/measure.mjs) showed the blur
  // coming out exactly d times too weak: `scale` does not resample the backdrop
  // the way that assumed, so the divided radius was simply a smaller blur. This
  // path does not need it anyway — the backdrop layer already samples the
  // composited frame on the GPU, which is why it stays cheap during scrolling.
  NSMutableArray *filters = [NSMutableArray array];

  if (_sigma > 0.01) {
    id blur = FBMakeFilter(kGaussianBlurFilterType);
    if (blur) {
      [blur setValue:@(FBSigmaToInputRadius(_sigma)) forKey:@"inputRadius"];
      // Without this the blur samples transparent black past the layer edge and
      // the result fades out around its own border.
      [blur setValue:@YES forKey:@"inputNormalizeEdges"];
      [filters addObject:blur];
    }
  }

  // Applied even at 1.0 so that a saturation change is always authoritative
  // rather than inheriting whatever the previous filter stack left behind.
  id saturate = FBMakeFilter(kSaturateFilterType);
  if (saturate) {
    [saturate setValue:@(_saturation) forKey:@"inputAmount"];
    [filters addObject:saturate];
  }

  layer.filters = filters;
}

- (void)applyVisualEffectFilterBlur {
  if (_effectView.subviews.count == 0) return;
  CALayer *backdrop = _effectView.subviews[0].layer;

  for (id filter in backdrop.filters) {
    id current = nil;
    @try { current = [filter valueForKey:@"inputRadius"]; }
    @catch (__unused NSException *e) { continue; }
    if (current == nil) continue;
    @try { [filter setValue:@(FBSigmaToInputRadius(_sigma)) forKey:@"inputRadius"]; }
    @catch (__unused NSException *e) {}
  }

  for (id filter in backdrop.filters) {
    id current = nil;
    @try { current = [filter valueForKey:@"inputAmount"]; }
    @catch (__unused NSException *e) { continue; }
    if (current == nil) continue;
    @try { [filter setValue:@(_saturation) forKey:@"inputAmount"]; }
    @catch (__unused NSException *e) {}
  }
}

- (void)applyMaterialIntensityBlur {
  // No radius to set on this path, so we fade a system material in to a fitted
  // fraction. Held at a paused animator because that is the only public way to
  // read a partial effect out of UIVisualEffectView.
  [_intensityAnimator stopAnimation:YES];
  _effectView.effect = nil;

  UIBlurEffect *effect = [UIBlurEffect effectWithStyle:UIBlurEffectStyleRegular];
  _intensityAnimator =
      [[UIViewPropertyAnimator alloc] initWithDuration:1.0 curve:UIViewAnimationCurveLinear
                                           animations:^{ self->_effectView.effect = effect; }];
  _intensityAnimator.pausesOnCompletion = YES;
  _intensityAnimator.fractionComplete = FBSigmaToMaterialFraction(_sigma);
}

- (void)applyFallbackColor {
  self.layer.backgroundColor = _fallbackColor.CGColor;
}

#pragma mark - Overlay, noise, mask

- (void)setOverlayColor:(UIColor *)overlayColor {
  _overlayColor = overlayColor;
  _overlayLayer.backgroundColor = overlayColor.CGColor;
}

- (void)setFallbackColor:(UIColor *)fallbackColor {
  _fallbackColor = fallbackColor;
  if (_engine == FigmaBlurEngineFallbackColor) [self applyFallbackColor];
}

- (void)setNoiseOpacity:(CGFloat)noiseOpacity {
  if (fabs(_noiseOpacity - noiseOpacity) < 0.001) return;
  _noiseOpacity = noiseOpacity;

  if (noiseOpacity <= 0.001) {
    [_noiseLayer removeFromSuperlayer];
    _noiseLayer = nil;
    return;
  }
  if (_noiseLayer == nil) {
    _noiseLayer = [CALayer layer];
    // Tiled via a pattern colour rather than set as `contents`: a 128px texture
    // stretched across the view stops being noise and becomes smudge.
    _noiseLayer.backgroundColor = [UIColor colorWithPatternImage:FBNoiseImage()].CGColor;
    _noiseLayer.compositingFilter = @"overlayBlendMode";
    _noiseLayer.actions = @{@"opacity": [NSNull null], @"bounds": [NSNull null]};
    [self.layer addSublayer:_noiseLayer];
  }
  _noiseLayer.opacity = (float)noiseOpacity;
}

- (void)setCornerRadiiTopLeft:(CGFloat)tl
                     topRight:(CGFloat)tr
                  bottomRight:(CGFloat)br
                   bottomLeft:(CGFloat)bl {
  if (tl == _tl && tr == _tr && br == _br && bl == _bl) return;
  _tl = tl; _tr = tr; _br = br; _bl = bl;
  [self updateMask];
}

- (void)updateMask {
  BOOL uniform = (_tl == _tr && _tr == _br && _br == _bl);

  if (uniform) {
    // Uniform radii go through cornerRadius, which the compositor rounds without
    // an extra mask layer — meaningfully cheaper per frame than a shape mask.
    self.layer.mask = nil;
    _maskLayer = nil;
    self.layer.cornerRadius = _tl;
    self.layer.masksToBounds = _tl > 0;
    return;
  }

  self.layer.cornerRadius = 0;
  self.layer.masksToBounds = NO;
  if (_maskLayer == nil) {
    _maskLayer = [CAShapeLayer layer];
    _maskLayer.actions = @{@"path": [NSNull null], @"bounds": [NSNull null]};
  }
  CGPathRef path = FBCreateRoundedPath(self.bounds, _tl, _tr, _br, _bl);
  _maskLayer.path = path;
  CGPathRelease(path);
  _maskLayer.frame = self.bounds;
  self.layer.mask = _maskLayer;
}

- (void)layoutSubviews {
  [super layoutSubviews];
  // Layer geometry is set without implicit animation: these follow the view's own
  // frame, and letting Core Animation interpolate them makes the blur lag the
  // view it belongs to during any resize.
  [CATransaction begin];
  [CATransaction setDisableActions:YES];
  _effectView.frame = self.bounds;
  _overlayLayer.frame = self.bounds;
  _noiseLayer.frame = self.bounds;
  if (_maskLayer) [self updateMask];
  [CATransaction commit];
}

@end
