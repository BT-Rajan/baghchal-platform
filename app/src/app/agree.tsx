import { useMutation } from '@tanstack/react-query';

import type { Agreement } from '@/api/endpoints';
import { describeError } from '@/api/errors';
import { useApi, useSession } from '@/auth/session';
import { AgreementLine, useAgreement } from '@/components/AgreementLine';
import { Button } from '@/components/Button';
import { Hint } from '@/components/Card';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { t } from '@/i18n';

/**
 * Shown in place of the app to an account whose terms or privacy policy changed since it agreed
 * (the server's `consents_needed`). Sent with `POST /me/consents`; the server's answer (who I am
 * now) lets the app back in.
 */
export default function Agree() {
  const api = useApi();
  const { session } = useSession();
  const agreement = useAgreement();
  const send = useMutation({
    mutationFn: async (body: Agreement) => {
      await api.acceptConsents(body);
      await session.refresh();
    },
  });

  const submit = () => {
    send.reset();
    if (agreement.body) send.mutate(agreement.body);
  };

  return (
    <Screen title={t('Before you play on')} brand>
      <Hint>{t('We have updated our terms or privacy policy. Please read what changed.')}</Hint>
      {send.error !== null && <Notice tone="error">{describeError(send.error)}</Notice>}
      <AgreementLine agreement={agreement} />
      <Button
        title={t('Accept')}
        onPress={submit}
        busy={send.isPending || agreement.versions.isPending}
      />
      <Button title={t('Sign out')} variant="secondary" onPress={() => void session.signOut()} />
    </Screen>
  );
}
