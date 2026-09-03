#import "FigmaBlurViewComponentView.h"
#import "FigmaBlurBackdrop.h"
#import "FigmaBlurGlass.h"
#import "FigmaBlurMath.h"

#import <CoreImage/CoreImage.h>
#import <React/RCTConversions.h>
#import <react/renderer/components/RNFigmaBlurSpec/ComponentDescriptors.h>
#import <react/renderer/components/RNFigmaBlurSpec/EventEmitters.h>
#import <react/renderer/components/RNFigmaBlurSpec/Props.h>
#import <react/renderer/components/RNFigmaBlurSpec/RCTComponentViewHelpers.h>

#import "RCTFabricComponentsPlugins.h"

using namespace facebook::react;

/**
 * Gaussian blur of an image, at the same sigma the rest of the library speaks.
 *
 * The edges are deliberately left to fall off rather than clamped: Figma's Layer
 * blur softens content away at its own boundary, and Android's layer path uses
 * DECAL for the same reason. Cropping back to the input extent keeps the result
 * the size the caller asked for, since a blur otherwise grows the extent.
 */
static UIImage *FBBlurImage(UIImage *image, CGFloat sigma) {
  static CIContext *context;
  static dispatch_once_t once;
  dispatch_once(&once, ^{ context = [CIContext contextWithOptions:nil]; });

  CIImage *input = [CIImage imageWithCGImage:image.CGImage];
  CIFilter *blur = [CIFilter filterWithName:@"CIGaussianBlur"];
  if (blur == nil) return nil;
  [blur setValue:input forKey:kCIInputImageKey];
  // CIGaussianBlur's inputRadius is the Gaussian standard deviation, in pixels,
  // so the point-space sigma is scaled by the snapshot's scale.
  [blur setValue:@(sigma * image.scale) forKey:kCIInputRadiusKey];

  CIImage *output = blur.outputImage;
  if (output == nil) return nil;

  CGRect extent = CGRectMake(0, 0, image.size.width * image.scale,
                             image.size.height * image.scale);
  CGImageRef cgImage = [context createCGImage:output fromRect:extent];
  if (cgImage == NULL) return nil;

  UIImage *result = [UIImage imageWithCGImage:cgImage
                                        scale:image.scale
                                  orientation:UIImageOrientationUp];
  CGImageRelease(cgImage);
  return result;
}

@interface FigmaBlurViewComponentView () <RCTFigmaBlurViewViewProtocol>
@end

@implementation FigmaBlurViewComponentView {
  FigmaBlurBackdrop *_backdrop;
  FigmaBlurGlass *_glass;
  UIView *_contentContainer;
  UIImageView *_layerBlurView;
  CGFloat _layerBlurSigma;
  BOOL _layerBlurRefreshScheduled;
  NSString *_activeGlassVariant;
}

+ (ComponentDescriptorProvider)componentDescriptorProvider {
  return concreteComponentDescriptorProvider<FigmaBlurViewComponentDescriptor>();
}

- (instancetype)initWithFrame:(CGRect)frame {
  if (self = [super initWithFrame:frame]) {
    static const auto defaultProps = std::make_shared<const FigmaBlurViewProps>();
    _props = defaultProps;

    _backdrop = [[FigmaBlurBackdrop alloc] initWithFrame:self.bounds];
    _backdrop.autoresizingMask =
        UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
    [self addSubview:_backdrop];

    // Children go into their own container, mounted above the backdrop.
    //
    // Note this is deliberately NOT `self.contentView`: RCTViewComponentView
    // mounts children into `currentContainerView` at index 0..n regardless of
    // what contentView is set to, which drops them *underneath* the backdrop and
    // blurs the very content they were meant to sit on top of. So the mounting
    // is overridden below instead.
    _contentContainer = [[UIView alloc] initWithFrame:self.bounds];
    _contentContainer.autoresizingMask =
        UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
    [self addSubview:_contentContainer];
  }
  return self;
}

#pragma mark - Child mounting

- (void)mountChildComponentView:(UIView<RCTComponentViewProtocol> *)childComponentView
                          index:(NSInteger)index
{
  [_contentContainer insertSubview:childComponentView atIndex:index];
  [self setNeedsLayerBlurRefresh];
}

- (void)unmountChildComponentView:(UIView<RCTComponentViewProtocol> *)childComponentView
                            index:(NSInteger)index
{
  [childComponentView removeFromSuperview];
  [self setNeedsLayerBlurRefresh];
}

- (void)layoutSubviews {
  [super layoutSubviews];
  // The snapshot is bounds-sized, so a resize invalidates it.
  [self setNeedsLayerBlurRefresh];
}

#pragma mark - Props

- (void)updateProps:(const Props::Shared &)props oldProps:(const Props::Shared &)oldProps {
  const auto &newProps = *std::static_pointer_cast<const FigmaBlurViewProps>(props);
  const auto &prevProps = *std::static_pointer_cast<const FigmaBlurViewProps>(
      oldProps ? oldProps : _props);

  [self updateGlassIfNeeded:newProps previous:prevProps];

  const CGFloat sigma = newProps.enabled ? FBFigmaBlurToSigma(newProps.blurRadius) : 0.0;
  const BOOL sigmaChanged =
      newProps.blurRadius != prevProps.blurRadius || newProps.enabled != prevProps.enabled;
  if (sigmaChanged) {
    _backdrop.sigma = sigma;
  }
  if (newProps.saturation != prevProps.saturation) {
    _backdrop.saturation = newProps.saturation;
  }
  if (newProps.tintColor != prevProps.tintColor) {
    _backdrop.overlayColor = RCTUIColorFromSharedColor(newProps.tintColor);
  }
  if (newProps.fallbackColor != prevProps.fallbackColor) {
    _backdrop.fallbackColor = RCTUIColorFromSharedColor(newProps.fallbackColor);
  }
  if (newProps.noiseOpacity != prevProps.noiseOpacity) {
    _backdrop.noiseOpacity = newProps.noiseOpacity;
  }

  if (newProps.borderRadiusTopLeft != prevProps.borderRadiusTopLeft ||
      newProps.borderRadiusTopRight != prevProps.borderRadiusTopRight ||
      newProps.borderRadiusBottomRight != prevProps.borderRadiusBottomRight ||
      newProps.borderRadiusBottomLeft != prevProps.borderRadiusBottomLeft) {
    [self applyCornerRadii:newProps];
  }

  // `blurMode` is applied last: it decides whether the filters sit on the
  // backdrop or on the mounted children, and it needs the radii already set.
  // Reapplied on a sigma change too — in layer mode the radius lives on the
  // content layer's filter, which nothing else updates.
  if (newProps.blurMode != prevProps.blurMode || sigmaChanged) {
    [self applyBlurMode:newProps.blurMode sigma:sigma];
  }

  [super updateProps:props oldProps:oldProps];
}

- (void)applyCornerRadii:(const FigmaBlurViewProps &)props {
  [_backdrop setCornerRadiiTopLeft:props.borderRadiusTopLeft
                          topRight:props.borderRadiusTopRight
                       bottomRight:props.borderRadiusBottomRight
                        bottomLeft:props.borderRadiusBottomLeft];
  // Glass only supports a uniform radius, because the material's edge lensing is
  // generated from a single corner curve.
  [_glass setCornerRadius:props.borderRadiusTopLeft];
}

- (void)applyBlurMode:(FigmaBlurViewBlurMode)mode sigma:(CGFloat)sigma {
  _layerBlurSigma = sigma;

  if (mode == FigmaBlurViewBlurMode::Layer) {
    // Layer blur filters the view's own children rather than what is behind it,
    // so the backdrop is switched off entirely.
    _backdrop.hidden = YES;
    if (_layerBlurView == nil) {
      _layerBlurView = [[UIImageView alloc] initWithFrame:self.bounds];
      _layerBlurView.autoresizingMask =
          UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
      _layerBlurView.userInteractionEnabled = NO;
      [self addSubview:_layerBlurView];
    }
    [self setNeedsLayerBlurRefresh];
  } else {
    _backdrop.hidden = (_glass != nil);
    [_layerBlurView removeFromSuperview];
    _layerBlurView = nil;
    _contentContainer.hidden = NO;
  }
}

/**
 * Render the children, blur the result, and show that instead of the children.
 *
 * The tempting implementation is `contentContainer.layer.filters = @[gaussian]`,
 * mirroring what the backdrop path does, and it is wrong: CALayer's `filters` is
 * documented as unsupported on iOS. It happens to work on CABackdropLayer, which
 * is why backdrop mode can use it, but on an ordinary content layer it renders
 * undefined garbage — in practice a white block with a slab of uninitialised
 * memory beside it.
 *
 * So the content is rasterised and blurred explicitly. That is more expensive
 * than the backdrop path, but layer blur applies to content this view owns, which
 * changes only when React re-renders it — not every frame like a backdrop. The
 * refresh is coalesced onto the next runloop turn so a burst of prop, mount and
 * layout changes costs one rasterisation rather than several.
 */
- (void)setNeedsLayerBlurRefresh {
  if (_layerBlurRefreshScheduled || _layerBlurView == nil) return;
  _layerBlurRefreshScheduled = YES;
  __weak __typeof(self) weakSelf = self;
  dispatch_async(dispatch_get_main_queue(), ^{
    __typeof(self) strongSelf = weakSelf;
    if (strongSelf == nil) return;
    strongSelf->_layerBlurRefreshScheduled = NO;
    [strongSelf refreshLayerBlur];
  });
}

- (void)refreshLayerBlur {
  if (_layerBlurView == nil) return;

  if (_layerBlurSigma <= 0.01 || CGRectIsEmpty(self.bounds)) {
    // Nothing to blur: show the children directly rather than a stale bitmap.
    _contentContainer.hidden = NO;
    _layerBlurView.image = nil;
    return;
  }

  CGRect bounds = self.bounds;
  UIGraphicsImageRendererFormat *format = [UIGraphicsImageRendererFormat preferredFormat];
  format.opaque = NO;
  UIGraphicsImageRenderer *renderer =
      [[UIGraphicsImageRenderer alloc] initWithBounds:bounds format:format];

  // The container has to be visible for the duration of the render, or it draws
  // nothing; it goes back to hidden immediately so only the blurred copy shows.
  BOOL wasHidden = _contentContainer.hidden;
  _contentContainer.hidden = NO;
  UIImage *snapshot = [renderer imageWithActions:^(UIGraphicsImageRendererContext *ctx) {
    [self->_contentContainer.layer renderInContext:ctx.CGContext];
  }];
  _contentContainer.hidden = wasHidden;

  UIImage *blurred = FBBlurImage(snapshot, _layerBlurSigma);
  if (blurred == nil) {
    // Blur unavailable: unblurred children beat a blank card.
    _contentContainer.hidden = NO;
    _layerBlurView.image = nil;
    return;
  }

  _layerBlurView.image = blurred;
  _contentContainer.hidden = YES;
}

#pragma mark - Glass

- (void)updateGlassIfNeeded:(const FigmaBlurViewProps &)props
                   previous:(const FigmaBlurViewProps &)prev {
  NSString *variant = nil;
  switch (props.glass) {
    case FigmaBlurViewGlass::None:    variant = nil; break;
    case FigmaBlurViewGlass::Regular: variant = @"regular"; break;
    case FigmaBlurViewGlass::Clear:   variant = @"clear"; break;
  }

  BOOL variantChanged = !((variant == nil && _activeGlassVariant == nil) ||
                          [variant isEqualToString:_activeGlassVariant]);

  if (variantChanged) {
    [_glass removeFromSuperview];
    _glass = nil;
    _activeGlassVariant = variant;

    if (variant != nil && [FigmaBlurGlass isAvailable]) {
      _glass = [[FigmaBlurGlass alloc] initWithVariant:variant];
      _glass.autoresizingMask =
          UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
      _glass.frame = self.bounds;
      [self insertSubview:_glass aboveSubview:_backdrop];
      [self applyCornerRadii:props];
    }

    // With platform glass live, the synthesised backdrop underneath it would
    // double the blur. Without it, the backdrop *is* the glass.
    _backdrop.hidden = (_glass != nil);
  }

  if (_glass == nil) return;
  if (variantChanged || props.glassTintColor != prev.glassTintColor) {
    _glass.glassTintColor = RCTUIColorFromSharedColor(props.glassTintColor);
  }
  if (variantChanged || props.glassInteractive != prev.glassInteractive) {
    _glass.interactive = props.glassInteractive;
  }
}

#pragma mark -

- (void)prepareForRecycle {
  [super prepareForRecycle];
  [_glass removeFromSuperview];
  _glass = nil;
  _activeGlassVariant = nil;
  _backdrop.hidden = NO;
  _backdrop.sigma = 0;
  [_layerBlurView removeFromSuperview];
  _layerBlurView = nil;
  _layerBlurSigma = 0;
  _contentContainer.hidden = NO;
}

@end

Class<RCTComponentViewProtocol> FigmaBlurViewCls(void) {
  return FigmaBlurViewComponentView.class;
}
