# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] — 2026-09-03

Android capture efficiency, and the first measurements from real hardware.

### Changed

- **Backdrop captures are culled against their own rect.** A capture only needs
  content that can reach the region it covers, so siblings that do not overlap
  the blurred view are no longer redrawn. In a list this removes a quadratic
  term: the cell at index `j` was redrawing every cell before it, `k² / 2`
  re-records per frame across `k` visible blurred cells, for cells that do not
  overlap and contribute nothing to each other's backdrop.
- **Views scrolled off screen no longer capture.** A list keeps cells attached
  beyond the viewport and each still received a pre-draw callback every frame.

Both changes remove work that provably cannot affect the output, and both were
verified as such rather than assumed: the example's bench and gallery screens
were rendered before and after and diffed across 2.1M pixels, maximum channel
difference **0**. Neither is claimed as a measured speedup in isolation.

- Removed a per-frame allocation from the capture path.

### Added

- A **bench** screen in the example — the same list rendered three ways (a blur
  per cell, tint only, one blur over the list) so a difference is attributable to
  the blur and nothing else.
- `npm run bench:android` (`scripts/bench-android.sh`) to scroll and report frame
  timings.
- [docs/performance.md](docs/performance.md) — list guidance and the cost model.
- [docs/comparison.md](docs/comparison.md) — versus `expo-blur` and
  `@react-native-community/blur`, written from their published source.

### Measured

On an iQOO I2207 (Android 15, 1080×2400 @ 440dpi), ten blurred rows, cool device:

| mode | janky | 50th | GPU 50th |
|---|---|---|---|
| a blur on every row | 20.8% | 25 ms | 6 ms |
| one blur over the list | 0.62% | 12 ms | 5 ms |
| tint only | 0.87% | 10 ms | 6 ms |

The GPU is not the bottleneck in any mode. The cost is per blur *view* — roughly
1.5 ms of UI thread each — not per blurred pixel, so one blur over a list is
effectively free while ten are not.

### Known limitations

- A shared per-frame recording, which would let every blur view sample one
  capture, remains unresolved. A prototype exists in the git history; measuring
  it was confounded by the device warming from 25 ms to 48 ms on identical code,
  so it settled nothing. See [ROADMAP.md](ROADMAP.md).

[0.1.1]: https://github.com/RaoMK/react-native-figma-blur/releases/tag/v0.1.1

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

### Size

| | |
|---|---|
| npm package | 46.6 kB packed, 167 kB unpacked |
| JS bundle contribution | 6.9 kB raw, 1.8 kB gzipped |
| Runtime dependencies | none |

See the [roadmap](ROADMAP.md).

[0.1.0]: https://github.com/RaoMK/react-native-figma-blur/releases/tag/v0.1.0
