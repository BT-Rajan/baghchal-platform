import { useMutation } from '@tanstack/react-query';

import { describeError } from '@/api/errors';
import { useApi } from '@/auth/session';

import { Button } from './Button';
import { Notice } from './Notice';

/** For a sign-up whose confirmation email went missing: send the link again. */
export function ResendConfirmation({ email }: { email: string }) {
  const api = useApi();
  const resend = useMutation({ mutationFn: () => api.resendVerification(email.trim()) });
  if (resend.isSuccess) {
    return (
      <Notice tone="success">
        {`We sent a new link to ${email.trim()}. If it is not there in a few minutes, look in your spam folder.`}
      </Notice>
    );
  }
  return (
    <>
      {resend.isError && <Notice tone="error">{describeError(resend.error)}</Notice>}
      <Button
        title="Send the link again"
        variant="secondary"
        busy={resend.isPending}
        onPress={() => resend.mutate()}
      />
    </>
  );
}
