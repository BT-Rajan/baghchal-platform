/**
 * The end of a game, celebrated over the board: the winning side's coin spins in on a burst of
 * light, with the result in large letters, and confetti when I won. Tap to close; it also closes
 * by itself. With reduced motion, it appears without moving.
 */
import { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';

import type { PieceSet } from '@/api/endpoints';
import type { Ending } from '@/game/ending';
import { t } from '@/i18n';
import { colors } from '@/theme';

import { Coin } from './Coin';

const SHOW_MS = 6000;
const CONFETTI = 28;
const CONFETTI_COLOURS = ['#f6c344', '#e07a22', '#2f7d6d', '#ffffff', '#c0392b', '#7fb3e0'];
const native = Platform.OS !== 'web';

/** Where each piece of confetti flies: spread round a circle, with a fixed scatter. */
const PIECES = (() => {
  let seed = 11;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: CONFETTI }, (_, i) => {
    const angle = (i / CONFETTI) * Math.PI * 2 + rand() * 0.4;
    const distance = 90 + rand() * 110;
    return {
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance - 30,
      turn: `${Math.round(rand() * 720 - 360)}deg`,
      colour: CONFETTI_COLOURS[i % CONFETTI_COLOURS.length],
      wide: i % 3 === 0,
    };
  });
})();

export function Victory({
  ending,
  onClose,
  pieces = 'classic',
}: {
  ending: Ending;
  onClose: () => void;
  pieces?: PieceSet;
}) {
  const [still, setStill] = useState(false);
  // Animated values live as long as the overlay; state keeps one of each across renders.
  const [shown] = useState(() => new Animated.Value(0)); // backdrop and text
  const [coin] = useState(() => new Animated.Value(0)); // the coin's arrival
  const [spin] = useState(() => new Animated.Value(0)); // the rays, turning slowly
  const [burst] = useState(() => new Animated.Value(0)); // confetti flying out

  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => {
        if (cancelled) return;
        if (reduce) {
          setStill(true);
          shown.setValue(1);
          coin.setValue(1);
          return;
        }
        Animated.parallel([
          Animated.timing(shown, { toValue: 1, duration: 350, useNativeDriver: native }),
          Animated.spring(coin, {
            toValue: 1,
            friction: 5,
            tension: 50,
            useNativeDriver: native,
          }),
          Animated.timing(burst, {
            toValue: 1,
            duration: 1600,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: native,
          }),
          Animated.loop(
            Animated.timing(spin, {
              toValue: 1,
              duration: 9000,
              easing: Easing.linear,
              useNativeDriver: native,
            }),
          ),
        ]).start();
      })
      .catch(() => {});
    const timer = setTimeout(onClose, SHOW_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [shown, coin, spin, burst, onClose]);

  const celebrate = ending.won !== false;
  const rays = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const coinSpin = coin.interpolate({ inputRange: [0, 1], outputRange: ['-540deg', '0deg'] });
  const coinScale = coin.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] });

  return (
    <Pressable
      role="button"
      aria-label={t('{headline} {detail}. Tap to close.', {
        headline: ending.headline,
        detail: ending.detail,
      })}
      onPress={onClose}
      style={StyleSheet.absoluteFill}
    >
      <Animated.View style={[styles.backdrop, { opacity: shown }]}>
        {celebrate && (
          <Animated.View style={[styles.rays, { transform: [{ rotate: rays }] }]}>
            <Svg width="100%" height="100%" viewBox="0 0 100 100">
              <G opacity={0.5}>
                {Array.from({ length: 12 }, (_, i) => (
                  <Path
                    key={i}
                    d="M50 50 L46 0 L54 0 Z"
                    fill={colors.woodLight}
                    rotation={i * 30}
                    origin="50, 50"
                  />
                ))}
              </G>
              <Circle cx={50} cy={50} r={22} fill={colors.woodLight} opacity={0.35} />
            </Svg>
          </Animated.View>
        )}
        {celebrate &&
          !still &&
          ending.won === true &&
          PIECES.map((p, i) => (
            <Animated.View
              key={i}
              style={[
                styles.confetti,
                p.wide && styles.confettiWide,
                {
                  backgroundColor: p.colour,
                  opacity: burst.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
                  transform: [
                    {
                      translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, p.x] }),
                    },
                    {
                      translateY: burst.interpolate({
                        inputRange: [0, 0.6, 1],
                        outputRange: [0, p.y, p.y + 60],
                      }),
                    },
                    {
                      rotate: burst.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0deg', p.turn],
                      }),
                    },
                  ],
                },
              ]}
            />
          ))}
        <Animated.View
          style={[
            styles.coin,
            { opacity: coin, transform: [{ scale: coinScale }, { rotate: coinSpin }] },
          ]}
        >
          <Svg width="100%" height="100%" viewBox="0 0 100 100">
            <Coin piece={ending.winner} set={pieces} />
          </Svg>
        </Animated.View>
        <View style={styles.words} aria-live="assertive">
          <Text style={[styles.headline, ending.won === false && styles.lost]}>
            {ending.headline}
          </Text>
          <Text style={styles.detail}>{ending.detail}</Text>
          <Text style={styles.hint}>{t('Tap to close')}</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 12,
    backgroundColor: 'rgba(31, 18, 6, 0.62)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  rays: { position: 'absolute', width: '150%', aspectRatio: 1 },
  confetti: { position: 'absolute', width: 8, height: 12, borderRadius: 2 },
  confettiWide: { width: 14, height: 6 },
  coin: { width: '42%', aspectRatio: 1 },
  words: {
    alignItems: 'center',
    marginTop: 6,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(31, 18, 6, 0.55)',
  },
  headline: {
    fontSize: 34,
    fontWeight: '800',
    color: '#ffe2a8',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  lost: { color: '#f1e9d8' },
  detail: { fontSize: 17, fontWeight: '600', color: '#ffffff', textAlign: 'center', marginTop: 4 },
  hint: { fontSize: 13, color: 'rgba(255, 255, 255, 0.75)', marginTop: 10 },
});
