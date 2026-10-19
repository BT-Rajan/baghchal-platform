import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import type { Game } from '@/api/endpoints';
import { describeError } from '@/api/errors';
import { useMe } from '@/auth/session';
import { Button } from '@/components/Button';
import { Card, Hint, SectionTitle } from '@/components/Card';
import { ChallengeCard } from '@/components/ChallengeCard';
import { DailyPuzzle } from '@/components/DailyPuzzle';
import { FeatureLink } from '@/components/FeatureLink';
import { FriendList, FriendRequests } from '@/components/Friends';
import { GameHistory } from '@/components/GameHistory';
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
import { colors, spacing, type } from '@/theme';

/** Two columns (my games and things to do | players) from this width. */
const WIDE = 900;

/**
 * Home: a game to continue, challenges, a way to start one, today's puzzle and my latest
 * results, beside the players online to challenge.
 */
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
      <FriendRequests />
      {games.data?.length === 0 && (
        <Card>
          <Text style={styles.cardTitle}>Ready for a game?</Text>
          <Hint>Quick or standard, rated or casual, with whoever is waiting or the computer.</Hint>
          <Button title="Play now" onPress={() => router.push('/play')} />
        </Card>
      )}
      <MoreWaysToPlay guest={me.role === 'guest'} />
      <DailyPuzzle />
      <GameHistory username={me.username} preview />
    </View>
  );

  const playerList = (
    <View style={styles.column}>
      <FriendList myId={me.id} />
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
        prefix === null ? (
          <NobodyOnline guest={me.role === 'guest'} />
        ) : (
          <Hint>No players found.</Hint>
        )
      ) : (
        <>
          <Card>
            {players.data.map((player) => (
              <PlayerRow key={player.id} player={player} isMe={player.id === me.id} />
            ))}
          </Card>
          {prefix === null && others === 0 && <NobodyOnline guest={me.role === 'guest'} />}
        </>
      )}
    </View>
  );

  return (
    <Screen title="Play" align="top" wide={wide} refreshable>
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

/** Nobody to challenge here: the next steps are Play now and the ways to play beside it. */
function NobodyOnline({ guest }: { guest: boolean }) {
  return (
    <Hint>
      {guest
        ? 'Nobody else is online right now. Play now finds you a game, with the computer if need be.'
        : 'Nobody else is online right now. Send a friend a challenge by link, or Play now.'}
    </Hint>
  );
}

/** The app's other ways to play, where they are seen: challenges by link, tournaments, the trainer. */
function MoreWaysToPlay({ guest }: { guest: boolean }) {
  return (
    <>
      <SectionTitle>More ways to play</SectionTitle>
      {/* Challenges need an account. */}
      {!guest && (
        <FeatureLink
          icon="link"
          title="Challenge a friend by link"
          text="Send a link; the game starts when your friend opens it."
          onPress={() => router.push('/invite')}
        />
      )}
      <FeatureLink
        icon="trophy"
        title="Tournaments"
        text="Swiss tournaments with friends: join one by link, or host your own."
        onPress={() => router.push('/tournaments')}
      />
      <FeatureLink
        icon="puzzle"
        title="Trainer"
        text="Opening and endgame puzzles from real games, one best move each."
        feature="trainer"
        onPress={() => router.push('/trainer')}
      />
    </>
  );
}

function LiveGame({ game, myId }: { game: Game; myId: string }) {
  const opponent = game.goat.id === myId ? game.tiger : game.goat;
  return (
    <Card tone="accent">
      <Text style={styles.cardTitle}>Continue your game</Text>
      <Text style={styles.live}>{`Your game against ${opponent.username} is on.`}</Text>
      <Button title="Resume game" onPress={() => router.push(`/game/${game.id}`)} />
    </Card>
  );
}

const styles = StyleSheet.create({
  cardTitle: { ...type.heading, color: colors.text },
  live: { fontSize: 16, color: colors.text },
  row: { flexDirection: 'row', gap: spacing.xl, alignItems: 'flex-start' },
  half: { flex: 1 },
  column: { gap: spacing.md },
});
