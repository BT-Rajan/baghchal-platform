import { useMe } from '@/auth/session';
import { Hint } from '@/components/Card';
import { FriendList, FriendRequests } from '@/components/Friends';
import { PlayerSearch } from '@/components/PlayerSearch';
import { Screen } from '@/components/Screen';
import { t } from '@/i18n';

/**
 * In the apps (from the play menu): friend requests to answer, my friends, and players to find
 * or challenge. (The web's home shows them beside its games.)
 */
export default function FriendsScreen() {
  const me = useMe();
  return (
    <Screen title={t('Friends')} align="top" refreshable>
      <FriendRequests />
      <FriendList myId={me.id} />
      <PlayerSearch nobodyElse={<Hint>{t('Nobody else is online now.')}</Hint>} />
    </Screen>
  );
}
