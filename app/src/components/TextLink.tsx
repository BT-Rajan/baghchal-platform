import { Link, type Href } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';

import { colors, radius, spacing } from '@/theme';

import { ripple } from './press';

/**
 * A quiet way to another screen ("I have an account"). On the web, a link; in the apps, a text
 * button with the platform's touch feedback. `onPress` runs first (forgetting something before
 * going on); `onDark` for the brand's dark colour.
 */
export function TextLink({
  href,
  onPress,
  onDark = false,
  children,
}: {
  href: Href;
  onPress?: () => void;
  onDark?: boolean;
  children: string;
}) {
  const tone = onDark && styles.onDark;
  if (Platform.OS === 'web') {
    return (
      <Link href={href} {...(onPress !== undefined && { onPress })} style={[styles.link, tone]}>
        {children}
      </Link>
    );
  }
  return (
    <Link href={href} {...(onPress !== undefined && { onPress })} asChild>
      <Pressable role="link" aria-label={children} {...ripple()} style={styles.button}>
        <Text style={[styles.text, tone]}>{children}</Text>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  // The padding makes a finger-sized target around the words.
  link: { color: colors.link, fontSize: 15, fontWeight: '600', paddingVertical: 10 },
  button: {
    minHeight: 48,
    justifyContent: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    marginHorizontal: -spacing.sm,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  text: { color: colors.link, fontSize: 15, fontWeight: '600' },
  onDark: { color: colors.brandCream },
});
