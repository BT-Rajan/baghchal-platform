import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { LegalVersions } from '@/api/endpoints';
import { classify } from '@/legal/age';
import {
  asksParent,
  checkAgreement,
  EMPTY_AGREEMENT,
  type AgeDetails,
  type AgreementField,
  type AgreementInput,
} from '@/legal/agreement';
import { useLegalVersions } from '@/legal/hooks';
import { colors, spacing, type } from '@/theme';

import { Hint } from './Card';
import { TextField } from './TextField';

/** What a sign-up sends besides the account: the age, and the versions agreed to. */
export type AgreementBody = AgeDetails & { terms_version: string; privacy_version: string };

/**
 * The state behind `AgreementFields`, for the one form it sits in. `check` gives the problems to
 * show and, when there are none, what to send.
 */
export function useAgreement({ guest }: { guest: boolean }) {
  const versions = useLegalVersions();
  const [input, setInput] = useState<AgreementInput>(EMPTY_AGREEMENT);
  const check = (ownEmail = '') => {
    const { problems, details } = checkAgreement(input, new Date(), { guest, ownEmail });
    const agreed: LegalVersions | undefined = versions.data;
    const body: AgreementBody | null =
      details && agreed
        ? { ...details, terms_version: agreed.terms, privacy_version: agreed.privacy }
        : null;
    return { problems, body };
  };
  return { input, setInput, versions, check, guest };
}

/**
 * The month and year of birth (and a parent's email for a minor's account), with the line that
 * says what continuing agrees to. Part of every sign-up: the account form, a guest's first game,
 * and an account asked again after the texts change.
 */
export function AgreementFields({
  agreement,
  fieldError,
  intro = 'By continuing you agree to our',
  askAge = true,
}: {
  agreement: ReturnType<typeof useAgreement>;
  fieldError: (field: AgreementField) => string | undefined;
  intro?: string;
  /** False for an account whose age is known, asked only to agree to changed texts. */
  askAge?: boolean;
}) {
  return (
    <>
      {askAge && <AgeFields agreement={agreement} fieldError={fieldError} />}
      <Text style={styles.small}>
        {intro}{' '}
        <Text role="link" style={styles.link} onPress={() => router.push('/terms')}>
          Terms of service
        </Text>{' '}
        and{' '}
        <Text role="link" style={styles.link} onPress={() => router.push('/privacy')}>
          Privacy policy
        </Text>
        .
      </Text>
    </>
  );
}

function AgeFields({
  agreement,
  fieldError,
}: {
  agreement: ReturnType<typeof useAgreement>;
  fieldError: (field: AgreementField) => string | undefined;
}) {
  const { input, setInput, guest } = agreement;
  const answer = classify(input.month, input.year, new Date());
  const set = (change: Partial<AgreementInput>) => setInput({ ...input, ...change });
  const birthError = fieldError('birth_month');
  return (
    <>
      <View style={styles.row}>
        <View style={styles.cell}>
          <TextField
            label="Month of birth"
            placeholder="MM"
            value={input.month}
            onChangeText={(month) => set({ month })}
            keyboardType="number-pad"
            maxLength={2}
          />
        </View>
        <View style={styles.cell}>
          <TextField
            label="Year of birth"
            placeholder="YYYY"
            value={input.year}
            onChangeText={(year) => set({ year })}
            keyboardType="number-pad"
            maxLength={4}
          />
        </View>
      </View>
      {birthError !== undefined && (
        <Text role="alert" style={styles.error}>
          {birthError}
        </Text>
      )}
      {answer.kind === 'minor' && guest && (
        <Hint>
          Under 18, you can play the computer as a guest. To play other people, make an account: we
          will ask a parent or guardian to agree.
        </Hint>
      )}
      {asksParent(answer, guest) && (
        <>
          <Hint>
            You are under 18, so we will email a parent or guardian to ask them to agree. Until they
            do, you can play the computer and puzzles, but not other people.
          </Hint>
          <TextField
            label="Parent's or guardian's email"
            value={input.parentEmail}
            onChangeText={(parentEmail) => set({ parentEmail })}
            error={fieldError('parent_email')}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  cell: { flex: 1 },
  error: { ...type.label, fontWeight: '400', color: colors.danger },
  small: { ...type.caption, color: colors.muted },
  link: { color: colors.link, fontWeight: '600', textDecorationLine: 'underline' },
});
