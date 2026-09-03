# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-09-03

First release.

### Added

- **`<FigmaBlurView />`** — backdrop and layer blur, driven by a Figma blur value
  rather than a per-platform radius. Tint, saturation, film grain, per-corner
  radii, downsample control, and a `fallbackColor` for devices with no GPU blur.
- **`<GlassView />`** — Liquid Glass. The platform's own `UIGlassEffect` on
  iOS 26+, synthesised in AGSL on Android 13+, colour-matched in light and dark.
- **`Materials`** — `ultraThin`, `thin`, `regular`, `thick` and dark
  counterparts, written as the recipes designers draw rather than as UIKit
  equivalents.
- **`getCapabilities()`** — reports which backend is live, whether the radius is
  exact, and whether glass is native or synthesised.
- **A parity harness** (`npm run parity`) that asserts the blur model's constants
  are identical across TypeScript, iOS and Android, and can recover the rendered
  Gaussian sigma from a screenshot.

### Measured

`blurRadius={40}`, model sigma 20.0 density-independent:

| | measured | vs model |
|---|---|---|
| iOS — iPhone 17 Pro, @3× | 19.59 dip | −2.1% |
| Android — Pixel 6, @2.625× | 20.16 dip | +0.8% |
| iOS vs Android | | 2.9% |

Glass colour matched to within ~3% luminance and 0.02 saturation in both
appearances. Full numbers in [docs/parity.md](docs/parity.md).

### Known limitations

- iOS's glass blurs by an amount `UIGlassEffect` does not expose, so the Android
  blur under the material comes from `blurRadius` and can differ in softness even
  where the colour matches.
- Android below API 31 renders `fallbackColor` rather than a blur, deliberately —
  the only alternative there is CPU bitmap blurring.
- `glassInteractive` is accepted and ignored on Android.
- The rendered-sigma measurements were taken from hand-picked coordinates on the
  fixture screen; a dedicated fixture would make them a single command.

See the [roadmap](ROADMAP.md).

[0.1.0]: https://github.com/mowgli/react-native-figma-blur/releases/tag/v0.1.0
