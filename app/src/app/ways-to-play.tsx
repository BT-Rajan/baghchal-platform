import { router } from 'expo-router';

import { useMe } from '@/auth/session';
import { FeatureLink } from '@/components/FeatureLink';
import { Screen } from '@/components/Screen';
import { plural, t } from '@/i18n';
import { useFriends } from '@/lobby/hooks';

/**
 * The apps' play menu, from home's "Play now": every way to play, each a row to its own
 * screen. (The web's home shows them on the page.)
 */
export default function WaysToPlay() {
  const guest = useMe().role === 'guest';
  const requests = useFriends().data?.incoming.length ?? 0;
  return (
    <Screen title={t('Play now')} align="top">
      <FeatureLink
        icon="play"
        title={t('Quick game')}
        text={t('Whoever is waiting')}
        onPress={() => router.push('/play?vs=person')}
      />
      <FeatureLink
        icon="computer"
        title={t('Play the computer')}
        onPress={() => router.push('/play?vs=computer')}
      />
      {/* Challenges need an account. */}
      {!guest && (
        <FeatureLink
          icon="link"
          title={t('Challenge a friend')}
          text={t('By link')}
          onPress={() => router.push('/invite')}
        />
      )}
      <FeatureLink
        icon="people"
        title={t('Friends')}
        {...(requests > 0 && {
          text: plural(requests, '1 friend request', '{count} friend requests'),
        })}
        onPress={() => router.push('/friends')}
      />
      <FeatureLink
        icon="trophy"
        title={t('Tournaments')}
        onPress={() => router.push('/tournaments')}
      />
      <FeatureLink
        icon="puzzle"
        title={t('Daily puzzle')}
        onPress={() => router.push('/puzzle')}
      />
      <FeatureLink
        icon="puzzle"
        title={t('Trainer')}
        feature="trainer"
        onPress={() => router.push('/trainer')}
      />
    </Screen>
  );
}
