# Troubleshooting

Start here:

```tsx
import { getCapabilities } from 'react-native-figma-blur';
console.log(getCapabilities());
```

That names which of several backends is live, and narrows most problems in one
step.

```js
{
  engine: 'ios.backdropLayer',   // or android.renderEffect+agsl, etc.
  apiLevel: 26,
  hasBackdropBlur: true,
  hasExactRadius: true,          // false means the radius is approximated
  hasNativeGlass: true,
  hasShaderGlass: false,
}
```

---

## "The native module isn't linked"

The package ships native code, so installing it and reloading the JS bundle is
not enough — the app has to be rebuilt.

- **iOS** — `cd ios && pod install`, then rebuild from Xcode or `npm run ios`
- **Android** — rebuild the app; a Metro reload will not pick it up

## Nothing is blurred, I just see a flat colour

Check `getCapabilities().hasBackdropBlur`.

If it is `false` on Android, you are below API 31. There is no GPU backdrop blur
on Android before then, and this library degrades to `fallbackColor` rather than
falling back to CPU bitmap blurring, which is the jank it exists to avoid. Set a
`fallbackColor` that looks reasonable for your design.

## The blur is there but nothing is behind it

Backdrop blur shows what is painted **before** the view, in the same window.

- A blur view with nothing behind it shows nothing. Put content behind it.
- On Android specifically, content in a **sibling that paints after** the blur
  view is not captured. This is deliberate — it is what a backdrop means, and it
  is also what keeps the RenderNode graph acyclic. If your background renders
  after your blur, swap the order.

## The text inside my blur view is blurry

You are probably in `blurMode="layer"`, which blurs the view's own children by
design. For a translucent panel with sharp content on top, use the default
`"backdrop"`.

## My `backgroundColor` disappeared

It is behind the blur, which is opaque enough to hide it. Use `tintColor`
instead — that composites above the blur, which is what you want.

## Layer blur made my card vanish

A layer blur filters the view's own content, **including its fill**. A card that
*is* the blur has nothing left to sit on.

Nest instead — the card owns the material, and the blur wraps only what it hides:

```tsx
<FigmaBlurView blurRadius={40} tintColor="rgba(255,255,255,0.16)">
  <Text>Ending</Text>
  <FigmaBlurView blurMode="layer" blurRadius={13}>
    <Text>the butler did it</Text>
  </FigmaBlurView>
</FigmaBlurView>
```

## It looks right on Android and washed out on iOS

Check `saturation`. iOS system materials boost backdrop saturation by roughly
1.8×; the default here is `1.0`, which is what Figma does. If you set it higher
for an iOS-native look, Android will follow — that is the point — but it will no
longer match your mock.

## Glass looks different between platforms

Colour is matched to within ~3% in both appearances. What is **not** matched is
the blur radius underneath the material: `UIGlassEffect` does not expose the
amount it blurs by, so Android's softness comes from `blurRadius`. Adjust it if
the difference matters to you. See the [roadmap](../ROADMAP.md).

## Android glass has no refraction

`hasShaderGlass` is `false` below API 33. The AGSL runtime shader needs
Android 13+; below that you get blur and tint without the edge lensing.

## Performance

If scrolling stutters:

- **Prefer `backdrop` over `layer` on iOS.** Backdrop is free per frame; layer
  rasterises through Core Image whenever the subtree re-renders.
- **Fewer views behind the blur.** On Android the per-frame cost scales with the
  number of views being recorded, not with the blur's pixel area.
- **Raise `downsampleFactor`.** `0` picks automatically; a larger number trades a
  little softness for speed.
- **`enabled={false}`** switches the blur off without unmounting, which is much
  cheaper than conditionally rendering it.

## Something else

Open an issue with the `getCapabilities()` output, your React Native version, and
the device. See [CONTRIBUTING.md](../CONTRIBUTING.md).
