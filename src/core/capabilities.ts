import { TurboModuleRegistry } from 'react-native';
import type { Capabilities, Spec } from '../specs/NativeFigmaBlur';

/**
 * The spec module is imported for its types only, never at runtime.
 *
 * `TurboModuleRegistry.getEnforcing` — which the codegen spec has to call at
 * module scope for the generator to find it — throws the moment it is evaluated
 * if the native side is missing. Importing it from the package entry point would
 * turn a linking problem into a crash on `import`, before any of your code runs,
 * with a message that says nothing about what to do. Resolving it lazily here
 * means the rest of the library works, and the failure arrives at the call that
 * actually needs native, with instructions.
 */
let cached: Spec | null | undefined;

export function getCapabilities(): Capabilities {
  if (cached === undefined) {
    cached = TurboModuleRegistry.get<Spec>('NativeFigmaBlur');
  }
  if (cached == null) {
    throw new Error(
      "react-native-figma-blur: the native module isn't linked.\n\n" +
        '  iOS      cd ios && pod install, then rebuild the app\n' +
        '  Android  rebuild the app (a Metro reload is not enough)\n\n' +
        'Both need a native rebuild — this package ships native code, so ' +
        'installing it and refreshing the JS bundle will not pick it up.'
    );
  }
  return cached.getCapabilities();
}
