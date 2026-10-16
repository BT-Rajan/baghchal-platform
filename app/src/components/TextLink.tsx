import { Link, type Href } from 'expo-router';
import { StyleSheet } from 'react-native';

import { colors } from '@/theme';

export function TextLink({ href, children }: { href: Href; children: string }) {
  return (
    <Link href={href} style={styles.link}>
      {children}
    </Link>
  );
}

const styles = StyleSheet.create({
  link: { color: colors.accent, fontSize: 15, fontWeight: '600', paddingVertical: 4 },
});
