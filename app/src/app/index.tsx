import { useMutation } from '@tanstack/react-query';
import { Text } from 'react-native';

import { useSession } from '@/auth/session';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { colors } from '@/theme';

/** Signed-in home. The lobby, leaderboard and profile tabs replace it in a later step. */
export default function Home() {
  const { state, session } = useSession();
  const signOut = useMutation({ mutationFn: () => session.signOut() });
  const username = state.status === 'signedIn' ? state.user.username : '';
  return (
    <Screen title="Bagh Chal">
      <Text style={{ fontSize: 16, color: colors.text }}>{`Signed in as ${username}.`}</Text>
      <Button
        title="Sign out"
        variant="secondary"
        onPress={() => signOut.mutate()}
        busy={signOut.isPending}
      />
    </Screen>
  );
}
