import { StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';

import type { FriendRelation } from '@/api/endpoints';
import { describeError } from '@/api/errors';
import { useFriendship } from '@/lobby/hooks';
import { colors, spacing } from '@/theme';

import { Button } from './Button';
import { Confirm } from './Confirm';
import { Notice } from './Notice';

/** On a player's profile: become friends, answer or cancel a request, or unfriend. */
export function FriendControl({
  username,
  relation,
}: {
  username: string;
  relation: FriendRelation;
}) {
  const change = useFriendship();
  const [confirming, setConfirming] = useState(false);
  const run = (add: boolean) =>
    change.mutate({ username, add }, { onSuccess: () => setConfirming(false) });
  const busy = change.isPending;
  return (
    <View style={styles.box}>
      {change.error !== null && <Notice tone="error">{describeError(change.error)}</Notice>}
      {relation === 'none' && (
        <Button
          title={`Add ${username} as a friend`}
          label="Add friend"
          icon="people"
          variant="secondary"
          busy={busy}
          onPress={() => run(true)}
        />
      )}
      {relation === 'requested' && (
        <View style={styles.row}>
          <Text style={styles.text}>Friend request sent.</Text>
          <Button
            title={`Cancel the friend request to ${username}`}
            label="Cancel request"
            variant="secondary"
            compact
            busy={busy}
            onPress={() => run(false)}
          />
        </View>
      )}
      {relation === 'incoming' && (
        <>
          <Text style={styles.text}>{`${username} wants to be friends.`}</Text>
          <View style={styles.row}>
            <View style={styles.cell}>
              <Button
                title={`Accept ${username}'s friend request`}
                label="Accept"
                variant="secondary"
                busy={busy && change.variables.add}
                onPress={() => run(true)}
              />
            </View>
            <View style={styles.cell}>
              <Button
                title={`Decline ${username}'s friend request`}
                label="Decline"
                variant="secondary"
                busy={busy && !change.variables.add}
                onPress={() => run(false)}
              />
            </View>
          </View>
        </>
      )}
      {relation === 'friends' &&
        (confirming ? (
          <Confirm
            question={`Remove ${username} from your friends?`}
            confirmTitle={`Yes, remove ${username}`}
            busy={busy}
            onConfirm={() => run(false)}
            onCancel={() => setConfirming(false)}
          />
        ) : (
          <View style={styles.row}>
            <Text style={styles.text}>{`You and ${username} are friends.`}</Text>
            <Button
              title={`Remove ${username} from your friends`}
              label="Remove"
              variant="secondary"
              compact
              onPress={() => setConfirming(true)}
            />
          </View>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cell: { flex: 1 },
  text: { flex: 1, fontSize: 15, color: colors.text },
});
