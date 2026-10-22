import { Link, usePathname, type Href } from 'expo-router';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { useSession } from '@/auth/session';
import { mark, t } from '@/i18n';
import { colors, radius, spacing, type } from '@/theme';

import { Brand } from '../brand/Logo';
import { NotificationBell } from '../NotificationBell';

/** Narrower than this, the places get a row of their own under the logo. */
const NARROW = 640;

/** The main places, for someone signed in: the same three as the apps' tabs. */
const PLACES: readonly { href: Href; label: string; match: (path: string) => boolean }[] = [
  {
    href: '/',
    label: mark('Play'),
    match: (p) =>
      p === '/' ||
      p.startsWith('/game') ||
      ['/play', '/ways-to-play', '/friends', '/puzzle'].includes(p),
  },
  { href: '/leaderboard', label: mark('Leaderboard'), match: (p) => p === '/leaderboard' },
  { href: '/me', label: mark('Me'), match: (p) => p === '/me' || p.startsWith('/settings') },
];

/**
 * The bar across the top of every web page: the ClawPlay logo, which goes home, and the main
 * places (Play, Leaderboard, Me and the notifications), or ways in for someone signed out. The
 * apps have their tabs instead.
 */
export function WebTopBar({ playing }: { playing: boolean }) {
  const { state } = useSession();
  const pathname = usePathname();
  const signedOut = state.status === 'signedOut';
  const narrow = useWindowDimensions().width < NARROW;
  const places = playing && (
    <View role="navigation" style={[styles.places, narrow && styles.placesNarrow]}>
      {PLACES.map((place) => {
        const current = place.match(pathname);
        return (
          <Link
            key={place.label}
            href={place.href}
            aria-current={current ? 'page' : undefined}
            style={[styles.place, current && styles.current]}
          >
            {t(place.label)}
          </Link>
        );
      })}
    </View>
  );
  return (
    <View role="banner" style={styles.bar}>
      <View style={styles.inner}>
        <Link href="/" aria-label={t('ClawPlay home')} style={styles.home}>
          <Brand size={30} onDark />
        </Link>
        {!narrow && places}
        <View style={styles.end}>
          {playing && <NotificationBell />}
          {signedOut && (
            <>
              <Link href="/sign-in" style={styles.place}>
                {t('Sign in')}
              </Link>
              <Link href="/sign-up" style={[styles.place, styles.cta]}>
                <Text style={styles.ctaText}>{t('Make a free account')}</Text>
              </Link>
            </>
          )}
        </View>
      </View>
      {narrow && places}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: colors.brandInk, paddingHorizontal: spacing.md },
  inner: {
    width: '100%',
    maxWidth: 1100,
    alignSelf: 'center',
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  home: { paddingVertical: spacing.sm },
  places: { flexDirection: 'row', gap: spacing.xs },
  placesNarrow: { paddingBottom: spacing.sm, justifyContent: 'space-between' },
  place: {
    ...type.label,
    color: colors.brandCream,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    // 44 points: the smallest comfortable touch target, the words in its middle.
    minHeight: 44,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  current: { backgroundColor: colors.currentOnDark, color: colors.brandLight },
  end: { marginStart: 'auto', flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cta: { backgroundColor: colors.brandLight },
  ctaText: { ...type.label, color: colors.brandInk },
});
