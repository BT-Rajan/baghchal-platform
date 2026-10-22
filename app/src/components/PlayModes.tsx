import { router } from 'expo-router';

import { useMe } from '@/auth/session';
import { plural, t } from '@/i18n';
import { useFriends } from '@/lobby/hooks';

import { FeatureLink } from './FeatureLink';

/**
 * Every way to play, one list: rows in the apps' play menu (app/ways-to-play.tsx), tiles on the
 * web's home, which shows friends and today's puzzle on the page itself.
 */
export function PlayModes({ tiles = false }: { tiles?: boolean }) {
  const guest = useMe().role === 'guest';
  const requests = useFriends().data?.incoming.length ?? 0;
  return (
    <>
      <FeatureLink
        tile={tiles}
        icon="play"
        title={t('Quick game')}
        text={t('Whoever is waiting')}
        onPress={() => router.push('/play?vs=person')}
      />
      <FeatureLink
        tile={tiles}
        icon="computer"
        title={t('Play the computer')}
        text={t('Easy, medium or hard')}
        onPress={() => router.push('/play?vs=computer')}
      />
      {/* Challenges need an account. */}
      {!guest && (
        <FeatureLink
          tile={tiles}
          icon="link"
          title={t('Challenge a friend')}
          text={t('By link')}
          onPress={() => router.push('/invite')}
        />
      )}
      {!tiles && (
        <FeatureLink
          icon="people"
          title={t('Friends')}
          {...(requests > 0 && {
            text: plural(requests, '1 friend request', '{count} friend requests'),
          })}
          onPress={() => router.push('/friends')}
        />
      )}
      <FeatureLink
        tile={tiles}
        icon="trophy"
        title={t('Tournaments')}
        text={t('Join or host one')}
        onPress={() => router.push('/tournaments')}
      />
      {!tiles && (
        <FeatureLink
          icon="puzzle"
          title={t('Daily puzzle')}
          onPress={() => router.push('/puzzle')}
        />
      )}
      <FeatureLink
        tile={tiles}
        icon="puzzle"
        title={t('Trainer')}
        text={t('Openings and endgames')}
        feature="trainer"
        onPress={() => router.push('/trainer')}
      />
    </>
  );
}
