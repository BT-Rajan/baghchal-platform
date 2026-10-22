import { useMutation } from '@tanstack/react-query';

import { useApi } from '@/auth/session';
import { t } from '@/i18n';

import { Button } from './Button';
import { ErrorNotice } from './ErrorNotice';
import { Notice } from './Notice';

/**
 * Send the link that confirms an email address again, where an unconfirmed address matters
 * (the settings' email section). Confirming is optional: nothing waits for it.
 */
export function ResendConfirmation({ email }: { email: string }) {
  const api = useApi();
  const resend = useMutation({ mutationFn: () => api.resendVerification(email.trim()) });
  if (resend.isSuccess) {
    return (
      <Notice tone="success">{t('Link sent to {email}.', { email: email.trim() })}</Notice>
    );
  }
  return (
    <>
      <ErrorNotice error={resend.error} />
      <Button
        title={t('Send the link again')}
        variant="secondary"
        busy={resend.isPending}
        onPress={() => resend.mutate()}
      />
    </>
  );
}
