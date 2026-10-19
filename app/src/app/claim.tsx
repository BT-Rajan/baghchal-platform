import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';

import { useApi, useSession } from '@/auth/session';
import { AccountForm, type AccountDetails } from '@/components/AccountForm';
import { Button } from '@/components/Button';
import { Hint } from '@/components/Card';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';

/** A guest makes a real account, keeping their games. */
export default function Claim() {
  const api = useApi();
  const { session } = useSession();
  const claim = useMutation({
    mutationFn: async (details: AccountDetails) => {
      await api.claimAccount(details);
      await session.refresh();
    },
  });

  if (claim.isSuccess) {
    return (
      <Screen title={`Welcome, ${claim.variables.username}!`}>
        <Notice tone="success">
          {`Your account is ready and your games are kept. We sent a link to ${claim.variables.email}: open it to confirm your email address.`}
        </Notice>
        <Button title="Back to playing" onPress={() => router.navigate('/')} />
      </Screen>
    );
  }

  return (
    <Screen title="Make your free account">
      <Hint>
        Keep your games, play rated games and climb the leaderboard, challenge friends, and sign in
        on any device.
      </Hint>
      <AccountForm action={claim} submitTitle="Make my account" />
    </Screen>
  );
}
