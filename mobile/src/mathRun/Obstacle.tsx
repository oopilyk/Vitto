import type { ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import type { MathRunObstacleKind } from '@vitto/core';
import { OBSTACLE_SIZE } from './track';

/**
 * The five obstacles, drawn from plain views so they sit in the same flat,
 * muted register as the rest of the track. Each fills an `OBSTACLE_SIZE` square
 * anchored to its bottom edge — the ground line — so the pet's hop clears every
 * kind by the same margin.
 */

const WOOD = '#a4795a';
const WOOD_DARK = '#7d5a40';
const WOOD_END = '#d9b896';
const STONE = '#9aa1a3';
const STONE_LIGHT = '#c3c9ca';
const STONE_DARK = '#6f7679';
const WATER = '#8fb6d4';
const WATER_LIGHT = '#c5dceb';
const LEAF = '#7f9f6f';
const LEAF_LIGHT = '#a4bd91';
const LEAF_DARK = '#5f7d52';

function Log() {
  return (
    <View style={styles.log}>
      <View style={styles.logBody}>
        <View style={styles.logGrain} />
      </View>
      <View style={styles.logEnd}>
        <View style={styles.logRing} />
      </View>
    </View>
  );
}

function Rock() {
  return (
    <View style={styles.rock}>
      <View style={styles.rockHighlight} />
      <View style={styles.rockShade} />
    </View>
  );
}

function Puddle() {
  return (
    <View style={styles.puddle}>
      <View style={styles.puddleGlint} />
    </View>
  );
}

function Fence() {
  return (
    <View style={styles.fence}>
      <View style={[styles.fenceRail, styles.fenceRailTop]} />
      <View style={[styles.fenceRail, styles.fenceRailLow]} />
      <View style={[styles.fencePost, styles.fencePostLeft]} />
      <View style={[styles.fencePost, styles.fencePostRight]} />
    </View>
  );
}

function Bush() {
  return (
    <View style={styles.bush}>
      <View style={[styles.bushLobe, styles.bushLobeLeft]} />
      <View style={[styles.bushLobe, styles.bushLobeRight]} />
      <View style={[styles.bushLobe, styles.bushLobeTop]} />
    </View>
  );
}

const DRAWING: Record<MathRunObstacleKind, () => ReactElement> = {
  log: Log,
  rock: Rock,
  puddle: Puddle,
  fence: Fence,
  bush: Bush,
};

export function Obstacle({ kind }: { kind: MathRunObstacleKind }) {
  const Drawing = DRAWING[kind];
  return (
    <View style={styles.frame} pointerEvents="none">
      <Drawing />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: OBSTACLE_SIZE, height: OBSTACLE_SIZE, justifyContent: 'flex-end' },

  log: { height: 22, flexDirection: 'row', alignItems: 'center' },
  logBody: { flex: 1, height: 20, backgroundColor: WOOD, borderRadius: 4, justifyContent: 'center' },
  logGrain: { height: 3, marginHorizontal: 6, borderRadius: 2, backgroundColor: WOOD_DARK, opacity: 0.55 },
  logEnd: {
    width: 22,
    height: 22,
    marginLeft: -6,
    borderRadius: 11,
    backgroundColor: WOOD_END,
    borderWidth: 2,
    borderColor: WOOD_DARK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logRing: { width: 8, height: 8, borderRadius: 4, borderWidth: 2, borderColor: WOOD_DARK },

  rock: {
    width: 40,
    height: 30,
    alignSelf: 'center',
    backgroundColor: STONE,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 22,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 10,
    overflow: 'hidden',
  },
  rockHighlight: { position: 'absolute', top: 5, left: 8, width: 12, height: 7, borderRadius: 5, backgroundColor: STONE_LIGHT },
  rockShade: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 8, backgroundColor: STONE_DARK, opacity: 0.45 },

  puddle: {
    height: 10,
    marginBottom: -2,
    borderRadius: 10,
    backgroundColor: WATER,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  puddleGlint: { width: 14, height: 3, marginLeft: 8, borderRadius: 2, backgroundColor: WATER_LIGHT },

  fence: { height: 38 },
  fencePost: { position: 'absolute', bottom: 0, width: 7, height: 38, borderRadius: 2, backgroundColor: WOOD },
  fencePostLeft: { left: 4 },
  fencePostRight: { right: 4 },
  fenceRail: { position: 'absolute', left: 0, right: 0, height: 6, borderRadius: 2, backgroundColor: WOOD_DARK },
  fenceRailTop: { top: 8 },
  fenceRailLow: { top: 22 },

  bush: { height: 32 },
  bushLobe: { position: 'absolute', bottom: 0, borderRadius: 14 },
  bushLobeLeft: { left: 0, width: 26, height: 24, backgroundColor: LEAF_DARK },
  bushLobeRight: { right: 0, width: 26, height: 22, backgroundColor: LEAF_LIGHT },
  bushLobeTop: { left: 9, bottom: 6, width: 26, height: 26, backgroundColor: LEAF },
});
