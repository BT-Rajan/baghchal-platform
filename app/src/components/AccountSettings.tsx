import { useMutation } from '@tanstack/react-query';
import { useRef, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, Text, View, type TextInputInstance } from 'react-native';

import { saveExport } from '@/auth/exportFile';
import { useApi, useMe, useSession } from '@/auth/session';
import { checkEmailChange, checkPasswordChange, checkPasswordGiven } from '@/auth/validation';
import { mark, t } from '@/i18n';
import { useBlock, useBlocks } from '@/lobby/hooks';
import { colors, spacing, type } from '@/theme';

import { Button } from './Button';
import { Card, Hint } from './Card';
import { ErrorNotice } from './ErrorNotice';
import { useFormErrors } from './form';
import type { IconName } from './Icon';
import { Notice } from './Notice';
import { SuccessNotice } from './Snackbar';
import { ErrorState, Loading } from './States';
import { TextField } from './TextField';

/**
 * The account's parts of Settings, each on its own: on the web folded into the one Settings
 * page, in the apps a screen each (app/settings/[section].tsx).
 */

export function BlockedPlayers() {
  const blocks = useBlocks();
  const change = useBlock();
  return (
    <>
      <ErrorNotice error={change.error} />
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
    </>
  );
}

const EMAIL_FIELDS = ['email', 'password'] as const;
const EMAIL_CODES = { same_email: 'email', wrong_password: 'password' } as const;

export function EmailChange() {
  const api = useApi();
  const me = useMe();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const passwordField = useRef<TextInputInstance>(null);
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
    <Card>
      <Text style={styles.text}>{t('Your email address is {email}.', { email: me.email })}</Text>
      {change.isSuccess ? (
        <Notice tone="success">
          {t('Link sent to {email}. Open it to change your address.', {
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
            autoCorrect={false}
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => passwordField.current?.focus()}
          />
          <TextField
            ref={passwordField}
            label={t('Your password')}
            value={password}
            onChangeText={setPassword}
            error={fieldError('password')}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={submit}
          />
          <Button title={t('Send a confirmation link')} onPress={submit} busy={change.isPending} />
        </>
      )}
    </Card>
  );
}

const PASSWORD_FIELDS = ['current', 'password', 'confirm'] as const;
const PASSWORD_CODES = { wrong_password: 'current', weak_password: 'password' } as const;

export function PasswordChange() {
  const api = useApi();
  const me = useMe();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const passwordField = useRef<TextInputInstance>(null);
  const confirmField = useRef<TextInputInstance>(null);
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
    <Card>
      {change.isSuccess && (
        <SuccessNotice>{t('Password changed. Your other devices are signed out.')}</SuccessNotice>
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
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => passwordField.current?.focus()}
      />
      <TextField
        ref={passwordField}
        label={t('New password')}
        value={password}
        onChangeText={setPassword}
        error={fieldError('password')}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => confirmField.current?.focus()}
      />
      <TextField
        ref={confirmField}
        label={t('Repeat the new password')}
        value={confirm}
        onChangeText={setConfirm}
        error={fieldError('confirm')}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <Button title={t('Change password')} onPress={submit} busy={change.isPending} />
    </Card>
  );
}

export function DataExport() {
  const api = useApi();
  const download = useMutation({
    mutationFn: async () => saveExport(await api.exportData()),
  });
  return (
    <Card>
      <Hint>{t('A copy of everything we keep about you.')}</Hint>
      <ErrorNotice error={download.error} />
      {/* In the apps the share sheet says where the file went (Android reports it shared
          even when the sheet is just closed, so saying more here could be untrue). */}
      {download.isSuccess && Platform.OS === 'web' && (
        <SuccessNotice>{t('Your data has been downloaded.')}</SuccessNotice>
      )}
      <Button
        title={t('Download my data')}
        variant="secondary"
        onPress={() => download.mutate()}
        busy={download.isPending}
      />
    </Card>
  );
}

const DELETE_FIELDS = ['password'] as const;
const DELETE_CODES = { wrong_password: 'password' } as const;

export function DeleteAccount() {
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
    <Card>
      <Hint>
        {t(
          'Your email, password and leaderboard places go; your games stay, under an anonymous name. This cannot be undone.',
        )}
      </Hint>
      {confirming ? (
        <View style={styles.confirm}>
          {formMessage !== null && <Notice tone="error">{formMessage}</Notice>}
          <TextField
            label={t('Your password')}
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
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  name: { ...type.body, flex: 1, color: colors.text },
  text: { ...type.small, color: colors.text },
  confirm: { gap: spacing.sm },
});

/** The account's parts, in order; `members` ones are not for guests (they have no email). */
export const ACCOUNT_PARTS: readonly {
  section: string;
  title: string;
  icon: IconName;
  members: boolean;
  Part: () => ReactNode;
}[] = [
  { section: 'email', title: mark('Email address'), icon: 'mail', members: true, Part: EmailChange },
  { section: 'password', title: mark('Password'), icon: 'lock', members: true, Part: PasswordChange },
  {
    section: 'blocked',
    title: mark('Blocked players'),
    icon: 'block',
    members: false,
    Part: BlockedPlayers,
  },
  { section: 'data', title: mark('Your data'), icon: 'download', members: true, Part: DataExport },
  {
    section: 'delete',
    title: mark('Delete account'),
    icon: 'trash',
    members: true,
    Part: DeleteAccount,
  },
];

/** The parts this player has. */
export function accountParts(guest: boolean) {
  return ACCOUNT_PARTS.filter((part) => !guest || !part.members);
}
