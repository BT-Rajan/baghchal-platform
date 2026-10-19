import { router } from 'expo-router';
import { useState } from 'react';

import type { Game } from '@/api/types';
import { useMe } from '@/auth/session';
import { ChallengeCard, PlayerRow } from '@/components/lobby';
import { Body, Button, Card, ErrorText, Field, Heading, Loading, Screen } from '@/components/ui';
import {
  useActiveGames,
  useChallenges,
  useNow,
  useOnlinePlayers,
  usePlayerSearch,
} from '@/hooks/queries';

function ResumeBanner({ game, me }: { game: Game; me: string }) {
  const opponent = game.goat.id === me ? game.tiger : game.goat;
  return (
    <Card>
      <Body>
        Your game against {opponent.username} ({game.time_control}) is in progress.
      </Body>
      <Button label="Return to game" onPress={() => router.push(`/game/${game.id}`)} />
    </Card>
  );
}

export default function Lobby() {
  const me = useMe();
  const now = useNow(1000);
  const [search, setSearch] = useState('');
  const games = useActiveGames();
  const challenges = useChallenges();
  const online = useOnlinePlayers();
  const found = usePlayerSearch(search.trim());

  const open = (list: NonNullable<typeof challenges.data>['incoming']) =>
    list.filter((c) => Date.parse(c.expires_at) > now);
  const incoming = challenges.data ? open(challenges.data.incoming) : [];
  const outgoing = challenges.data ? open(challenges.data.outgoing) : [];
  const others = (online.data ?? []).filter((p) => p.id !== me.id);

  return (
    <Screen>
      {games.data?.map((g) => (
        <ResumeBanner key={g.id} game={g} me={me.id} />
      ))}

      {incoming.length + outgoing.length > 0 ? <Heading>Challenges</Heading> : null}
      <ErrorText error={challenges.error} />
      {incoming.map((c) => (
        <ChallengeCard key={c.id} challenge={c} now={now} />
      ))}
      {outgoing.map((c) => (
        <ChallengeCard key={c.id} challenge={c} now={now} />
      ))}

      <Heading>Find a player</Heading>
      <Field
        label="Username"
        placeholder="Start typing a username"
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={20}
      />
      {search.trim() ? (
        found.isLoading ? (
          <Loading />
        ) : found.data?.length ? (
          found.data.map((p) => <PlayerRow key={p.id} player={p} />)
        ) : (
          <Body muted>{found.error ? 'Search failed.' : 'No players found.'}</Body>
        )
      ) : null}

      <Heading>Online now</Heading>
      <ErrorText error={online.error} />
      {online.isLoading ? (
        <Loading />
      ) : others.length ? (
        others.map((p) => <PlayerRow key={p.id} player={p} />)
      ) : (
        <Body muted>Nobody else is online right now. Search for a friend above.</Body>
      )}
      {online.data ? (
        <Button label="Refresh" kind="secondary" onPress={() => void online.refetch()} />
      ) : null}
    </Screen>
  );
}
