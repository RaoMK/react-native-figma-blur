import React, { useState } from 'react';
import { LogBox, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { Gallery } from './screens/Gallery';
import { Scale } from './screens/Scale';
import { ParityFixture } from './screens/ParityFixture';
import { ListBench } from './screens/ListBench';

// The dev warning toast would otherwise sit across the bottom of every
// documentation plate. The only warning here is React Native's own notice about
// codegenNativeComponent's import path, which is unrelated to what is on screen.
LogBox.ignoreAllLogs();

type ScreenName = 'gallery' | 'scale' | 'parity' | 'bench';

/**
 * `INITIAL` is what the docs capture script flips between runs, so each plate can
 * be screenshotted without touching the simulator. The picker below is for
 * driving it by hand.
 */
const INITIAL: ScreenName = 'gallery';

/** Set false when capturing documentation plates. */
const SHOW_PICKER = true;

const SCREENS: Record<ScreenName, () => React.JSX.Element> = {
  gallery: Gallery,
  scale: Scale,
  parity: ParityFixture,
  bench: ListBench,
};

export default function App() {
  const [screen, setScreen] = useState<ScreenName>(INITIAL);
  const Current = SCREENS[screen];

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <Current />
      {/* Deliberately unblurred: a picker made of the thing under test would be
          confusing in a screenshot of the thing under test. */}
      {SHOW_PICKER ? (
      <View style={styles.picker} pointerEvents="box-none">
        {(Object.keys(SCREENS) as ScreenName[]).map(name => (
          <Pressable
            key={name}
            onPress={() => setScreen(name)}
            style={[styles.chip, screen === name && styles.chipOn]}
          >
            <Text style={[styles.chipText, screen === name && styles.chipTextOn]}>
              {name}
            </Text>
          </Pressable>
        ))}
      </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B0B14' },
  picker: {
    position: 'absolute',
    right: 10,
    top: 58,
    gap: 6,
  },
  chip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  chipOn: { backgroundColor: 'rgba(255,255,255,0.9)' },
  chipText: { color: 'rgba(255,255,255,0.8)', fontSize: 10, fontWeight: '600' },
  chipTextOn: { color: '#0B0B14' },
});
