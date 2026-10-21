import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import type { PaymentKeys } from '@/api/endpoints';
import { ApiError, describeError } from '@/api/errors';
import { Button } from '@/components/Button';
import { Card, Hint, SectionTitle } from '@/components/Card';
import { Confirm } from '@/components/Confirm';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { ErrorState, Loading } from '@/components/States';
import { TextField } from '@/components/TextField';
import { t } from '@/i18n';
import { keysProblem, keysText } from '@/payments/format';
import { useAdminCode, useChangePaymentKeys, usePaymentKeys } from '@/payments/hooks';
import { colors, type } from '@/theme';

/** For admins: the Razorpay keys payments are taken with, behind a code sent by email. */
export default function PaymentsAdmin() {
  const keys = usePaymentKeys();
  return (
    <Screen align="top">
      {keys.error instanceof ApiError && keys.error.code === 'admin_code_needed' ? (
        <CodeStep />
      ) : keys.error !== null ? (
        <ErrorState error={keys.error} onRetry={() => void keys.refetch()} />
      ) : keys.data === undefined ? (
        <Loading label={t('Loading the payment keys')} />
      ) : (
        <KeysForm page={keys.data} />
      )}
    </Screen>
  );
}

function CodeStep() {
  const { send, check } = useAdminCode();
  const [code, setCode] = useState('');
  const error = check.error ?? send.error;
  return (
    <>
      <Hint>
        {t(
          'The payment keys need a second step: we email you a 6-digit code. It opens this page on this device for 15 minutes.',
        )}
      </Hint>
      {send.isSuccess && <Notice tone="success">{t('We have emailed you a code.')}</Notice>}
      {error !== null && <Notice tone="error">{describeError(error)}</Notice>}
      {send.isSuccess && (
        <TextField
          label={t('Code')}
          value={code}
          onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          maxLength={6}
        />
      )}
      {send.isSuccess ? (
        <>
          <Button
            title={t('Open the payment keys')}
            busy={check.isPending}
            disabled={code.length !== 6}
            onPress={() => check.mutate(code)}
          />
          <Button
            title={t('Send another code')}
            variant="secondary"
            busy={send.isPending}
            onPress={() => send.mutate()}
          />
        </>
      ) : (
        <Button title={t('Email me a code')} busy={send.isPending} onPress={() => send.mutate()} />
      )}
    </>
  );
}

function KeysForm({ page }: { page: PaymentKeys }) {
  const change = useChangePaymentKeys();
  const [keyId, setKeyId] = useState('');
  const [keySecret, setKeySecret] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const save = () => {
    change.reset();
    const found = keysProblem(keyId, keySecret, webhookSecret);
    setProblem(found);
    if (found !== null) return;
    change.mutate(
      { key_id: keyId.trim(), key_secret: keySecret, webhook_secret: webhookSecret },
      {
        onSuccess: () => {
          setKeySecret('');
          setWebhookSecret('');
        },
      },
    );
  };
  return (
    <>
      <Notice tone={page.on ? 'success' : 'info'}>{keysText(page)}</Notice>
      {!page.can_store && (
        <Notice tone="error">
          {t('Set BAGHCHAL_SECRETS_KEY on the server and restart it first: it encrypts the keys.')}
        </Notice>
      )}
      {problem !== null && <Notice tone="error">{problem}</Notice>}
      {change.error !== null && <Notice tone="error">{describeError(change.error)}</Notice>}
      <SectionTitle>{page.on ? t('Change the keys') : t('Enter the keys')}</SectionTitle>
      <Hint>
        {t(
          'From the Razorpay Dashboard: Account & Settings → API Keys. Use the test keys (rzp_test_…) first. Every admin is emailed when the keys change.',
        )}
      </Hint>
      <TextField
        label={t('Key id')}
        value={keyId}
        onChangeText={setKeyId}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="rzp_live_…"
      />
      <TextField
        label={t('Key secret')}
        value={keySecret}
        onChangeText={setKeySecret}
        secureTextEntry
      />
      <TextField
        label={t('Webhook secret')}
        value={webhookSecret}
        onChangeText={setWebhookSecret}
        secureTextEntry
      />
      <Card>
        <Text style={styles.label}>{t('The webhook')}</Text>
        <Text style={styles.text} selectable>
          {page.webhook_url}
        </Text>
        <Hint>
          {t(
            'In Account & Settings → Webhooks, send the events payment.captured, order.paid, payment.authorized, payment.failed, refund.processed and payment.dispute.lost to this address, with the webhook secret above.',
          )}
        </Hint>
      </Card>
      <Button
        title={t('Save the keys')}
        busy={change.isPending}
        disabled={!page.can_store}
        onPress={save}
      />
      {page.on &&
        (confirming ? (
          <Confirm
            question={t(
              'Turn payments off? Players cannot buy plans until keys are entered again.',
            )}
            confirmTitle={t('Turn payments off')}
            busy={change.isPending}
            onConfirm={() => change.mutate(null, { onSettled: () => setConfirming(false) })}
            onCancel={() => setConfirming(false)}
          />
        ) : (
          <Button
            title={t('Turn payments off')}
            variant="secondary"
            onPress={() => setConfirming(true)}
          />
        ))}
    </>
  );
}

const styles = StyleSheet.create({
  label: { ...type.label, color: colors.muted },
  text: { ...type.body, color: colors.text },
});
