import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Room, Side, TimeControl } from '@/api/endpoints';
import { describeError } from '@/api/errors';
import { has } from '@/billing/format';
import { useMyPlan } from '@/billing/hooks';
import { Button } from '@/components/Button';
import { Card, Hint, SectionTitle } from '@/components/Card';
import { Notice } from '@/components/Notice';
import { Upsell } from '@/components/Upsell';
import { Screen } from '@/components/Screen';
import { Segmented } from '@/components/Segmented';
import { ErrorState, Loading } from '@/components/States';
import { TIME_CONTROLS } from '@/lobby/format';
import { roomText, shareLink } from '@/pro/format';
import { useCloseRoom, useCreateRoom, useRooms } from '@/pro/hooks';
import { colors, spacing } from '@/theme';

const TIME_OPTIONS = TIME_CONTROLS.map(({ label }) => ({ value: label, label }));
const SIDES: readonly { value: Side; label: string }[] = [
  { value: 'random', label: 'Random' },
  { value: 'goat', label: 'Goats' },
  { value: 'tiger', label: 'Tigers' },
];

/** Private rooms: a link to a casual game for a friend (Pro). */
export default function Rooms() {
  const plan = useMyPlan();
  return (
    <Screen title="Private rooms" align="top">
      <Hint>
        Make a link to a casual game and send it to a friend. Whoever opens it first, signed in,
        plays you, as long as you are online. Links last a day.
      </Hint>
      {plan.error !== null ? (
        <ErrorState error={plan.error} onRetry={() => void plan.refetch()} />
      ) : plan.data === undefined ? (
        <Loading label="Loading your plan" />
      ) : has(plan.data, 'private_rooms') ? (
        <>
          <NewRoom />
          <OpenRooms />
        </>
      ) : (
        <Upsell feature="private_rooms">
          Make private rooms: a link to a game, for the friend you send it to.
        </Upsell>
      )}
    </Screen>
  );
}

function NewRoom() {
  const [timeControl, setTimeControl] = useState<TimeControl>('5+3');
  const [side, setSide] = useState<Side>('random');
  const create = useCreateRoom();
  return (
    <>
      <SectionTitle>New room</SectionTitle>
      <Segmented
        label="Time control (minutes + seconds per move)"
        options={TIME_OPTIONS}
        value={timeControl}
        onChange={setTimeControl}
      />
      <Segmented label="You play" options={SIDES} value={side} onChange={setSide} />
      {create.error !== null && <Notice tone="error">{describeError(create.error)}</Notice>}
      <Button
        title="Make a room"
        busy={create.isPending}
        onPress={() => create.mutate({ time_control: timeControl, side })}
      />
    </>
  );
}

function OpenRooms() {
  const rooms = useRooms();
  const close = useCloseRoom();
  return (
    <>
      <SectionTitle>Your open rooms</SectionTitle>
      {close.error !== null && <Notice tone="error">{describeError(close.error)}</Notice>}
      {rooms.error !== null ? (
        <ErrorState error={rooms.error} onRetry={() => void rooms.refetch()} />
      ) : rooms.data === undefined ? (
        <Loading label="Loading your rooms" />
      ) : rooms.data.length === 0 ? (
        <Hint>No open rooms.</Hint>
      ) : (
        rooms.data.map((room) => (
          <RoomCard
            key={room.code}
            room={room}
            closing={close.isPending && close.variables === room.code}
            onClose={() => close.mutate(room.code)}
          />
        ))
      )}
    </>
  );
}

function RoomCard({
  room,
  closing,
  onClose,
}: {
  room: Room;
  closing: boolean;
  onClose: () => void;
}) {
  return (
    <Card>
      <Text style={styles.text}>{roomText(room)}</Text>
      <Text style={styles.link} selectable aria-label="Link to share">
        {shareLink(`/room/${room.code}`)}
      </Text>
      <View style={styles.row}>
        <Button
          title={`Open room ${room.code}`}
          label="Open"
          variant="secondary"
          compact
          onPress={() => router.push(`/room/${room.code}`)}
        />
        <Button
          title={`Close room ${room.code}`}
          label="Close"
          variant="secondary"
          compact
          busy={closing}
          onPress={onClose}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  text: { fontSize: 15, color: colors.text },
  link: { fontSize: 15, fontWeight: '600', color: colors.accent },
  row: { flexDirection: 'row', gap: spacing.sm },
});
