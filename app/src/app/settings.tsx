import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { describeError } from '@/api/errors';
import { saveExport } from '@/auth/exportFile';
import { useApi, useMe, useSession } from '@/auth/session';
import { checkEmailChange, checkPasswordChange, checkPasswordGiven } from '@/auth/validation';
import { Button } from '@/components/Button';
import { Confirm } from '@/components/Confirm';
import { Card, Hint, SectionTitle } from '@/components/Card';
import { Disclosure } from '@/components/Disclosure';
import { FeatureLink } from '@/components/FeatureLink';
import { GuestBanner } from '@/components/GuestBanner';
import { LanguagePicker } from '@/components/LanguagePicker';
import { PlanCard } from '@/components/PlanCard';
import { ErrorState, Loading } from '@/components/States';
import { t } from '@/i18n';
import { useBlock, useBlocks } from '@/lobby/hooks';
import { useFormErrors } from '@/components/form';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { colors, spacing } from '@/theme';

/**
 * Settings, all in one place: the plan, the board and sounds, moderation and payments (for
 * staff); the account (blocked players, and for members the email address, password, their
 * data and deleting the account), each folded shut until opened; signing out.
 */
export default function SettingsScreen() {
  const me = useMe();
  const { session } = useSession();
  const signOut = useMutation({ mutationFn: () => session.signOut() });
  const [leaving, setLeaving] = useState(false);
  const guest = me.role === 'guest';
  const staff = me.role === 'moderator' || me.role === 'admin';
  return (
    <Screen align="top">
      <GuestBanner />
      <PlanCard />
      <SectionTitle>{t('Look, sound and language')}</SectionTitle>
      <FeatureLink
        icon="palette"
        title={t('Board, pieces and sounds')}
        text={t('How games look and sound, on every device you use.')}
        onPress={() => router.push('/appearance')}
      />
      <LanguagePicker />
      {staff && <SectionTitle>{t('Admin')}</SectionTitle>}
      {staff && (
        <FeatureLink
          icon="shield"
          title={t('Moderation')}
          text={t("Reports, and the players' records.")}
          onPress={() => router.push('/moderation')}
        />
      )}
      {me.role === 'admin' && (
        <FeatureLink
          icon="shield"
          title={t('Payments')}
          text={t('The Razorpay keys plans are paid with. Needs a code we email you.')}
          onPress={() => router.push('/admin/payments')}
        />
      )}
      <SectionTitle>{t('Account')}</SectionTitle>
      <View>
        <BlockedPlayers />
        {!guest && (
          <>
            <EmailSection />
            <PasswordSection />
            <DataSection />
            <DeleteSection />
          </>
        )}
      </View>
      <SectionTitle>{t('Terms and privacy')}</SectionTitle>
      <FeatureLink
        icon="document"
        title={t('Terms of service')}
        text={t('The rules of using ClawPlay.')}
        onPress={() => router.push('/terms')}
      />
      <FeatureLink
        icon="document"
        title={t('Privacy policy')}
        text={t('What we keep about you, why, and for how long.')}
        onPress={() => router.push('/privacy')}
      />
      <SectionTitle>{t('Sign out')}</SectionTitle>
      {leaving ? (
        <Confirm
          question={t(
            'Sign out and lose this guest account? Its games and rating cannot be got back. Make an account first to keep them.',
          )}
          confirmTitle={t('Sign out')}
          busy={signOut.isPending}
          onConfirm={() => signOut.mutate()}
          onCancel={() => setLeaving(false)}
        />
      ) : (
        <Button
          title={guest ? t('Sign out (this guest account will be lost)') : t('Sign out')}
          variant="secondary"
          onPress={() => (guest ? setLeaving(true) : signOut.mutate())}
          busy={signOut.isPending}
        />
      )}
    </Screen>
  );
}

function BlockedPlayers() {
  const blocks = useBlocks();
  const change = useBlock();
  return (
    <Disclosure title={t('Blocked players')}>
      {change.error !== null && <Notice tone="error">{describeError(change.error)}</Notice>}
      {blocks.error !== null ? (
        <ErrorState error={blocks.error} onRetry={() => void blocks.refetch()} />
      ) : blocks.data === undefined ? (
        <Loading label={t('Loading blocked players')} />
      ) : blocks.data.length === 0 ? (
        <Hint>{t('You have not blocked anyone.')}</Hint>
      ) : (
        <Card>
          {blocks.data.map((player) => (
            <View key={player.id} style={styles.row}>
              <Text style={styles.name}>{player.username}</Text>
              <Button
                title={t('Unblock {name}', { name: player.username })}
                label={t('Unblock')}
                variant="secondary"
                compact
                busy={change.isPending && change.variables.username === player.username}
                onPress={() => change.mutate({ username: player.username, block: false })}
              />
            </View>
          ))}
        </Card>
      )}
    </Disclosure>
  );
}

const EMAIL_FIELDS = ['email', 'password'] as const;
const EMAIL_CODES = { same_email: 'email', wrong_password: 'password' } as const;

function EmailSection() {
  const api = useApi();
  const me = useMe();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const change = useMutation({
    mutationFn: (to: string) => api.changeEmail(password, to),
    onSuccess: () => setPassword(''),
  });
  const { fieldError, formMessage, accept } = useFormErrors(
    EMAIL_FIELDS,
    change.error,
    EMAIL_CODES,
  );
  const submit = () => {
    change.reset();
    if (accept(checkEmailChange({ email, password }, me.email))) change.mutate(email.trim());
  };
  return (
    <Disclosure title={t('Email address')}>
      <Card>
        <Text style={styles.text}>{t('Your email address is {email}.', { email: me.email })}</Text>
        {change.isSuccess ? (
          <Notice tone="success">
            {t('We sent a link to {email}. Your address changes when you open it.', {
              email: change.variables,
            })}
          </Notice>
        ) : (
          <>
            {formMessage !== null && <Notice tone="error">{formMessage}</Notice>}
            <TextField
              label={t('New email address')}
              value={email}
              onChangeText={setEmail}
              error={fieldError('email')}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
            />
            <TextField
              label={t('Your password (to change the email address)')}
              value={password}
              onChangeText={setPassword}
              error={fieldError('password')}
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              onSubmitEditing={submit}
            />
            <Button
              title={t('Send a confirmation link')}
              onPress={submit}
              busy={change.isPending}
            />
          </>
        )}
      </Card>
    </Disclosure>
  );
}

const PASSWORD_FIELDS = ['current', 'password', 'confirm'] as const;
const PASSWORD_CODES = { wrong_password: 'current', weak_password: 'password' } as const;

function PasswordSection() {
  const api = useApi();
  const me = useMe();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const change = useMutation({
    mutationFn: () => api.changePassword(current, password),
    onSuccess: () => {
      setCurrent('');
      setPassword('');
      setConfirm('');
    },
  });
  const { fieldError, formMessage, accept } = useFormErrors(
    PASSWORD_FIELDS,
    change.error,
    PASSWORD_CODES,
  );
  const submit = () => {
    change.reset();
    if (accept(checkPasswordChange({ current, password, confirm }, me.username))) {
      change.mutate();
    }
  };
  return (
    <Disclosure title={t('Password')}>
      <Card>
        {change.isSuccess && (
          <Notice tone="success">
            {t('Your password has been changed. Your other devices have been signed out.')}
          </Notice>
        )}
        {formMessage !== null && <Notice tone="error">{formMessage}</Notice>}
        <TextField
          label={t('Current password')}
          value={current}
          onChangeText={setCurrent}
          error={fieldError('current')}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
        />
        <TextField
          label={t('New password')}
          value={password}
          onChangeText={setPassword}
          error={fieldError('password')}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
        />
        <TextField
          label={t('Repeat the new password')}
          value={confirm}
          onChangeText={setConfirm}
          error={fieldError('confirm')}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          onSubmitEditing={submit}
        />
        <Button title={t('Change password')} onPress={submit} busy={change.isPending} />
      </Card>
    </Disclosure>
  );
}

function DataSection() {
  const api = useApi();
  const download = useMutation({
    mutationFn: async () => saveExport(await api.exportData()),
  });
  return (
    <Disclosure title={t('Your data')}>
      <Card>
        <Hint>
          {t(
            'A copy of everything we keep about you: your account, ratings, games with their moves, challenges and blocked players.',
          )}
        </Hint>
        {download.error !== null && <Notice tone="error">{describeError(download.error)}</Notice>}
        <Button
          title={t('Download my data')}
          variant="secondary"
          onPress={() => download.mutate()}
          busy={download.isPending}
        />
      </Card>
    </Disclosure>
  );
}

const DELETE_FIELDS = ['password'] as const;
const DELETE_CODES = { wrong_password: 'password' } as const;

function DeleteSection() {
  const api = useApi();
  const { session } = useSession();
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const remove = useMutation({
    mutationFn: async () => {
      await api.deleteAccount(password);
      // The server has ended every session; the route guards then show the sign-in screen.
      await session.forget();
    },
  });
  const { fieldError, formMessage, accept } = useFormErrors(
    DELETE_FIELDS,
    remove.error,
    DELETE_CODES,
  );
  const submit = () => {
    remove.reset();
    if (accept(checkPasswordGiven({ password }))) remove.mutate();
  };
  return (
    <Disclosure title={t('Delete account')}>
      <Card>
        <Hint>
          {t(
            "Deleting your account removes your email address and password, takes you off the leaderboards and signs you out everywhere. Games you played stay in your opponents' history under an anonymous name. This cannot be undone.",
          )}
        </Hint>
        {confirming ? (
          <View style={styles.confirm}>
            {formMessage !== null && <Notice tone="error">{formMessage}</Notice>}
            <TextField
              label={t('Your password (to delete your account)')}
              value={password}
              onChangeText={setPassword}
              error={fieldError('password')}
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              onSubmitEditing={submit}
            />
            <Button
              title={t('Delete my account for good')}
              onPress={submit}
              busy={remove.isPending}
            />
            <Button
              title={t('Keep my account')}
              variant="secondary"
              onPress={() => {
                setConfirming(false);
                setPassword('');
                remove.reset();
              }}
            />
          </View>
        ) : (
          <Button
            title={t('Delete my account…')}
            variant="secondary"
            onPress={() => setConfirming(true)}
          />
        )}
      </Card>
    </Disclosure>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  name: { flex: 1, fontSize: 16, color: colors.text },
  text: { fontSize: 15, color: colors.text },
  confirm: { gap: spacing.sm },
});
