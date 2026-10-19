import { Text } from 'react-native';

import { useRealtime } from '@/realtime/provider';
import { usePalette } from '@/theme';

/** Shown in headers: whether live updates are flowing. */
export function ConnectionBadge() {
  const { status } = useRealtime();
  const palette = usePalette();
  if (status === 'online') return null;
  return (
    <Text accessibilityRole="alert" style={{ color: palette.muted, marginHorizontal: 12 }}>
      {status === 'connecting' ? 'Connecting…' : 'Offline, reconnecting…'}
    </Text>
  );
}
