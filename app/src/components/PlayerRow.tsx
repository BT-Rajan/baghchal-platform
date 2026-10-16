import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import type { PlayerStatus } from '@/api/endpoints';
import { canChallenge, presenceText } from '@/lobby/format';
import { colors, spacing } from '@/theme';

import { Button } from './Button';
import { TextLink } from './TextLink';

export function PresenceDot({ online }: { online: boolean }) {
  return (
    <View
      aria-hidden
      style={[styles.dot, { backgroundColor: online ? colors.online : colors.offline }]}
    />
  );
}

/** A player in a list: name (to their profile), presence, and a Challenge button. */
export function PlayerRow({ player, isMe }: { player: PlayerStatus; isMe: boolean }) {
  return (
    <View style={styles.row}>
      <View style={styles.who}>
        <TextLink href={`/player/${player.username}`}>{player.username}</TextLink>
        <View style={styles.presence}>
          <PresenceDot online={player.online} />
          <Text style={styles.status}>{isMe ? 'You' : presenceText(player)}</Text>
        </View>
      </View>
      {!isMe && (
        <Button
          title={`Challenge ${player.username}`}
          label="Challenge"
          variant="secondary"
          compact
          disabled={!canChallenge(player)}
          onPress={() => router.push(`/challenge/${player.username}`)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  who: { flex: 1, gap: 2 },
  presence: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  dot: { width: 8, height: 8, borderRadius: 4 },
  status: { fontSize: 13, color: colors.muted },
});
