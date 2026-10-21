import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import type { Game } from '@/api/endpoints';
import { useMe } from '@/auth/session';
import { Button } from '@/components/Button';
import { Card, Hint, SectionTitle } from '@/components/Card';
import { ChallengeCard } from '@/components/ChallengeCard';
import { ChallengeOutcome } from '@/components/ChallengeOutcome';
import { DailyPuzzle } from '@/components/DailyPuzzle';
import { ErrorNotice } from '@/components/ErrorNotice';
import { FeatureLink } from '@/components/FeatureLink';
import { FriendList, FriendRequests } from '@/components/Friends';
import { GameHistory } from '@/components/GameHistory';
import { GuestBanner } from '@/components/GuestBanner';
import { Notice } from '@/components/Notice';
import { PlayerSearch } from '@/components/PlayerSearch';
import { Screen } from '@/components/Screen';
import { ErrorState } from '@/components/States';
import { useServerNow } from '@/components/useNow';
import { t } from '@/i18n';
import { isOpen } from '@/lobby/format';
import {
  useActiveGames,
  useAnswerChallenge,
  useChallengeOutcomes,
  useChallenges,
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
  const outcomes = useChallengeOutcomes(now);

  const incoming = challenges.data?.incoming.filter((c) => isOpen(c, now)) ?? [];
  const outgoing = challenges.data?.outgoing.filter((c) => isOpen(c, now)) ?? [];
  // Back from challenging someone by name: a word that it went, while it is open.
  const sentId = useLocalSearchParams<{ sent?: string }>().sent;
  const sentTo = outgoing.find((c) => c.id === sentId)?.opponent?.username;
  const pendingFor = (id: string) =>
    answer.isPending && answer.variables.id === id ? answer.variables.answer : null;

  const wide = width >= WIDE;
  const live = (games.data?.length ?? 0) > 0;

  const gamesAndChallenges = (
    <View style={styles.column}>
      {games.error !== null && (
        <ErrorState error={games.error} onRetry={() => void games.refetch()} />
      )}
      {games.data?.map((game) => (
        <LiveGame key={game.id} game={game} myId={me.id} />
      ))}
      <ErrorNotice error={answer.error} />
      {challenges.error !== null && (
        <ErrorState error={challenges.error} onRetry={() => void challenges.refetch()} />
      )}
      {incoming.length > 0 && <SectionTitle>{t('Challenges for you')}</SectionTitle>}
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
      {outcomes.map((c) => (
        <ChallengeOutcome key={c.id} challenge={c} />
      ))}
      {outgoing.length > 0 && <SectionTitle>{t('Your challenges')}</SectionTitle>}
      {sentTo !== undefined && (
        <Notice tone="success">{t('Challenge sent to {name}.', { name: sentTo })}</Notice>
      )}
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
      {/* Shown unless a game is on (also while my games load, or when they could not be). */}
      {!live && (
        <Card>
          <Text style={styles.cardTitle}>{t('Ready for a game?')}</Text>
          <Hint>
            {t('Quick or standard, rated or casual, with whoever is waiting or the computer.')}
          </Hint>
          {/* One main action: answering a challenge comes first when there is one. */}
          <Button
            title={t('Play now')}
            variant={incoming.length > 0 ? 'secondary' : 'primary'}
            onPress={() => router.push('/play')}
          />
        </Card>
      )}
      <MoreWaysToPlay guest={me.role === 'guest'} />
      <DailyPuzzle />
      <GameHistory username={me.username} preview />
      <GuestBanner />
    </View>
  );

  const playerList = (
    <View style={styles.column}>
      <FriendList myId={me.id} />
      <PlayerSearch
        nobodyElse={
          <Hint>
            {t(
              'Nobody else is online right now. Play now finds you a game, with the computer if need be.',
            )}
          </Hint>
        }
      />
    </View>
  );

  return (
    <Screen title={t('Play')} align="top" wide={wide} refreshable>
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

/**
 * The app's other ways to play, where they are seen: challenges by link and tournaments (the
 * trainer is offered by today's puzzle, below).
 */
function MoreWaysToPlay({ guest }: { guest: boolean }) {
  return (
    <>
      <SectionTitle>{t('More ways to play')}</SectionTitle>
      {/* Challenges need an account. */}
      {!guest && (
        <FeatureLink
          icon="link"
          title={t('Challenge a friend by link')}
          text={t('Send a link; the game starts when your friend opens it.')}
          onPress={() => router.push('/invite')}
        />
      )}
      <FeatureLink
        icon="trophy"
        title={t('Tournaments')}
        text={t('Swiss tournaments with friends: join one by link, or host your own.')}
        onPress={() => router.push('/tournaments')}
      />
    </>
  );
}

function LiveGame({ game, myId }: { game: Game; myId: string }) {
  const opponent = game.goat.id === myId ? game.tiger : game.goat;
  return (
    <Card tone="accent">
      <Text style={styles.cardTitle}>{t('Continue your game')}</Text>
      <Text style={styles.live}>
        {t('Your game against {name} is on.', { name: opponent.username })}
      </Text>
      <Button title={t('Resume game')} onPress={() => router.push(`/game/${game.id}`)} />
    </Card>
  );
}

const styles = StyleSheet.create({
  cardTitle: { ...type.heading, color: colors.text },
  live: { ...type.body, color: colors.text },
  row: { flexDirection: 'row', gap: spacing.xl, alignItems: 'flex-start' },
  half: { flex: 1 },
  column: { gap: spacing.md },
});
