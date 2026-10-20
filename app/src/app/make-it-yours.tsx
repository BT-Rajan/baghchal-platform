import { router } from 'expo-router';

import { Button } from '@/components/Button';
import { Hint } from '@/components/Card';
import { Disclosure } from '@/components/Disclosure';
import { BoardAndPieces, LookNotices, useLookChoice } from '@/components/LookPicker';
import { PeopleOnly } from '@/components/PeopleOnly';
import { PlayerSearch } from '@/components/PlayerSearch';
import { Screen } from '@/components/Screen';
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
        Your account is ready. Two quick choices, both optional: you can change them any time.
      </Hint>
      {ready !== null ? (
        <>
          <LookNotices choice={ready} />
          <BoardAndPieces choice={ready} />
        </>
      ) : error !== null ? (
        <ErrorState error={error} onRetry={retry} />
      ) : (
        <Loading label="Loading the boards" />
      )}

      <PeopleOnly>
        <Disclosure title="Find friends">
          <Hint>
            Search for a friend by username and open their profile to add them, or send a friend a
            challenge by link if they are not on ClawPlay yet.
          </Hint>
          <Button
            title="Challenge a friend by link"
            variant="secondary"
            onPress={() => router.push('/invite')}
          />
          <PlayerSearch nobodyElse={<Hint>Nobody else is online right now.</Hint>} />
        </Disclosure>
      </PeopleOnly>

      <Button title="Start playing" onPress={play} />
    </Screen>
  );
}
