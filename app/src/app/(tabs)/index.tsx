import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import type { Game } from '@/api/endpoints';
import { describeError } from '@/api/errors';
import { useMe } from '@/auth/session';
import { Button } from '@/components/Button';
import { Card, Hint, SectionTitle } from '@/components/Card';
import { ChallengeCard } from '@/components/ChallengeCard';
import { Notice } from '@/components/Notice';
import { PlayerRow } from '@/components/PlayerRow';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { useNow } from '@/components/useNow';
import { isOpen, searchPrefix } from '@/lobby/format';
import {
  useActiveGames,
  useAnswerChallenge,
  useChallenges,
  useOnlinePlayers,
  usePlayerSearch,
} from '@/lobby/hooks';
import { colors } from '@/theme';

/** The lobby: my live game, my challenges, and players to challenge. */
export default function Play() {
  const me = useMe();
  const now = useNow();
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

  return (
    <Screen title="Play" align="top">
      {games.data?.map((game) => (
        <LiveGame key={game.id} game={game} myId={me.id} />
      ))}

      {answer.error !== null && <Notice tone="error">{describeError(answer.error)}</Notice>}
      {challenges.error !== null && <Notice tone="error">{describeError(challenges.error)}</Notice>}
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
      {players.error !== null && <Notice tone="error">{describeError(players.error)}</Notice>}
      {players.data === undefined ? (
        players.error === null && <Hint>Loading…</Hint>
      ) : players.data.length === 0 ? (
        <Hint>{prefix === null ? 'Nobody else is online right now.' : 'No players found.'}</Hint>
      ) : (
        <Card>
          {players.data.map((player) => (
            <PlayerRow key={player.id} player={player} isMe={player.id === me.id} />
          ))}
        </Card>
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
});
