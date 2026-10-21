import { useMutation } from '@tanstack/react-query';

import { useApi } from '@/auth/session';
import { t } from '@/i18n';

import { Button } from './Button';
import { ErrorNotice } from './ErrorNotice';
import { Notice } from './Notice';

/**
 * For a sign-up whose confirmation email went missing: send the link again. `main` where it is
 * the screen's next step (after signing up), secondary beside signing in.
 */
export function ResendConfirmation({ email, main = false }: { email: string; main?: boolean }) {
  const api = useApi();
  const resend = useMutation({ mutationFn: () => api.resendVerification(email.trim()) });
  if (resend.isSuccess) {
    return (
      <Notice tone="success">
        {t(
          'We sent a new link to {email}. If it is not there in a few minutes, look in your spam folder.',
          { email: email.trim() },
        )}
      </Notice>
    );
  }
  return (
    <>
      <ErrorNotice error={resend.error} />
      <Button
        title={t('Send the link again')}
        variant={main ? 'primary' : 'secondary'}
        busy={resend.isPending}
        onPress={() => resend.mutate()}
      />
    </>
  );
}
