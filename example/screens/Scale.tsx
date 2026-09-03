import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FigmaBlurView } from 'react-native-figma-blur';
import { Mesh } from './Mesh';

const STEPS = [8, 16, 24, 40, 60, 90];

/**
 * A blur scale needs something sharp to dissolve. The mesh alone is already
 * smooth, so every step looks alike over it; this lays a fine grid on top, whose
 * lines vanish one row at a time as the radius climbs.
 */
function Grid() {
  const cells = Array.from({ length: 700 }, (_, i) => i);
  return (
    <View style={styles.gridLines} pointerEvents="none">
      {cells.map(i => (
        <View key={i} style={styles.cell} />
      ))}
    </View>
  );
}

/**
 * The blur scale, as a reference plate.
 *
 * Every tile shows the number you would paste from Figma alongside the Gaussian
 * sigma it resolves to, over one shared backdrop — so the progression can be read
 * off directly and compared between platforms at a glance.
 */
export function Scale() {
  return (
    <View style={styles.root}>
      <Mesh />
      <Grid />

      <View style={styles.header}>
        <Text style={styles.title}>Blur scale</Text>
        <Text style={styles.sub}>Figma value, and the sigma it resolves to</Text>
      </View>

      <View style={styles.grid}>
        {STEPS.map(value => (
          <FigmaBlurView
            key={value}
            blurRadius={value}
            tintColor="rgba(255,255,255,0.10)"
            style={styles.tile}
          >
            <Text style={styles.value}>{value}</Text>
            <Text style={styles.sigma}>σ {value / 2}</Text>
          </FigmaBlurView>
        ))}
      </View>

      <FigmaBlurView
        blurRadius={40}
        tintColor="rgba(11,11,20,0.42)"
        style={styles.footer}
      >
        <Text style={styles.footerText}>
          sigma = blurRadius / 2, converted per platform at the last step
        </Text>
      </FigmaBlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B0B14' },
  gridLines: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    opacity: 0.5,
  },
  cell: {
    width: 26,
    height: 26,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
  },
  header: { paddingTop: 76, paddingHorizontal: 24, paddingBottom: 20 },
  title: { color: '#fff', fontSize: 30, fontWeight: '700', letterSpacing: -0.5 },
  sub: { color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 4 },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    paddingHorizontal: 20,
  },
  tile: {
    width: '47%',
    height: 150,
    borderRadius: 22,
    padding: 16,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  value: { color: '#fff', fontSize: 30, fontWeight: '700', letterSpacing: -0.6 },
  sigma: { color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 1 },

  footer: {
    marginTop: 22,
    marginHorizontal: 20,
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 18,
    overflow: 'hidden',
  },
  footerText: { color: 'rgba(255,255,255,0.9)', fontSize: 13, textAlign: 'center' },
});
