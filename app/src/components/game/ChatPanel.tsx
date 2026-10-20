import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Game } from '@/api/endpoints';
import { describeError } from '@/api/errors';
import type { Piece } from '@/game/bfen';
import { nameOf } from '@/game/describe';
import { useChat, useSendChat } from '@/game/hooks';
import { colors, spacing, type } from '@/theme';

import { Button } from '../Button';
import { Card, Hint, SectionTitle } from '../Card';
import { Notice } from '../Notice';
import { TextField } from '../TextField';

const MAX_LENGTH = 200;

/**
 * Chat with my opponent, beside the quick messages: only between two adults with accounts who
 * both have messages on (the server decides, and says why not). Nothing shows against the
 * computer, a guest or a player under 18, who keep the quick messages.
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
      <SectionTitle>Chat</SectionTitle>
      {data.closed_because === 'messages_off' ? (
        <Hint>
          Chat is off because one of you has turned messages off (the speech bubble above).
        </Hint>
      ) : (
        <>
          {data.messages.length === 0 ? (
            <Hint>Say hello. Be kind: messages are kept 30 days so reports can be checked.</Hint>
          ) : (
            <Card>
              {data.messages.map((m, i) => (
                <Text key={`${m.sent_at}-${i}`} style={styles.message}>
                  <Text style={styles.who}>{m.side === mine ? 'You' : nameOf(game, m.side)}</Text>
                  {`  ${m.text}`}
                </Text>
              ))}
            </Card>
          )}
          {send.error !== null && <Notice tone="error">{describeError(send.error)}</Notice>}
          {data.open && (
            <View style={styles.compose}>
              <View style={styles.field}>
                <TextField
                  label="Message"
                  value={text}
                  onChangeText={setText}
                  maxLength={MAX_LENGTH}
                  returnKeyType="send"
                  onSubmitEditing={submit}
                />
              </View>
              <Button
                title="Send"
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
