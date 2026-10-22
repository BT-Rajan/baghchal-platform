import { router } from 'expo-router';
import { useState } from 'react';

import type { Challenge, Side, TimeControl } from '@/api/endpoints';
import { useMe } from '@/auth/session';
import { mark, t } from '@/i18n';
import { TimeControlPicker } from './TimeControlPicker';

import { useAnswerChallenge, useCreateChallenge } from '@/lobby/hooks';

import { Button } from './Button';
import { Hint } from './Card';
import { ChallengeCard } from './ChallengeCard';
import { ErrorNotice } from './ErrorNotice';
import { Screen } from './Screen';
import { Segmented } from './Segmented';
import { useServerNow } from './useNow';

const MODES = [
  { value: 'casual', label: mark('Casual') },
  { value: 'rated', label: mark('Rated') },
] as const;
const SIDES: readonly { value: Side; label: string }[] = [
  { value: 'random', label: mark('Random') },
  { value: 'goat', label: mark('Goats') },
  { value: 'tiger', label: mark('Tigers') },
];

function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/**
 * Challenge a player by name, or (with no `opponent`) make a link to a casual game for whoever
 * it is sent to. A link is shown once made, to copy and send.
 */
export function ChallengeForm({ opponent }: { opponent?: string }) {
  const byLink = opponent === undefined;
  const [timeControl, setTimeControl] = useState<TimeControl>('5+3');
  // Casual by default, as everywhere (rated matches are limited to one a day per pair).
  const [mode, setMode] = useState<'rated' | 'casual'>('casual');
  const [side, setSide] = useState<Side>('random');
  const [made, setMade] = useState<Challenge | null>(null);
  const create = useCreateChallenge();
  const title = byLink
    ? t('Challenge a friend by link')
    : t('Challenge {name}', { name: opponent });

  if (made !== null) return <MadeLink title={title} challenge={made} />;

  const send = (rated: boolean) =>
    create.mutate(
      {
        ...(opponent !== undefined && { opponent }),
        time_control: timeControl,
        rated,
        ...(!rated && { side }),
      },
      {
        // A link is shown here, to send; a challenge by name is listed on Play, with a word
        // that it went.
        onSuccess: (challenge) =>
          byLink
            ? setMade(challenge)
            : router.navigate({ pathname: '/', params: { sent: challenge.id } }),
      },
    );

  return (
    <Screen title={title}>
      {byLink && (
        <Hint>
          {t(
            'A casual game: whoever opens the link first plays you, while you are online. Open for a day.',
          )}
        </Hint>
      )}
      <ErrorNotice
        error={create.error}
        onCasual={() => {
          setMode('casual');
          send(false);
        }}
      />
      <TimeControlPicker value={timeControl} onChange={setTimeControl} />
      {!byLink && (
        <Segmented
          label={t('Game')}
          options={MODES.map(({ value, label }) => ({ value, label: t(label) }))}
          value={mode}
          onChange={setMode}
        />
      )}
      {mode === 'rated' ? (
        <Hint>{t('Rated: two games, one on each side.')}</Hint>
      ) : (
        <Segmented
          label={t('You play')}
          options={SIDES.map(({ value, label }) => ({ value, label: t(label) }))}
          value={side}
          onChange={setSide}
        />
      )}
      <Button
        title={byLink ? t('Make a link') : t('Send challenge')}
        onPress={() => send(mode === 'rated')}
        busy={create.isPending}
      />
      <Button title={t('Cancel')} variant="secondary" onPress={leave} />
    </Screen>
  );
}

function MadeLink({ title, challenge }: { title: string; challenge: Challenge }) {
  const me = useMe();
  const now = useServerNow();
  const answer = useAnswerChallenge();
  return (
    <Screen title={title}>
      <Hint>
        {t('Send it to a friend. The game starts when they open it while you are online.')}
      </Hint>
      <ErrorNotice error={answer.error} />
      <ChallengeCard
        challenge={challenge}
        myId={me.id}
        now={now}
        pending={answer.isPending ? answer.variables.answer : null}
        onAnswer={(a) => answer.mutate({ id: challenge.id, answer: a }, { onSuccess: leave })}
        main
      />
      <Button title={t('Done')} variant="secondary" onPress={leave} />
    </Screen>
  );
}
