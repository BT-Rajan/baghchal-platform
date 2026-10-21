import { router } from 'expo-router';

import { Button } from '@/components/Button';
import { Hint } from '@/components/Card';
import { Disclosure } from '@/components/Disclosure';
import { BoardAndPieces, LookNotices, useLookChoice } from '@/components/LookPicker';
import { PlayerSearch } from '@/components/PlayerSearch';
import { Screen } from '@/components/Screen';
import { t } from '@/i18n';
import { ErrorState, Loading } from '@/components/States';

/**
 * A new account's first stop, all optional: choose a board and pieces, and find friends. The
 * same choices stay in Settings (Board, pieces and sounds) and on the home screen.
 */
export default function MakeItYours() {
  const { error, retry, ready } = useLookChoice();
  const play = () => router.replace('/');
  return (
    <Screen align="top" wide>
      <Hint>
        {t(
          'Your account is ready. A few quick choices, all optional: you can change them any time.',
        )}
      </Hint>
      <Button title={t('Skip, start playing')} variant="secondary" onPress={play} />
      {ready !== null ? (
        <>
          {/* No sales pitch on a new account's first stop: the locked choices say their plan. */}
          <LookNotices choice={ready} upsell={false} />
          <BoardAndPieces choice={ready} />
        </>
      ) : error !== null ? (
        <ErrorState error={error} onRetry={retry} />
      ) : (
        <Loading label={t('Loading the boards')} />
      )}

      <Disclosure title={t('Find friends')}>
        <Hint>
          {t(
            'Search for a friend by username and open their profile to add them, or send a friend a challenge by link if they are not on ClawPlay yet.',
          )}
        </Hint>
        <Button
          title={t('Challenge a friend by link')}
          variant="secondary"
          onPress={() => router.push('/invite')}
        />
        <PlayerSearch nobodyElse={<Hint>{t('Nobody else is online right now.')}</Hint>} />
      </Disclosure>

      <Button title={t('Start playing')} onPress={play} />
    </Screen>
  );
}
