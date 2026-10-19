import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import type { Game } from '@/api/endpoints';
import { describeError } from '@/api/errors';
import { useMe } from '@/auth/session';
import { Button } from '@/components/Button';
import { Card, Hint, SectionTitle } from '@/components/Card';
import { ChallengeCard } from '@/components/ChallengeCard';
import { GuestBanner } from '@/components/GuestBanner';
import { Notice } from '@/components/Notice';
import { PlayerRow } from '@/components/PlayerRow';
import { Screen } from '@/components/Screen';
import { ErrorState, Loading } from '@/components/States';
import { TextField } from '@/components/TextField';
import { useServerNow } from '@/components/useNow';
import { isOpen, searchPrefix } from '@/lobby/format';
import {
  useActiveGames,
  useAnswerChallenge,
  useChallenges,
  useOnlinePlayers,
  usePlayerSearch,
} from '@/lobby/hooks';
import { colors, spacing } from '@/theme';

/** Two columns (challenges | players) from this width. */
const WIDE = 900;

/** The lobby: my live game, my challenges, and players to challenge. */
export default function Play() {
  const me = useMe();
  const now = useServerNow();
  const { width } = useWindowDimensions();
  const games = useActiveGames();
  const challenges = useChallenges();
  const answer = useAnswerChallenge();
  const [search, setSearch] = useState('');
  const prefix = searchPrefix(search);
  const online = useOnlinePlayers();
  const found = usePlayerSearch(prefix);
  const players = prefix === null ? online : found;

  const incoming = challenges.data?.incoming.filter((c) => isOpen(c, now)) ?? [];
  const outgoing = challenges.data?.outgoing.filter((c) => isOpen(c, now)) ?? [];
  const pendingFor = (id: string) =>
    answer.isPending && answer.variables.id === id ? answer.variables.answer : null;

  const others = players.data?.filter((p) => p.id !== me.id).length ?? 0;
  const quiet =
    games.data?.length === 0 &&
    challenges.data !== undefined &&
    incoming.length + outgoing.length === 0;
  const wide = width >= WIDE;

  const gamesAndChallenges = (
    <View style={styles.column}>
      {games.error !== null && (
        <ErrorState error={games.error} onRetry={() => void games.refetch()} />
      )}
      {games.data?.map((game) => (
        <LiveGame key={game.id} game={game} myId={me.id} />
      ))}
      {answer.error !== null && <Notice tone="error">{describeError(answer.error)}</Notice>}
      {challenges.error !== null && (
        <ErrorState error={challenges.error} onRetry={() => void challenges.refetch()} />
      )}
      {games.data?.length === 0 && <Button title="Play now" onPress={() => router.push('/play')} />}
      {quiet && (
        <Hint>
          Play now pairs you with anyone who wants the same game, or with the computer. You can also
          challenge someone who is online, or wait here to be challenged.
        </Hint>
      )}
      {incoming.length > 0 && <SectionTitle>Challenges for you</SectionTitle>}
      {incoming.map((c) => (
        <ChallengeCard
          key={c.id}
          challenge={c}
          myId={me.id}
          now={now}
          pending={pendingFor(c.id)}
          onAnswer={(a) => answer.mutate({ id: c.id, answer: a })}
        />
      ))}
      {outgoing.length > 0 && <SectionTitle>Your challenges</SectionTitle>}
      {outgoing.map((c) => (
        <ChallengeCard
          key={c.id}
          challenge={c}
          myId={me.id}
          now={now}
          pending={pendingFor(c.id)}
          onAnswer={(a) => answer.mutate({ id: c.id, answer: a })}
        />
      ))}
    </View>
  );

  const playerList = (
    <View style={styles.column}>
      <SectionTitle>
        {prefix === null ? 'Online now' : `Players starting with “${prefix}”`}
      </SectionTitle>
      <TextField
        label="Find a player"
        value={search}
        onChangeText={setSearch}
        placeholder="Username"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={20}
      />
      {players.error !== null ? (
        <ErrorState error={players.error} onRetry={() => void players.refetch()} />
      ) : players.data === undefined ? (
        <Loading label="Loading players" />
      ) : players.data.length === 0 ? (
        <Hint>{prefix === null ? 'Nobody else is online right now.' : 'No players found.'}</Hint>
      ) : (
        <>
          <Card>
            {players.data.map((player) => (
              <PlayerRow key={player.id} player={player} isMe={player.id === me.id} />
            ))}
          </Card>
          {prefix === null && others === 0 && <Hint>Nobody else is online right now.</Hint>}
        </>
      )}
    </View>
  );

  return (
    <Screen title="Play" align="top" wide={wide}>
      <GuestBanner />
      {wide ? (
        <View style={styles.row}>
          <View style={styles.half}>{gamesAndChallenges}</View>
          <View style={styles.half}>{playerList}</View>
        </View>
      ) : (
        <>
          {gamesAndChallenges}
          {playerList}
        </>
      )}
    </Screen>
  );
}

function LiveGame({ game, myId }: { game: Game; myId: string }) {
  const opponent = game.goat.id === myId ? game.tiger : game.goat;
  return (
    <Card>
      <Text style={styles.live}>{`Your game against ${opponent.username} is on.`}</Text>
      <Button title="Resume game" onPress={() => router.push(`/game/${game.id}`)} />
    </Card>
  );
}

const styles = StyleSheet.create({
  live: { fontSize: 16, fontWeight: '600', color: colors.text },
  row: { flexDirection: 'row', gap: spacing.xl, alignItems: 'flex-start' },
  half: { flex: 1 },
  column: { gap: spacing.md },
});
