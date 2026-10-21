import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { useMe, useSession } from '@/auth/session';
import { t } from '@/i18n';

import { Button } from './Button';
import { Confirm } from './Confirm';

/**
 * The one way to sign out (Settings, and the screen asking to accept changed terms). A guest is
 * asked first, as signing out loses the guest account for good.
 */
export function SignOutButton() {
  const me = useMe();
  const { session } = useSession();
  const signOut = useMutation({ mutationFn: () => session.signOut() });
  const [leaving, setLeaving] = useState(false);
  const guest = me.role === 'guest';
  if (leaving) {
    return (
      <Confirm
        question={t(
          'Sign out and lose this guest account? Its games cannot be got back. Make an account first to keep them.',
        )}
        confirmTitle={t('Sign out')}
        busy={signOut.isPending}
        onConfirm={() => signOut.mutate()}
        onCancel={() => setLeaving(false)}
      />
    );
  }
  return (
    <Button
      title={t('Sign out')}
      variant="secondary"
      onPress={() => (guest ? setLeaving(true) : signOut.mutate())}
      busy={signOut.isPending}
    />
  );
}
