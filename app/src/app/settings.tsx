import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { describeError } from '@/api/errors';
import { saveExport } from '@/auth/exportFile';
import { useApi, useMe, useSession } from '@/auth/session';
import { checkEmailChange, checkPasswordChange, checkPasswordGiven } from '@/auth/validation';
import { Button } from '@/components/Button';
import { Card, Hint, SectionTitle } from '@/components/Card';
import { FeatureLink } from '@/components/FeatureLink';
import { GuestBanner } from '@/components/GuestBanner';
import { PlanCard } from '@/components/PlanCard';
import { ErrorState, Loading } from '@/components/States';
import { useBlock, useBlocks } from '@/lobby/hooks';
import { useFormErrors } from '@/components/form';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { colors, spacing } from '@/theme';

/**
 * Settings, all in one place: the plan, the board and sounds, blocked players and moderation;
 * for members, the email address, password, their data and deleting the account; signing out.
 */
export default function SettingsScreen() {
  const me = useMe();
  const { session } = useSession();
  const signOut = useMutation({ mutationFn: () => session.signOut() });
  const guest = me.role === 'guest';
  return (
    <Screen align="top">
      <GuestBanner />
      <PlanCard />
      <SectionTitle>Look and sound</SectionTitle>
      <FeatureLink
        icon="palette"
        title="Board, pieces and sounds"
        text="How games look and sound, on every device you use."
        onPress={() => router.push('/appearance')}
      />
      {(me.role === 'moderator' || me.role === 'admin') && (
        <FeatureLink
          icon="shield"
          title="Moderation"
          text="Reports, and the players' records."
          onPress={() => router.push('/moderation')}
        />
      )}
      <BlockedPlayers />
      {!guest && (
        <>
          <EmailSection />
          <PasswordSection />
          <DataSection />
          <DeleteSection />
        </>
      )}
      <SectionTitle>Terms and privacy</SectionTitle>
      <FeatureLink
        icon="document"
        title="Terms of service"
        text="The rules of using ClawPlay."
        onPress={() => router.push('/terms')}
      />
      <FeatureLink
        icon="document"
        title="Privacy policy"
        text="What we keep about you, why, and for how long."
        onPress={() => router.push('/privacy')}
      />
      <SectionTitle>Sign out</SectionTitle>
      <Button
        title={guest ? 'Sign out (this guest account will be lost)' : 'Sign out'}
        variant="secondary"
        onPress={() => signOut.mutate()}
        busy={signOut.isPending}
      />
    </Screen>
  );
}

function BlockedPlayers() {
  const blocks = useBlocks();
  const change = useBlock();
  return (
    <>
      <SectionTitle>Blocked players</SectionTitle>
      {change.error !== null && <Notice tone="error">{describeError(change.error)}</Notice>}
      {blocks.error !== null ? (
        <ErrorState error={blocks.error} onRetry={() => void blocks.refetch()} />
      ) : blocks.data === undefined ? (
        <Loading label="Loading blocked players" />
      ) : blocks.data.length === 0 ? (
        <Hint>You have not blocked anyone.</Hint>
      ) : (
        <Card>
          {blocks.data.map((player) => (
            <View key={player.id} style={styles.row}>
              <Text style={styles.name}>{player.username}</Text>
              <Button
                title={`Unblock ${player.username}`}
                label="Unblock"
                variant="secondary"
                compact
                busy={change.isPending && change.variables.username === player.username}
                onPress={() => change.mutate({ username: player.username, block: false })}
              />
            </View>
          ))}
        </Card>
      )}
    </>
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
    <>
      <SectionTitle>Email address</SectionTitle>
      <Card>
        <Text style={styles.text}>{`Your email address is ${me.email}.`}</Text>
        {change.isSuccess ? (
          <Notice tone="success">
            {`We sent a link to ${change.variables}. Your address changes when you open it.`}
          </Notice>
        ) : (
          <>
            {formMessage !== null && <Notice tone="error">{formMessage}</Notice>}
            <TextField
              label="New email address"
              value={email}
              onChangeText={setEmail}
              error={fieldError('email')}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
            />
            <TextField
              label="Your password (to change the email address)"
              value={password}
              onChangeText={setPassword}
              error={fieldError('password')}
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              onSubmitEditing={submit}
            />
            <Button title="Send a confirmation link" onPress={submit} busy={change.isPending} />
          </>
        )}
      </Card>
    </>
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
    <>
      <SectionTitle>Password</SectionTitle>
      <Card>
        {change.isSuccess && (
          <Notice tone="success">
            Your password has been changed. Your other devices have been signed out.
          </Notice>
        )}
        {formMessage !== null && <Notice tone="error">{formMessage}</Notice>}
        <TextField
          label="Current password"
          value={current}
          onChangeText={setCurrent}
          error={fieldError('current')}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
        />
        <TextField
          label="New password"
          value={password}
          onChangeText={setPassword}
          error={fieldError('password')}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
        />
        <TextField
          label="Repeat the new password"
          value={confirm}
          onChangeText={setConfirm}
          error={fieldError('confirm')}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          onSubmitEditing={submit}
        />
        <Button title="Change password" onPress={submit} busy={change.isPending} />
      </Card>
    </>
  );
}

function DataSection() {
  const api = useApi();
  const download = useMutation({
    mutationFn: async () => saveExport(await api.exportData()),
  });
  return (
    <>
      <SectionTitle>Your data</SectionTitle>
      <Card>
        <Hint>
          A copy of everything we keep about you: your account, ratings, games with their moves,
          challenges and blocked players.
        </Hint>
        {download.error !== null && <Notice tone="error">{describeError(download.error)}</Notice>}
        <Button
          title="Download my data"
          variant="secondary"
          onPress={() => download.mutate()}
          busy={download.isPending}
        />
      </Card>
    </>
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
    <>
      <SectionTitle>Delete account</SectionTitle>
      <Card>
        <Hint>
          Deleting your account removes your email address and password, takes you off the
          leaderboards and signs you out everywhere. Games you played stay in your opponents&apos;
          history under an anonymous name. This cannot be undone.
        </Hint>
        {confirming ? (
          <View style={styles.confirm}>
            {formMessage !== null && <Notice tone="error">{formMessage}</Notice>}
            <TextField
              label="Your password (to delete your account)"
              value={password}
              onChangeText={setPassword}
              error={fieldError('password')}
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              onSubmitEditing={submit}
            />
            <Button title="Delete my account for good" onPress={submit} busy={remove.isPending} />
            <Button
              title="Keep my account"
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
            title="Delete my account…"
            variant="secondary"
            onPress={() => setConfirming(true)}
          />
        )}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  name: { flex: 1, fontSize: 16, color: colors.text },
  text: { fontSize: 15, color: colors.text },
  confirm: { gap: spacing.sm },
});
