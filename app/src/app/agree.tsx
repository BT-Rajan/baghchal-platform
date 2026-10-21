import { useMutation } from '@tanstack/react-query';

import { describeError } from '@/api/errors';
import { useApi, useMe, useSession } from '@/auth/session';
import { AgreementFields, useAgreement } from '@/components/AgreementFields';
import { Button } from '@/components/Button';
import { Hint } from '@/components/Card';
import { useFormErrors } from '@/components/form';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { t } from '@/i18n';
import { AGREEMENT_CODE_FIELDS, AGREEMENT_FIELDS } from '@/legal/agreement';

/**
 * Shown in place of the app to an account that has something to agree to: the age, for an
 * account made before it was asked, or terms that changed since it agreed. Sent with
 * `POST /me/consents`; the server's answer (who I am now) lets the app back in.
 */
export default function Agree() {
  const api = useApi();
  const me = useMe();
  const { session } = useSession();
  const agreement = useAgreement({ guest: me.role === 'guest' });
  const send = useMutation({
    mutationFn: async (body: Parameters<typeof api.acceptConsents>[0]) => {
      await api.acceptConsents(body);
      await session.refresh();
    },
  });
  const { fieldError, formMessage, accept } = useFormErrors(
    AGREEMENT_FIELDS,
    send.error,
    AGREEMENT_CODE_FIELDS,
  );

  const submit = () => {
    send.reset();
    const versions = agreement.versions.data;
    if (!me.age_needed) {
      if (versions)
        send.mutate({ terms_version: versions.terms, privacy_version: versions.privacy });
      return;
    }
    const { problems, body } = agreement.check(me.email);
    if (accept(problems) && body) send.mutate(body);
  };

  return (
    <Screen title={t('Before you play on')} brand>
      <Hint>
        {me.age_needed
          ? t(
              'We now ask everyone for their month and year of birth, so players under 18 have a parent or guardian agree before they play other people.',
            )
          : t('We have updated our terms or privacy policy. Please read what changed.')}
      </Hint>
      {formMessage !== null && <Notice tone="error">{formMessage}</Notice>}
      {agreement.versions.isError && (
        <Notice tone="error">{describeError(agreement.versions.error)}</Notice>
      )}
      <AgreementFields agreement={agreement} fieldError={fieldError} askAge={me.age_needed} />
      <Button
        title={t('Continue')}
        onPress={submit}
        busy={send.isPending || agreement.versions.isPending}
      />
      <Button title={t('Sign out')} variant="secondary" onPress={() => void session.signOut()} />
    </Screen>
  );
}
