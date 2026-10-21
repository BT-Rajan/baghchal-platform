import { useMutation, useQuery } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Level, Side, TimeControl } from '@/api/endpoints';
import { describeError } from '@/api/errors';
import { has } from '@/billing/format';
import { useMyPlan } from '@/billing/hooks';
import { queryKeys } from '@/api/queryKeys';
import { useApi } from '@/auth/session';
import { mark, t } from '@/i18n';
import { Button } from '@/components/Button';
import { Card, Hint, SectionTitle } from '@/components/Card';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { Segmented } from '@/components/Segmented';
import { Upsell } from '@/components/Upsell';
import { useServerNow } from '@/components/useNow';
import { TimeControlPicker } from '@/components/TimeControlPicker';
import { LEVELS, secondsLeft, timeControlName, waitingText } from '@/lobby/format';
import { PRESENCE_REFRESH_MS, useOpenStartedGame } from '@/lobby/hooks';
import { colors, spacing } from '@/theme';

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
 * Start a game now: with whoever wants the same game, or against the computer. (The other ways
 * to play are on the home screen.)
 */
export default function PlayNow() {
  const [timeControl, setTimeControl] = useState<TimeControl>('5+3');
  return (
    <Screen align="top">
      <TimeControlPicker value={timeControl} onChange={setTimeControl} />
      <FindOpponent timeControl={timeControl} />
      <PlayComputer timeControl={timeControl} />
    </Screen>
  );
}

function FindOpponent({ timeControl }: { timeControl: TimeControl }) {
  const api = useApi();
  const now = useServerNow();
  const openStarted = useOpenStartedGame();
  const [mode, setMode] = useState<'casual' | 'rated'>('casual');
  const [waitingUntil, setWaitingUntil] = useState<string | null>(null);
  // What the search is for: the pickers may change while it runs.
  const [sought, setSought] = useState({ time: '', rated: false });
  const counts = useQuery({
    queryKey: queryKeys.seekCounts,
    queryFn: ({ signal }) => api.seekCounts(signal),
    refetchInterval: PRESENCE_REFRESH_MS,
  });
  const seek = useMutation({
    mutationFn: () => api.seek(timeControl, mode === 'rated'),
    onSuccess: (result) => {
      if (result.game) openStarted(result.game);
      else {
        setSought({ time: timeControlName(timeControl), rated: mode === 'rated' });
        setWaitingUntil(result.expires_at);
      }
    },
  });
  const stop = useMutation({
    mutationFn: () => api.stopSeeking(),
    onSettled: () => setWaitingUntil(null),
  });

  // Leaving the screen stops the search; a pairing opens the game, which also leaves it, and
  // coming back shows no search for a seek the server has already used.
  const waitingRef = useRef(false);
  useEffect(() => {
    waitingRef.current = waitingUntil !== null;
  }, [waitingUntil]);
  useFocusEffect(
    useCallback(
      () => () => {
        if (!waitingRef.current) return;
        void api.stopSeeking().catch(() => {});
        setWaitingUntil(null);
      },
      [api],
    ),
  );

  const left = waitingUntil === null ? 0 : secondsLeft(waitingUntil, now);
  const waiting = left > 0;
  const lapsed = waitingUntil !== null && !waiting;
  const others =
    counts.data?.find((c) => c.time_control === timeControl && c.rated === (mode === 'rated'))
      ?.players ?? 0;

  return (
    <>
      <SectionTitle>{t('Play someone')}</SectionTitle>
      <Card>
        <Segmented label={t('Game')} options={translated(MODES)} value={mode} onChange={setMode} />
        {mode === 'rated' && (
          <Hint>{t('A rated match is two games: you each play goats once and tigers once.')}</Hint>
        )}
        {seek.error !== null && <Notice tone="error">{describeError(seek.error)}</Notice>}
        {waiting ? (
          <>
            <Notice tone="info">
              {sought.rated
                ? t('Looking for an opponent for {time} rated… {seconds} s', {
                    time: sought.time,
                    seconds: left,
                  })
                : t('Looking for an opponent for {time} casual… {seconds} s', {
                    time: sought.time,
                    seconds: left,
                  })}
            </Notice>
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
                {t('Nobody came along yet. Try again, or play the computer.')}
              </Notice>
            )}
            <Text style={styles.muted}>{waitingText(others)}</Text>
            <Button
              title={t('Find an opponent')}
              onPress={() => {
                seek.reset();
                seek.mutate();
              }}
              busy={seek.isPending}
            />
          </>
        )}
      </Card>
    </>
  );
}

function PlayComputer({ timeControl }: { timeControl: TimeControl }) {
  const api = useApi();
  const openStarted = useOpenStartedGame();
  const [level, setLevel] = useState<Level>('medium');
  const [side, setSide] = useState<Side>('random');
  const mine = useMyPlan();
  const locked = level === 'hard' && !has(mine.data, 'computer_hard');
  const start = useMutation({
    mutationFn: () => api.playComputer({ level, side, time_control: timeControl }),
    onSuccess: openStarted,
  });
  return (
    <>
      <SectionTitle>{t('Play the computer')}</SectionTitle>
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
        <Hint>
          {t(
            'Casual: games against the computer never change your rating. Easy gives you tips as you play.',
          )}
        </Hint>
        {start.error !== null && <Notice tone="error">{describeError(start.error)}</Notice>}
        {locked && (
          <Upsell feature="computer_hard">
            {t('Play the Hard computer, the strongest opponent.')}
          </Upsell>
        )}
        <Button
          title={t('Play the computer')}
          onPress={() => start.mutate()}
          busy={start.isPending}
          disabled={locked}
        />
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  muted: { fontSize: 14, color: colors.muted },
  fields: { gap: spacing.sm },
});
