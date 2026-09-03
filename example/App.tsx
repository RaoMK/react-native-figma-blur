/**
 * Parity demo.
 *
 * Everything on screen is arranged so a screenshot from an iPhone and a
 * screenshot from an Android phone can be put side by side and compared, and so
 * the same scene can be rebuilt in Figma and exported for `npm run parity`.
 *
 * The backdrop is deliberately high-contrast and hard-edged: a soft photo hides
 * a wrong sigma, sharp stripes do not.
 */

import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import {
  FigmaBlurView,
  GlassView,
  Materials,
  getCapabilities,
  type Capabilities,
} from 'react-native-figma-blur';

const FIGMA_BLUR_VALUES = [20, 40, 60, 80];

/** Saturated bands, because a blur's character shows up at colour boundaries. */
const BAND_COLORS = [
  '#FF3B30', '#FF9500', '#FFCC00', '#34C759',
  '#00C7BE', '#007AFF', '#5856D6', '#AF52DE',
];

function Backdrop() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {BAND_COLORS.map((color, i) => (
        <View key={color} style={[styles.band, { backgroundColor: color }]}>
          {/* A hard white bar inside each band gives the sigma measurement a
              clean step edge to work from. */}
          {i % 2 === 0 ? <View style={styles.stepEdge} /> : null}
        </View>
      ))}
    </View>
  );
}

function CapabilityReadout({ caps }: { caps: Capabilities }) {
  const rows: Array<[string, string]> = [
    ['engine', caps.engine],
    ['api level', String(caps.apiLevel)],
    ['backdrop blur', caps.hasBackdropBlur ? 'yes' : 'no'],
    ['exact radius', caps.hasExactRadius ? 'yes' : 'approximated'],
    ['glass', caps.hasNativeGlass ? 'native' : caps.hasShaderGlass ? 'shader' : 'none'],
  ];
  return (
    <FigmaBlurView
      blurRadius={60}
      tintColor="rgba(20,20,22,0.55)"
      style={[styles.card, styles.readout]}
    >
      {rows.map(([label, value]) => (
        <View key={label} style={styles.readoutRow}>
          <Text style={styles.readoutLabel}>{label}</Text>
          <Text style={styles.readoutValue}>{value}</Text>
        </View>
      ))}
    </FigmaBlurView>
  );
}

export default function App() {
  const isDark = useColorScheme() === 'dark';
  const [figmaNeutral, setFigmaNeutral] = useState(true);
  const [glassOn, setGlassOn] = useState(true);

  // Reading capabilities is a synchronous native call; there is no reason to do
  // it on every render.
  const caps = useMemo(() => getCapabilities(), []);

  const material = isDark ? Materials.thinDark : Materials.thin;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <Backdrop />

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Figma blur parity</Text>

        {FIGMA_BLUR_VALUES.map(value => (
          <FigmaBlurView
            key={value}
            blurRadius={value}
            tintColor={material.tintColor}
            // 1.0 matches Figma. 1.8 is roughly what iOS system materials do,
            // and toggling between them shows why a stock blur never quite
            // matches the mock however much you tune the radius.
            saturation={figmaNeutral ? 1.0 : 1.8}
            style={styles.card}
          >
            <Text style={styles.cardLabel}>blurRadius {value}</Text>
            <Text style={styles.cardSub}>sigma {value / 2}pt</Text>
          </FigmaBlurView>
        ))}

        <Text style={styles.title}>Per-corner radii</Text>
        <FigmaBlurView
          blurRadius={50}
          tintColor="rgba(255,255,255,0.4)"
          noiseOpacity={0.05}
          style={[styles.card, styles.asymmetric]}
        >
          <Text style={styles.cardLabel}>32 / 32 / 4 / 4</Text>
        </FigmaBlurView>

        <Text style={styles.title}>Liquid Glass</Text>
        {glassOn ? (
          <>
            <GlassView variant="regular" glassInteractive style={styles.card}>
              <Text style={styles.cardLabel}>regular</Text>
            </GlassView>
            <GlassView variant="clear" style={styles.card}>
              <Text style={styles.cardLabel}>clear</Text>
            </GlassView>
          </>
        ) : null}

        <Text style={styles.title}>Layer blur</Text>
        <FigmaBlurView blurMode="layer" blurRadius={16} style={styles.card}>
          <Text style={styles.cardLabel}>children are blurred</Text>
          <Text style={styles.cardSub}>Figma's Layer blur, not Background blur</Text>
        </FigmaBlurView>

        <Text style={styles.title}>This device</Text>
        <CapabilityReadout caps={caps} />

        <FigmaBlurView
          blurRadius={40}
          tintColor="rgba(20,20,22,0.5)"
          style={[styles.card, styles.controls]}
        >
          <View style={styles.controlRow}>
            <Text style={styles.readoutLabel}>Figma-neutral saturation</Text>
            <Switch value={figmaNeutral} onValueChange={setFigmaNeutral} />
          </View>
          <View style={styles.controlRow}>
            <Text style={styles.readoutLabel}>Show glass</Text>
            <Switch value={glassOn} onValueChange={setGlassOn} />
          </View>
        </FigmaBlurView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  band: { flex: 1, justifyContent: 'center' },
  stepEdge: { position: 'absolute', left: '50%', right: 0, top: 0, bottom: 0, backgroundColor: '#fff' },
  content: { padding: 20, paddingTop: 72, paddingBottom: 96, gap: 16 },
  title: { color: '#fff', fontSize: 13, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', marginTop: 12 },
  card: { borderRadius: 24, padding: 20, minHeight: 88, justifyContent: 'center', overflow: 'hidden' },
  asymmetric: { borderTopLeftRadius: 32, borderTopRightRadius: 32, borderBottomRightRadius: 4, borderBottomLeftRadius: 4 },
  cardLabel: { color: '#fff', fontSize: 17, fontWeight: '600' },
  cardSub: { color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 2 },
  readout: { gap: 6 },
  readoutRow: { flexDirection: 'row', justifyContent: 'space-between' },
  readoutLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  readoutValue: { color: '#fff', fontSize: 13, fontWeight: '600' },
  controls: { gap: 8 },
  controlRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
