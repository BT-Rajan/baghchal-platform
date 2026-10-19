import { Link } from 'expo-router';

import { Body, Screen, Title } from '@/components/ui';
import { usePalette } from '@/theme';

export default function NotFound() {
  const palette = usePalette();
  return (
    <Screen>
      <Title>Page not found</Title>
      <Body>There is nothing here.</Body>
      <Link href="/" style={{ color: palette.accent }}>
        Go to the lobby
      </Link>
    </Screen>
  );
}
