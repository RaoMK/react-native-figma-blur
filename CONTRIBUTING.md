# Contributing

Thanks for being here. This is a small library with an unusually testable claim —
that two platforms render the same blur — so contributions have something
concrete to aim at.

## The one rule

**Every change to how a blur looks must come with a measurement.**

Not a screenshot with "looks right to me". A number, from
[`parity/measure.mjs`](parity/measure.mjs), against the value the model predicts.
This is not ceremony: during development a blur was shipped at 5× too weak, and
another at 48% too strong, and both looked entirely plausible by eye. The
measurement caught them; opinion did not.

Everything else below is ordinary.

## Getting set up

```bash
git clone https://github.com/RaoMK/react-native-figma-blur
cd react-native-figma-blur
npm install
npm run prepare          # build the library — the example consumes the output

cd example
npm install
cd ios && pod install && cd ..
```

Then `npm run ios` or `npm run android` from `example/`.

You need Xcode 16+ for iOS and JDK 17+ with the Android SDK for Android. Android
needs API 31+ to show a blur at all; below that the library degrades to a flat
colour on purpose, so an old emulator will look broken when it isn't.

## Before you open a PR

```bash
npm run verify   # typecheck + unit tests + the constants-in-sync check
```

`verify` is what CI runs. It is fast and does not need a device.

If you touched anything under `ios/` or `android/`, build the example on that
platform too. Native code has no unit tests here — the compiler and the device
are the tests.

## Changing the blur model

[`src/core/blurMath.ts`](src/core/blurMath.ts) is the single definition of how
blurry "blurry" is. It has two mirrors, [`ios/FigmaBlurMath.h`](ios/FigmaBlurMath.h)
and [`android/.../BlurMath.kt`](android/src/main/java/com/figmablur/BlurMath.kt),
and `npm run parity` fails if their constants drift apart. If you change a
constant, change all three.

To re-derive a constant rather than guess it, see
[docs/parity.md](docs/parity.md) — it walks through the measurement procedure,
including the two ways it has already gone wrong (sampling a row that was outside
the card, and sampling with a window that clipped one side of the Gaussian).

## Style

Match the file you are in. A few things that are deliberate and worth keeping:

- **Comments explain why, not what.** Most comments in this codebase exist
  because the obvious approach was tried and failed. Those are the valuable ones
  — if you fix something subtle, leave the trap behind for the next person.
- **Constants are named and sourced.** A magic number with a comment saying where
  it was measured is fine. A magic number is not.
- **Platform differences live at the edges.** The model is shared; only the final
  unit conversion is per-platform. If you find yourself adding a second `if
  (Platform.OS === ...)` in the JS layer, something has gone wrong upstream.

## Good first contributions

Anything on the [roadmap](ROADMAP.md) marked **help wanted**. Beyond that:

- Test on a device this has never run on and report what `getCapabilities()`
  says. Real-device coverage is the biggest gap — everything so far is simulator
  and emulator.
- Improve the error messages. There are only a couple, and they could say more.
- Documentation. If something in the README confused you, that is a bug in the
  README, and you are the best-placed person to fix it.

## Reporting a bug

Please include the output of `getCapabilities()` — it names which of the several
backends is live on your device, which narrows most problems immediately:

```tsx
import { getCapabilities } from 'react-native-figma-blur';
console.log(getCapabilities());
```

The issue template asks for it too.
