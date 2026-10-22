import { router, useLocalSearchParams } from 'expo-router';
import { Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import type { Game } from '@/api/endpoints';
import { useMe } from '@/auth/session';
import { Button } from '@/components/Button';
import { Card, Hint, SectionTitle } from '@/components/Card';
import { ChallengeCard } from '@/components/ChallengeCard';
import { ChallengeOutcome } from '@/components/ChallengeOutcome';
import { DailyPuzzle } from '@/components/DailyPuzzle';
import { DemoBoard } from '@/components/game/DemoBoard';
import { ErrorNotice } from '@/components/ErrorNotice';
import { FriendList, FriendRequests } from '@/components/Friends';
import { GameHistory } from '@/components/GameHistory';
import { GuestBanner } from '@/components/GuestBanner';
import { SuccessNotice } from '@/components/Snackbar';
import { PlayerSearch } from '@/components/PlayerSearch';
import { PlayModes } from '@/components/PlayModes';
import { Screen } from '@/components/Screen';
import { ErrorState } from '@/components/States';
import { useServerNow } from '@/components/useNow';
import { t } from '@/i18n';
import { CATEGORIES, isOpen } from '@/lobby/format';
import {
  useActiveGames,
  useAnswerChallenge,
  useChallengeOutcomes,
  useChallenges,
  useProfile,
} from '@/lobby/hooks';
import { colors, joinedLetters, radius, shadow, spacing, type } from '@/theme';

/** The board beside the hero, and two columns below (my day | players), from this width. */
const WIDE = 900;

/**
 * Home: a game to continue and challenges first. In the apps, then just two big buttons: Play
 * now (the play menu, app/ways-to-play.tsx, with every way to play) and Settings (and, for a
 * guest, the way to an account). On the web, a game's home page: a hero with the main action,
 * every way to play as tiles, then today's puzzle and my latest results beside the players
 * online to challenge.
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
  const app = Platform.OS !== 'web';

  const challengeList = (
    <>
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
        <SuccessNotice>{t('Challenge sent to {name}.', { name: sentTo })}</SuccessNotice>
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
    </>
  );

  const gamesAndChallenges = (
    <>
      {games.error !== null && (
        <ErrorState error={games.error} onRetry={() => void games.refetch()} />
      )}
      {games.data?.map((game) => (
        <LiveGame key={game.id} game={game} myId={me.id} />
      ))}
      {challengeList}
    </>
  );
  // One main action: a game on, or a challenge to answer, comes first when there is one.
  const playVariant = live || incoming.length > 0 ? 'secondary' : 'primary';

  if (app) {
    const quiet = !live && incoming.length === 0 && outgoing.length === 0 && outcomes.length === 0;
    return (
      <Screen title={t('Play')} align={quiet ? 'center' : 'top'} refreshable>
        {gamesAndChallenges}
        <View style={styles.main}>
          <Button
            title={t('Play now')}
            icon="play"
            large
            variant={playVariant}
            onPress={() => router.push('/ways-to-play')}
          />
          <Button
            title={t('Settings')}
            icon="settings"
            large
            variant="secondary"
            onPress={() => router.push('/settings')}
          />
        </View>
        <GuestBanner />
      </Screen>
    );
  }

  // The web: a hero with the main action (a game on is resumed from it), the ways to play as
  // tiles, then the day's puzzle and my results beside the people to play.
  return (
    <Screen align="top" wide refreshable>
      <Hero
        live={games.data?.[0]}
        myId={me.id}
        guest={me.role === 'guest'}
        username={me.username}
        wide={wide}
        quiet={incoming.length > 0}
      />
      {games.error !== null && (
        <ErrorState error={games.error} onRetry={() => void games.refetch()} />
      )}
      {challengeList}
      <FriendRequests />
      <SectionTitle>{t('Ways to play')}</SectionTitle>
      <View style={styles.tiles}>
        <PlayModes tiles />
      </View>
      <View style={wide ? styles.row : styles.column}>
        <View style={[styles.column, wide && styles.main2]}>
          <DailyPuzzle />
          <GameHistory username={me.username} preview />
          <GuestBanner />
        </View>
        <View style={[styles.column, wide && styles.side]}>
          <FriendList myId={me.id} />
          <PlayerSearch nobodyElse={<Hint>{t('Nobody else is online now.')}</Hint>} />
        </View>
      </View>
    </Screen>
  );
}

/**
 * The top of the web's home, on the brand's colour: a greeting with my ratings, the one main
 * action (my game on, or Play now) and, on a wide screen, the board playing by itself.
 */
function Hero({
  live,
  myId,
  guest,
  username,
  wide,
  quiet,
}: {
  live: Game | undefined;
  myId: string;
  guest: boolean;
  username: string;
  wide: boolean;
  /** A challenge waits for an answer: it is the main action, not Play now. */
  quiet: boolean;
}) {
  const profile = useProfile(username, !guest);
  const ratings = CATEGORIES.flatMap(({ value, label }) => {
    const rating = profile.data?.ratings[value];
    return rating !== undefined && rating.games > 0
      ? [{ value, label: t(label), rating: rating.rating }]
      : [];
  });
  const opponent = live === undefined ? null : live.goat.id === myId ? live.tiger : live.goat;
  return (
    <View style={[styles.hero, wide && styles.heroWide]}>
      <View style={[styles.pitch, wide && styles.pitchWide]}>
        <Text role="heading" style={[styles.greeting, joinedLetters()]}>
          {guest ? t('Ready to play?') : t('Welcome back, {name}', { name: username })}
        </Text>
        {ratings.length > 0 && (
          <View style={styles.ratings}>
            {ratings.map((r) => (
              <View key={r.value} style={styles.rating}>
                <Text style={styles.ratingLabel}>{r.label}</Text>
                <Text style={styles.ratingValue}>{r.rating}</Text>
              </View>
            ))}
          </View>
        )}
        {opponent !== null && live !== undefined ? (
          <>
            <Text style={styles.lede}>
              {t('Your game against {name}', { name: opponent.username })}
            </Text>
            <Button
              title={t('Resume')}
              icon="play"
              variant="bright"
              large
              onPress={() => router.push(`/game/${live.id}`)}
            />
          </>
        ) : (
          <>
            <Text style={styles.lede}>{t('Tigers hunt. Goats trap. Your move.')}</Text>
            <Button
              title={t('Play now')}
              icon="play"
              variant={quiet ? 'light' : 'bright'}
              large
              onPress={() => router.push('/play')}
            />
          </>
        )}
      </View>
      {wide && (
        <View style={styles.heroBoard}>
          <DemoBoard />
        </View>
      )}
    </View>
  );
}

function LiveGame({ game, myId }: { game: Game; myId: string }) {
  const opponent = game.goat.id === myId ? game.tiger : game.goat;
  return (
    <Card tone="accent">
      <Text style={styles.cardTitle}>
        {t('Your game against {name}', { name: opponent.username })}
      </Text>
      <Button title={t('Resume')} onPress={() => router.push(`/game/${game.id}`)} />
    </Card>
  );
}

const styles = StyleSheet.create({
  cardTitle: { ...type.heading, color: colors.text },
  row: { flexDirection: 'row', gap: spacing.xl, alignItems: 'flex-start' },
  main2: { flex: 2 },
  side: { flex: 1 },
  column: { gap: spacing.md },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  hero: {
    backgroundColor: colors.brandInk,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.lg,
    overflow: 'hidden',
    ...shadow,
  },
  heroWide: { flexDirection: 'row', alignItems: 'center', padding: spacing.xl },
  pitch: { flex: 1, gap: spacing.md },
  // Beside the board the button keeps its own width; on a phone it spans the card.
  pitchWide: { alignItems: 'flex-start' },
  heroBoard: { flex: 1, alignItems: 'center', maxWidth: 380 },
  greeting: { ...type.display, color: colors.brandCream },
  lede: { ...type.body, color: colors.brandCream, opacity: 0.85 },
  ratings: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  rating: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brandDeep,
  },
  ratingLabel: { ...type.caption, color: colors.brandCream, opacity: 0.75 },
  ratingValue: { ...type.title, color: colors.brandLight },
  main: { gap: spacing.md, marginTop: spacing.md },
});
