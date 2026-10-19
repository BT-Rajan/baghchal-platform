import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { ApiError } from '@/api/errors';
import {
  TIME_CONTROLS,
  type Challenge,
  type PlayerStatus,
  type Rating,
  type TimeControl,
} from '@/api/types';
import { useMe } from '@/auth/session';
import { useCreateChallenge, useRespond } from '@/hooks/queries';
import { radius, space, usePalette } from '@/theme';

import { Body, Button, Card, ErrorText, Row } from './ui';

export function StatusDot({ online, playing }: { online: boolean; playing: boolean }) {
  const palette = usePalette();
  const color = playing ? palette.accent : online ? palette.success : palette.border;
  const label = playing ? 'playing' : online ? 'online' : 'offline';
  return (
    <View
      accessibilityLabel={label}
      style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }}
    />
  );
}

export function PlayerRow({ player }: { player: PlayerStatus }) {
  const palette = usePalette();
  return (
    <Link href={`/player/${player.username}`} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${player.username}, ${player.playing ? 'playing' : player.online ? 'online' : 'offline'}`}
        // Link passes this style through a Slot, which needs a flat object.
        style={StyleSheet.flatten([styles.playerRow, { borderColor: palette.border }])}
      >
        <StatusDot online={player.online} playing={player.playing} />
        <Text style={[styles.name, { color: palette.text }]}>{player.username}</Text>
        <Text style={{ color: palette.muted }}>
          {player.playing ? 'Playing' : player.online ? 'Online' : ''}
        </Text>
      </Pressable>
    </Link>
  );
}

export function ratingText(rating: Rating | undefined): string {
  if (!rating) return '1500?';
  return `${rating.rating}${rating.provisional ? '?' : ''}`;
}

/** Challenges last 60 seconds; device clocks may disagree with the server's by a little. */
function secondsLeft(challenge: Challenge, now: number): number {
  const left = Math.ceil((Date.parse(challenge.expires_at) - now) / 1000);
  return Math.min(60, Math.max(0, left));
}

const SIDES = { goat: 'goats', tiger: 'tigers' } as const;

export function ChallengeCard({ challenge, now }: { challenge: Challenge; now: number }) {
  const me = useMe();
  const respond = useRespond();
  const incoming = challenge.opponent.id === me.id;
  const other = incoming ? challenge.challenger : challenge.opponent;
  const left = secondsLeft(challenge, now);
  const kind = challenge.rated
    ? 'Rated match (2 games)'
    : challenge.side === 'goat' || challenge.side === 'tiger'
      ? `Casual, ${incoming ? `${other.username} plays` : 'you play'} ${SIDES[challenge.side]}`
      : 'Casual, random sides';
  const act = (response: 'accept' | 'decline' | 'cancel') =>
    respond.mutate(
      { id: challenge.id, response },
      {
        onSuccess: (c) => {
          if (c.game_id) router.navigate(`/game/${c.game_id}`);
        },
      },
    );
  return (
    <Card>
      <Body>
        {incoming ? `${other.username} challenges you` : `You challenged ${other.username}`} ·{' '}
        {challenge.time_control} · {kind}
      </Body>
      <Body muted>{left > 0 ? `Expires in ${left}s` : 'Expired'}</Body>
      <ErrorText error={respond.error} />
      <Row>
        {incoming ? (
          <>
            <Button
              label="Accept"
              onPress={() => act('accept')}
              busy={respond.isPending}
              disabled={left === 0}
            />
            <Button
              label="Decline"
              kind="secondary"
              onPress={() => act('decline')}
              disabled={respond.isPending}
            />
          </>
        ) : (
          <Button
            label="Cancel"
            kind="secondary"
            onPress={() => act('cancel')}
            busy={respond.isPending}
          />
        )}
      </Row>
    </Card>
  );
}

function Choice<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  const palette = usePalette();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.choices}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => onChange(o.value)}
            style={[
              styles.choice,
              {
                borderColor: on ? palette.accent : palette.border,
                backgroundColor: on ? palette.accent : 'transparent',
              },
            ]}
          >
            <Text style={{ color: on ? palette.accentText : palette.text, fontWeight: '600' }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

type SideChoice = 'random' | 'goat' | 'tiger';

export function ChallengeForm({ opponent, onSent }: { opponent: string; onSent?: () => void }) {
  const palette = usePalette();
  const create = useCreateChallenge();
  const [timeControl, setTimeControl] = useState<TimeControl>('5+3');
  const [rated, setRated] = useState(true);
  const [side, setSide] = useState<SideChoice>('random');
  const [sent, setSent] = useState(false);

  const send = () =>
    create.mutate(
      rated
        ? { opponent, time_control: timeControl, rated: true }
        : { opponent, time_control: timeControl, rated: false, side },
      {
        onSuccess: () => {
          setSent(true);
          onSent?.();
        },
      },
    );

  if (sent) {
    return (
      <Card>
        <Body>Challenge sent to {opponent}. The game opens as soon as they accept.</Body>
        <Button label="Send another" kind="secondary" onPress={() => setSent(false)} />
      </Card>
    );
  }

  const busy = create.error instanceof ApiError && create.error.code === 'player_busy';
  return (
    <Card>
      <Body muted>Time control (minutes + seconds per move)</Body>
      <Choice
        label="Time control"
        options={TIME_CONTROLS.map((t) => ({ value: t.label, label: `${t.label} ${t.category}` }))}
        value={timeControl}
        onChange={setTimeControl}
      />
      <Row>
        <Switch
          value={rated}
          onValueChange={setRated}
          accessibilityLabel="Rated"
          trackColor={{ true: palette.accent }}
        />
        <Body>
          {rated ? 'Rated: a two-game match, you play each side once' : 'Casual: not rated'}
        </Body>
      </Row>
      {!rated ? (
        <Choice
          label="Your side"
          options={[
            { value: 'random', label: 'Random' },
            { value: 'goat', label: '🐐 Goats' },
            { value: 'tiger', label: '🐯 Tigers' },
          ]}
          value={side}
          onChange={setSide}
        />
      ) : null}
      <ErrorText error={create.error} />
      {busy ? <Body muted>Finish your current game first.</Body> : null}
      <Button label={`Challenge ${opponent}`} onPress={send} busy={create.isPending} />
    </Card>
  );
}

const styles = StyleSheet.create({
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
  },
  name: { fontSize: 16, fontWeight: '600', flex: 1 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  choice: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    minHeight: 40,
    justifyContent: 'center',
  },
});
