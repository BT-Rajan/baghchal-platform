import { router } from 'expo-router';
import { useState } from 'react';

import type { Challenge, Side, TimeControl } from '@/api/endpoints';
import { describeError } from '@/api/errors';
import { useMe } from '@/auth/session';
import { mark, t } from '@/i18n';
import { TimeControlPicker } from './TimeControlPicker';

import { useAnswerChallenge, useCreateChallenge } from '@/lobby/hooks';

import { Button } from './Button';
import { Hint } from './Card';
import { ChallengeCard } from './ChallengeCard';
import { Notice } from './Notice';
import { Screen } from './Screen';
import { Segmented } from './Segmented';
import { useServerNow } from './useNow';

const MODES = [
  { value: 'rated', label: mark('Rated') },
  { value: 'casual', label: mark('Casual') },
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
  const [mode, setMode] = useState<'rated' | 'casual'>(byLink ? 'casual' : 'rated');
  const [side, setSide] = useState<Side>('random');
  const [made, setMade] = useState<Challenge | null>(null);
  const create = useCreateChallenge();
  const title = byLink
    ? t('Challenge a friend by link')
    : t('Challenge {name}', { name: opponent });

  if (made !== null) return <MadeLink title={title} challenge={made} />;

  const send = () =>
    create.mutate(
      {
        ...(opponent !== undefined && { opponent }),
        time_control: timeControl,
        rated: mode === 'rated',
        ...(mode === 'casual' && { side }),
      },
      { onSuccess: (challenge) => (byLink ? setMade(challenge) : leave()) },
    );

  return (
    <Screen title={title}>
      {byLink && (
        <Hint>
          {t(
            'Make a link to a casual game and send it to a friend. Whoever opens it first plays you, as long as you are online. The link is open for a day.',
          )}
        </Hint>
      )}
      {create.error !== null && <Notice tone="error">{describeError(create.error)}</Notice>}
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
        <Hint>{t('A rated match is two games: you each play goats once and tigers once.')}</Hint>
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
        onPress={send}
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
        {t(
          'Send this link to a friend. The game starts when they open it while you are online; it is also under Your challenges in the lobby.',
        )}
      </Hint>
      {answer.error !== null && <Notice tone="error">{describeError(answer.error)}</Notice>}
      <ChallengeCard
        challenge={challenge}
        myId={me.id}
        now={now}
        pending={answer.isPending ? answer.variables.answer : null}
        onAnswer={(a) => answer.mutate({ id: challenge.id, answer: a }, { onSuccess: leave })}
      />
      <Button title={t('Done')} variant="secondary" onPress={leave} />
    </Screen>
  );
}
