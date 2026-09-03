# Comparison

Everything on this page was checked by reading the published source of each
package, not from memory or documentation. Versions inspected: **expo-blur
57.0.2**, **@react-native-community/blur 4.4.1**. If something here is out of
date, please open an issue — an inaccurate comparison is worse than none.

## At a glance

| | react-native-figma-blur | @react-native-community/blur | expo-blur |
|---|---|---|---|
| **You specify** | Figma blur value | `blurType` preset + `blurAmount` | `intensity` 1–100 |
| **iOS backend** | `CABackdropLayer` + `CAFilter` | `UIVisualEffectView` presets | native blur view |
| **Android backend** | `RenderNode` + `RenderEffect` | Dimezis BlurView 2.0.4 | Dimezis BlurView 3.1.0 |
| **Android blur by default** | yes (API 31+) | yes | **no** — opt-in, see below |
| **Cross-platform calibration** | measured, 2.9% | not stated | manual, via `blurReductionFactor` |
| **Liquid Glass** | ✅ native iOS 26+, synthesised Android | ❌ | ❌ |
| **Layer blur** | ✅ | ❌ | ❌ |
| **Per-corner radii** | ✅ | ❌ | ❌ |
| **New Architecture** | required | supported | supported |
| **Package (unpacked)** | 167 kB | 109 kB | 140 kB |
| **Runtime dependencies** | none | none | Expo modules |

## The difference that matters

The other two libraries are good at what they set out to do — put a native blur
on screen. Neither claims the two platforms will match, and reading the source,
neither tries to make them.

**`@react-native-community/blur`** takes a `blurType` from UIKit's vocabulary —
`xlight`, `prominent`, `thinMaterial`, `chromeMaterialDark` and so on — mapped
straight onto `UIBlurEffectStyle`. Those names have no meaning on Android, so the
two platforms are configured through different concepts by design.

**`expo-blur`** takes an `intensity` from 1 to 100, which is not a unit of
anything physical. It also ships a `blurReductionFactor`, documented as:

> the perceived blur intensity might differ from iOS at different intensity
> levels. This property can be used to fine tune it on Android to match it more
> closely with iOS.

That is an honest description of a real situation, and it names the cost: getting
the platforms to agree is your job, by hand, per intensity level.

**This library** starts from the number in your Figma file and converts it to
each platform's native unit at the last possible step, so the same input produces
the same Gaussian. That is measured rather than asserted —
[19.59 dip on iOS against 20.16 on Android](parity.md#measured-results), a 2.9%
difference — and `npm run parity` fails if the model ever drifts apart.

## Things worth knowing before you choose

### expo-blur needs opting in for a real Android blur

By default `blurMethod` is `none`, which is a translucent overlay rather than a
blur. Real blur requires setting `blurMethod` to `dimezisBlurView` or
`dimezisBlurViewSdk31Plus` **and** configuring a `blurTarget` prop. Its own
source warns if you do one without the other:

> You have selected the "…" blur method, but the `blurTarget` prop has not been
> configured. The blur view will fallback to "none" blur method to avoid errors.

That target-view requirement is the same architectural constraint this library
runs into — a backdrop blur has to know what to capture. The difference is where
it is solved: expo-blur asks you to declare it; this library walks the ancestor
chain and works it out.

### The Dimezis path captures into a bitmap

Both alternatives use [Dimezis BlurView](https://github.com/Dimezis/BlurView) on
Android, which is a mature and well-regarded library. Its classic path draws the
backdrop into a `Bitmap` through a software canvas each frame, then blurs that.

This library uses `RenderNode` + `RenderEffect` with no bitmap and no readback.
That was not a free choice: it is why the capture has to walk the ancestor chain
rather than simply recording the root, since RenderNodes reference each other and
recording an ancestor that contains the blur view produces a cycle. The
[architecture notes](how-it-works.md#android) explain it.

### Only this one has Liquid Glass

`GlassView` is `UIGlassEffect` on iOS 26+ and an AGSL shader on Android 13+,
[colour-matched in light and dark](parity.md#measured-results). Neither
alternative offers it at the versions inspected.

### Only these two run on old architecture

This library is a Fabric component and a TurboModule with no legacy bridge path.
If you are on React Native below 0.76, or have the New Architecture disabled, use
one of the others — that is a real reason to pick them and not a fault.

### The iOS private API question

This library reaches for `CABackdropLayer` and `CAFilter` to set an exact
Gaussian radius, because `UIVisualEffectView` has no radius API at all. That is a
trade the alternatives do not make, and it is a legitimate reason to prefer them
if your review process forbids private symbols outright. See
[App Store note](../README.md#app-store-note); a build-time switch to remove them
is on the [roadmap](../ROADMAP.md).

## When to use something else

Be suspicious of a comparison where one library wins everything.

- **You are not matching a design file.** If "a nice blur" is the requirement,
  the alternatives are smaller and battle-tested across far more devices.
- **You need Android below 12.** This library paints a flat colour there on
  purpose. Dimezis-based libraries will blur, via CPU, at a cost.
- **You are on old architecture.** Not supported here.
- **You want blur as one step in a bigger effects pipeline** — masks, gradients,
  colour grading. Reach for
  [`@shopify/react-native-skia`](https://shopify.github.io/react-native-skia/)
  and compose it yourself.
- **You have an Expo managed workflow** and do not want to prebuild. An Expo
  config plugin is on the roadmap but not shipped.
