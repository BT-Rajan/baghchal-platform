import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Game } from '@/api/endpoints';
import type { Piece } from '@/game/bfen';
import { nameOf } from '@/game/describe';
import { useChat, useSendChat } from '@/game/hooks';
import { t } from '@/i18n';
import { colors, spacing, type } from '@/theme';

import { Button } from '../Button';
import { Card, Hint, SectionTitle } from '../Card';
import { TextField } from '../TextField';
import { ErrorNotice } from '../ErrorNotice';

const MAX_LENGTH = 200;

/**
 * Chat with my opponent, beside the quick messages: only between two players with accounts who
 * both have messages on (the server decides, and says why not). Nothing shows against the
 * computer or a guest, who keep the quick messages.
 */
export function ChatPanel({ game, mine }: { game: Game; mine: Piece }) {
  const chat = useChat(game.id, game.computer === null, game.status !== 'active');
  const send = useSendChat(game.id);
  const [text, setText] = useState('');
  const data = chat.data;
  if (data === undefined) return null;
  const shown = data.open || data.closed_because === 'game_over';
  if (!shown && data.closed_because !== 'messages_off') return null;

  const submit = () => {
    const message = text.trim();
    if (message === '' || send.isPending) return; // Enter pressed twice sends once
    send.mutate(message, { onSuccess: () => setText('') });
  };

  return (
    <View style={styles.panel}>
      <SectionTitle>{t('Chat')}</SectionTitle>
      {data.closed_because === 'messages_off' ? (
        <Hint>{t('Chat is off: one of you turned it off.')}</Hint>
      ) : (
        <>
          {data.messages.length === 0 ? (
            <Hint>{t('Say hello. Messages are kept 30 days.')}</Hint>
          ) : (
            <Card>
              {data.messages.map((m, i) => (
                <Text key={`${m.sent_at}-${i}`} style={styles.message}>
                  <Text style={styles.who}>
                    {m.side === mine ? t('You') : nameOf(game, m.side)}
                  </Text>
                  {`  ${m.text}`}
                </Text>
              ))}
            </Card>
          )}
          <ErrorNotice error={send.error} />
          {data.open && (
            <View style={styles.compose}>
              <View style={styles.field}>
                <TextField
                  label={t('Message')}
                  value={text}
                  onChangeText={setText}
                  maxLength={MAX_LENGTH}
                  returnKeyType="send"
                  // Sending keeps the keyboard up, for the next message.
                  submitBehavior="submit"
                  onSubmitEditing={submit}
                />
              </View>
              <Button
                title={t('Send')}
                variant="secondary"
                compact
                busy={send.isPending}
                disabled={text.trim() === ''}
                onPress={submit}
              />
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: spacing.sm },
  message: { ...type.body, color: colors.text },
  who: { fontWeight: '700' },
  compose: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  field: { flex: 1 },
});
