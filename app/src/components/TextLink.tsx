import { Link, type Href } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';

import { colors, radius, spacing } from '@/theme';

import { ripple } from './press';

/**
 * A quiet way to another screen ("Already have an account? Sign in"). On the web, a link; in
 * the apps, a text button with the platform's touch feedback.
 */
export function TextLink({ href, children }: { href: Href; children: string }) {
  if (Platform.OS === 'web') {
    return (
      <Link href={href} style={styles.link}>
        {children}
      </Link>
    );
  }
  return (
    <Link href={href} asChild>
      <Pressable role="link" aria-label={children} {...ripple()} style={styles.button}>
        <Text style={styles.text}>{children}</Text>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  // The padding makes a finger-sized target around the words.
  link: { color: colors.accent, fontSize: 15, fontWeight: '600', paddingVertical: 10 },
  button: {
    minHeight: 48,
    justifyContent: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    marginHorizontal: -spacing.sm,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  text: { color: colors.accent, fontSize: 15, fontWeight: '600' },
});
