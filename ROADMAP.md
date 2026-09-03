# Roadmap

Where this is going, and what is honestly not there yet. Items marked
**help wanted** are good places to start — see [CONTRIBUTING.md](CONTRIBUTING.md).

## 0.1 — shipped

The core claim, measured rather than asserted.

- One Gaussian model shared by TypeScript, iOS and Android
- Exact-radius backdrop blur on both platforms, matched to **2.9%**
- Liquid Glass: native `UIGlassEffect` on iOS 26+, AGSL-synthesised on Android 33+,
  colour-matched in light and dark
- Layer blur, per-corner radii, film grain, saturation control
- A parity harness that measures rendered sigma and fails on drift

## 0.2 — closing the known gaps

**Glass blur radius parity** — `UIGlassEffect` does not expose the amount it
blurs by, so Android's softness under the material comes from `blurRadius` and
can differ from iOS even where the colour matches exactly. Needs a measurement
of iOS's effective glass sigma, then a matching default.

**A parity fixture screen** *(help wanted)* — the measured numbers in the docs
came from hand-picked coordinates on a busy demo screen, which is exactly how one
measurement already went wrong. A dedicated screen — one full-bleed card over a
pure step edge, no text, known crop — would turn `npm run parity` into a single
command instead of a careful manual read.

**Dark mode in the harness** — the glass constants for dark were fitted by hand.
They should be checked by the same automated path as everything else.

**Better `getCapabilities()`** *(help wanted)* — it should report the effective
sigma and downsample factor actually in use, not just which backend is live.

**A shared backdrop recording** — every blur view under a root records its own
backdrop each frame, and on a real device that is roughly 1.5ms of UI thread
each, fixed, regardless of what is behind it. Recording once per frame and
letting each view sample its own region is the obvious fix, and it is not
obviously a win: a RenderEffect forces each blur node into an offscreen layer,
and rasterising that traverses the referenced display list at a cost following
its operation count rather than its clip. A prototype exists in the git history;
the attempt to measure it was confounded by the device warming from 25ms to 48ms
on identical code, so it settled nothing. Redo it **interleaved** — alternate
builds several times each — before drawing any conclusion.

## 0.3 — reach

**Expo config plugin** *(help wanted)* — installable in a managed workflow
without prebuilding by hand.

**Android 26–30 fallback** *(help wanted)* — currently anything below API 31
renders a flat `fallbackColor`, because the only option there is CPU bitmap
blurring and this library exists to avoid that jank. An **opt-in** slow path,
clearly labelled, is defensible for apps that need the reach and accept the cost.

**A private-API-free iOS mode** — the exact-radius path uses `CABackdropLayer`
and `CAFilter`. The fallbacks already exist; what is missing is a build-time
switch that removes the private symbols from the binary entirely, for teams whose
review process forbids them outright.

## 0.4 — motion

**Animated blur** — driving `blurRadius` from Reanimated on the UI thread rather
than through React state. Both backends can change radius cheaply per frame; the
plumbing is the work.

**`glassInteractive` on Android** — iOS 26's glass responds to touch with its own
lensing. The prop is currently accepted and ignored on Android so shared JSX does
not throw. Reproducing it means adding a touch position uniform to the shader.

**Glass morphing** — `UIGlassContainerEffect` merges neighbouring glass views as
they approach. No Android equivalent exists; it would have to be synthesised.

## Not planned

**Old Architecture support.** This is a Fabric component and a TurboModule by
design. Backporting would mean a second implementation of everything, and the
New Architecture is the default from React Native 0.76 onward.

**A general-purpose image filter API.** Blur and glass are the scope. Colour
grading, shadows and distortion belong in a shader library, not here.

**Matching UIKit.** The target is what Figma draws. iOS system materials
saturate the backdrop by roughly 1.8× and Figma does not, so matching one means
missing the other — see [docs/how-it-works.md](docs/how-it-works.md).
