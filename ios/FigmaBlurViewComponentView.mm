#import "FigmaBlurViewComponentView.h"
#import "FigmaBlurBackdrop.h"
#import "FigmaBlurGlass.h"
#import "FigmaBlurMath.h"

#import <React/RCTConversions.h>
#import <react/renderer/components/RNFigmaBlurSpec/ComponentDescriptors.h>
#import <react/renderer/components/RNFigmaBlurSpec/EventEmitters.h>
#import <react/renderer/components/RNFigmaBlurSpec/Props.h>
#import <react/renderer/components/RNFigmaBlurSpec/RCTComponentViewHelpers.h>

#import "RCTFabricComponentsPlugins.h"

using namespace facebook::react;

@interface FigmaBlurViewComponentView () <RCTFigmaBlurViewViewProtocol>
@end

@implementation FigmaBlurViewComponentView {
  FigmaBlurBackdrop *_backdrop;
  FigmaBlurGlass *_glass;
  UIView *_contentContainer;
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
}

- (void)unmountChildComponentView:(UIView<RCTComponentViewProtocol> *)childComponentView
                            index:(NSInteger)index
{
  [childComponentView removeFromSuperview];
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
  if (mode == FigmaBlurViewBlurMode::Layer) {
    // Layer blur blurs the view's own children rather than what is behind it,
    // so the backdrop is switched off entirely and the filter moves to the
    // content container's layer.
    _backdrop.hidden = YES;
    _contentContainer.layer.filters = [self layerBlurFiltersForSigma:sigma];
  } else {
    // Platform glass, when present, is the material — an active backdrop
    // underneath it would blur everything a second time.
    _backdrop.hidden = (_glass != nil);
    _contentContainer.layer.filters = nil;
  }
}

- (NSArray *)layerBlurFiltersForSigma:(CGFloat)sigma {
  if (sigma <= 0.01) return nil;
  Class filterClass = NSClassFromString(@"CAFilter");
  if (filterClass == nil) return nil;
  id blur = [filterClass performSelector:NSSelectorFromString(@"filterWithType:")
                              withObject:@"gaussianBlur"];
  if (blur == nil) return nil;
  @try {
    [blur setValue:@(FBSigmaToInputRadius(sigma)) forKey:@"inputRadius"];
    [blur setValue:@YES forKey:@"inputNormalizeEdges"];
  } @catch (__unused NSException *e) {
    return nil;
  }
  return @[blur];
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
  _contentContainer.layer.filters = nil;
}

@end

Class<RCTComponentViewProtocol> FigmaBlurViewCls(void) {
  return FigmaBlurViewComponentView.class;
}
