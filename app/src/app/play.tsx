import { useMutation, useQuery } from '@tanstack/react-query';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, StyleSheet, Text, View } from 'react-native';

import type { Level, Side, TimeControl } from '@/api/endpoints';
import { has } from '@/billing/format';
import { useMyPlan } from '@/billing/hooks';
import { queryKeys } from '@/api/queryKeys';
import { useApi, useMe } from '@/auth/session';
import { mark, t } from '@/i18n';
import { Button } from '@/components/Button';
import { Card, Hint, SectionTitle } from '@/components/Card';
import { ErrorNotice } from '@/components/ErrorNotice';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { Segmented } from '@/components/Segmented';
import { Upsell } from '@/components/Upsell';
import { useServerNow } from '@/components/useNow';
import { TimeControlPicker } from '@/components/TimeControlPicker';
import { LEVELS, secondsLeft, timeControlName, waitingText } from '@/lobby/format';
import { PRESENCE_REFRESH_MS, useOpenStartedGame, usePlayComputer } from '@/lobby/hooks';
import { colors, spacing, type } from '@/theme';

const MODES = [
  { value: 'casual', label: mark('Casual') },
  { value: 'rated', label: mark('Rated') },
] as const;
const SIDES: readonly { value: Side; label: string }[] = [
  { value: 'random', label: mark('Random') },
  { value: 'goat', label: mark('Goats') },
  { value: 'tiger', label: mark('Tigers') },
];

/** Choices with their labels in the current language. */
function translated<T extends string>(options: readonly { value: T; label: string }[]) {
  return options.map(({ value, label }) => ({ value, label: t(label) }));
}

/**
 * Start a game now: with whoever wants the same game, or against the computer; `vs` (from the
 * apps' play menu, app/ways-to-play.tsx) shows just one of them. (The other ways to play are
 * in that menu, and on the web's home screen.)
 */
export default function PlayNow() {
  const [timeControl, setTimeControl] = useState<TimeControl>('5+3');
  const vs = useLocalSearchParams<{ vs?: string }>().vs;
  const only = vs === 'person' || vs === 'computer' ? vs : null;
  const title =
    only === 'person' ? t('Quick game') : only === 'computer' ? t('Play the computer') : undefined;
  return (
    <Screen title={title} align="top">
      <TimeControlPicker value={timeControl} onChange={setTimeControl} />
      {only !== 'computer' && <FindOpponent timeControl={timeControl} alone={only !== null} />}
      {only !== 'person' && <PlayComputer timeControl={timeControl} alone={only !== null} />}
    </Screen>
  );
}

/** `alone`: the only part on the screen, which is named after it. */
function FindOpponent({ timeControl, alone }: { timeControl: TimeControl; alone: boolean }) {
  const api = useApi();
  const now = useServerNow();
  const openStarted = useOpenStartedGame();
  // Casual unless asked for rated (the leaderboard's "Play a rated game"); guests play casual.
  const guest = useMe().role === 'guest';
  const asked = useLocalSearchParams<{ mode?: string }>().mode;
  const [mode, setMode] = useState<'casual' | 'rated'>(
    asked === 'rated' && !guest ? 'rated' : 'casual',
  );
  const [waitingUntil, setWaitingUntil] = useState<string | null>(null);
  // What the search is for: the pickers may change while it runs.
  const [sought, setSought] = useState({ time: '', rated: false });
  const counts = useQuery({
    queryKey: queryKeys.seekCounts,
    queryFn: ({ signal }) => api.seekCounts(signal),
    refetchInterval: PRESENCE_REFRESH_MS,
  });
  const seek = useMutation({
    mutationFn: (rated: boolean) => api.seek(timeControl, rated),
    onSuccess: (result, rated) => {
      if (result.game) openStarted(result.game);
      else {
        setSought({ time: timeControlName(timeControl), rated });
        setWaitingUntil(result.expires_at);
      }
    },
  });
  const stop = useMutation({
    mutationFn: () => api.stopSeeking(),
    // Still looking unless the server says the search stopped.
    onSuccess: () => setWaitingUntil(null),
  });
  const look = (rated: boolean) => {
    seek.reset();
    stop.reset();
    seek.mutate(rated);
  };

  // Leaving the screen stops the search; a pairing opens the game, which also leaves it, and
  // coming back shows no search for a seek the server has already used.
  const waitingRef = useRef(false);
  useEffect(() => {
    waitingRef.current = waitingUntil !== null;
  }, [waitingUntil]);
  const stopNow = useCallback(() => {
    if (!waitingRef.current) return;
    void api.stopSeeking().catch(() => {});
    setWaitingUntil(null);
  }, [api]);
  useFocusEffect(useCallback(() => stopNow, [stopNow]));
  // Only while this screen is in front: hiding the page or the app stops the search too.
  useEffect(() => {
    const app = AppState.addEventListener('change', (next) => {
      if (next !== 'active') stopNow();
    });
    const page = () => {
      if (document.visibilityState === 'hidden') stopNow();
    };
    const web = Platform.OS === 'web' && typeof document !== 'undefined';
    if (web) document.addEventListener('visibilitychange', page);
    return () => {
      app.remove();
      if (web) document.removeEventListener('visibilitychange', page);
    };
  }, [stopNow]);

  const left = waitingUntil === null ? 0 : secondsLeft(waitingUntil, now);
  const waiting = left > 0;
  const lapsed = waitingUntil !== null && !waiting;
  // Who is waiting, once known: nothing is said when the counts could not be fetched.
  const others =
    counts.data?.find((c) => c.time_control === timeControl && c.rated === (mode === 'rated'))
      ?.players ?? 0;
  const known = !counts.isError && counts.data !== undefined;

  return (
    <>
      {!alone && <SectionTitle>{t('Play someone')}</SectionTitle>}
      <Card>
        {!guest && (
          <Segmented
            label={t('Game')}
            options={translated(MODES)}
            value={mode}
            onChange={setMode}
          />
        )}
        {mode === 'rated' && (
          <Hint>{t('Rated: two games, one on each side.')}</Hint>
        )}
        <ErrorNotice
          error={seek.error}
          onCasual={() => {
            setMode('casual');
            look(false);
          }}
        />
        {waiting ? (
          <>
            {/* Announced once; the countdown beside it is not read out every second. */}
            <Notice tone="info">
              {sought.rated
                ? t('Looking for an opponent for {time} rated…', { time: sought.time })
                : t('Looking for an opponent for {time} casual…', { time: sought.time })}
            </Notice>
            <Text style={styles.muted}>{t('{seconds} s left', { seconds: left })}</Text>
            <ErrorNotice error={stop.error} />
            <Button
              title={t('Stop looking')}
              variant="secondary"
              onPress={() => stop.mutate()}
              busy={stop.isPending}
            />
          </>
        ) : (
          <>
            {lapsed && (
              <Notice tone="info">
                {t('Nobody yet. Try again, or play the computer.')}
              </Notice>
            )}
            {known && <Text style={styles.muted}>{waitingText(others)}</Text>}
            <Button
              title={lapsed ? t('Keep looking') : t('Find an opponent')}
              onPress={() => look(mode === 'rated')}
              busy={seek.isPending}
            />
            <Hint>{t('We look while this screen is open.')}</Hint>
          </>
        )}
      </Card>
    </>
  );
}

function PlayComputer({ timeControl, alone }: { timeControl: TimeControl; alone: boolean }) {
  const [level, setLevel] = useState<Level>('medium');
  const [side, setSide] = useState<Side>('random');
  const mine = useMyPlan();
  const locked = level === 'hard' && !has(mine.data, 'computer_hard');
  const start = usePlayComputer();
  return (
    <>
      {!alone && <SectionTitle>{t('Play the computer')}</SectionTitle>}
      <Card>
        <View style={styles.fields}>
          <Segmented
            label={t('Strength')}
            options={translated(LEVELS)}
            value={level}
            onChange={setLevel}
          />
          <Segmented
            label={t('You play')}
            options={translated(SIDES)}
            value={side}
            onChange={setSide}
          />
        </View>
        <Hint>{t('Never rated. Easy gives you tips.')}</Hint>
        <ErrorNotice error={start.error} />
        {locked && (
          <Upsell feature="computer_hard">
            {t('Play the Hard computer.')}
          </Upsell>
        )}
        {/* Secondary beside finding a person, the screen's main action. */}
        <Button
          title={t('Play the computer')}
          variant={alone ? 'primary' : 'secondary'}
          onPress={() => start.mutate({ level, side, time_control: timeControl })}
          busy={start.isPending}
          disabled={locked}
        />
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  muted: { ...type.small, color: colors.muted },
  fields: { gap: spacing.sm },
});
