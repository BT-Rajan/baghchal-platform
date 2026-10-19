import { useSession, useMe } from '@/auth/session';
import { ProfileView } from '@/components/ProfileView';
import { Body, Button, ErrorText, Loading, Screen } from '@/components/ui';
import { useProfile } from '@/hooks/queries';

export default function MeScreen() {
  const me = useMe();
  const { signOut } = useSession();
  const profile = useProfile(me.username);
  return (
    <Screen>
      {profile.data ? (
        <ProfileView profile={profile.data} />
      ) : profile.isLoading ? (
        <Loading />
      ) : null}
      <ErrorText error={profile.error} />
      <Body muted>Signed in as {me.email}</Body>
      <Button label="Sign out" kind="danger" onPress={() => void signOut()} />
    </Screen>
  );
}
