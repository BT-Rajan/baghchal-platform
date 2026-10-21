import { router, useLocalSearchParams } from 'expo-router';

import { useMe } from '@/auth/session';
import { Button } from '@/components/Button';
import { Hint } from '@/components/Card';
import { ChallengeCard } from '@/components/ChallengeCard';
import { ErrorNotice } from '@/components/ErrorNotice';
import { Screen } from '@/components/Screen';
import { ErrorState, Loading } from '@/components/States';
import { useServerNow } from '@/components/useNow';
import { t } from '@/i18n';
import { isOpen } from '@/lobby/format';
import { useAcceptLink, useAnswerChallenge, useLinkChallenge } from '@/lobby/hooks';

/**
 * A challenge by link, opened from the link: accept and play, or (my own) share or cancel it.
 * Someone signed out is sent to make an account or play as a guest first, and comes back here
 * (see the route guards in _layout).
 */
export default function LinkChallenge() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const me = useMe();
  const now = useServerNow();
  const link = useLinkChallenge(code);
  const accept = useAcceptLink(code);
  const answer = useAnswerChallenge();
  const c = link.data;
  const mine = c !== undefined && c.challenger.id === me.id;
  const gameId = c?.game_id ?? null;
  // Only the two players can open the game.
  const myGame = mine || c?.opponent?.id === me.id ? gameId : null;
  return (
    <Screen align="top">
      {link.error !== null ? (
        <ErrorState error={link.error} onRetry={() => void link.refetch()} />
      ) : c === undefined ? (
        <Loading label={t('Loading the challenge')} />
      ) : !isOpen(c, now) ? (
        <Hint>
          {myGame !== null
            ? t('The challenge was accepted.')
            : t('This challenge is closed. Ask your friend for a new link.')}
        </Hint>
      ) : (
        <>
          <ErrorNotice error={mine ? answer.error : accept.error} />
          {/* The lobby's card: accept a friend's link here, or share or cancel my own. */}
          <ChallengeCard
            challenge={c}
            myId={me.id}
            now={now}
            pending={
              accept.isPending ? 'accept' : answer.isPending ? answer.variables.answer : null
            }
            onAnswer={(a) =>
              a === 'accept'
                ? accept.mutate()
                : answer.mutate({ id: c.id, answer: a }, { onSuccess: () => void link.refetch() })
            }
          />
        </>
      )}
      {myGame !== null && (
        <Button
          title={t('Go to the game')}
          variant="secondary"
          onPress={() => router.push(`/game/${myGame}`)}
        />
      )}
    </Screen>
  );
}
