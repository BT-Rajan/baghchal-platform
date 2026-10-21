import { StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';

import type { FriendRelation } from '@/api/endpoints';
import { t } from '@/i18n';
import { useFriendship } from '@/lobby/hooks';
import { colors, spacing, type } from '@/theme';

import { Button } from './Button';
import { Confirm } from './Confirm';
import { ErrorNotice } from './ErrorNotice';

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
      {/* While asking, a failure shows in the question. */}
      {!confirming && <ErrorNotice error={change.error} />}
      {relation === 'none' && (
        <Button
          title={t('Add {name} as a friend', { name: username })}
          label={t('Add friend')}
          icon="people"
          variant="secondary"
          busy={busy}
          onPress={() => run(true)}
        />
      )}
      {relation === 'requested' && (
        <View style={styles.row}>
          <Text style={styles.text}>{t('Friend request sent.')}</Text>
          <Button
            title={t('Cancel the friend request to {name}', { name: username })}
            label={t('Cancel request')}
            variant="secondary"
            compact
            busy={busy}
            onPress={() => run(false)}
          />
        </View>
      )}
      {relation === 'incoming' && (
        <>
          <Text style={styles.text}>{t('{name} wants to be friends.', { name: username })}</Text>
          <View style={styles.row}>
            <View style={styles.cell}>
              <Button
                title={t("Accept {name}'s friend request", { name: username })}
                label={t('Accept')}
                variant="secondary"
                busy={busy && change.variables.add}
                onPress={() => run(true)}
              />
            </View>
            <View style={styles.cell}>
              <Button
                title={t("Decline {name}'s friend request", { name: username })}
                label={t('Decline')}
                variant="secondary"
                busy={busy && !change.variables.add}
                onPress={() => run(false)}
              />
            </View>
          </View>
        </>
      )}
      {relation === 'friends' && (
        <Confirm
          open={confirming}
          question={t('Remove {name} from your friends?', { name: username })}
          confirmTitle={t('Yes, remove {name}', { name: username })}
          busy={busy}
          error={change.error}
          onConfirm={() => run(false)}
          onCancel={() => {
            change.reset();
            setConfirming(false);
          }}
        >
          <View style={styles.row}>
            <Text style={styles.text}>{t('You and {name} are friends.', { name: username })}</Text>
            <Button
              title={t('Remove {name} from your friends', { name: username })}
              label={t('Remove')}
              variant="secondary"
              compact
              onPress={() => setConfirming(true)}
            />
          </View>
        </Confirm>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.sm },
  // The button moves under the words when the row is too narrow for both.
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  cell: { flexGrow: 1, flexBasis: 140 },
  text: { ...type.small, color: colors.text, flexGrow: 1, flexShrink: 1, flexBasis: 160 },
});
