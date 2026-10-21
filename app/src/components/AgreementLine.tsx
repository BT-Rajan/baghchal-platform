import { router } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import type { Agreement } from '@/api/endpoints';
import { describeError } from '@/api/errors';
import { useLegalVersions } from '@/legal/hooks';
import { t } from '@/i18n';
import { colors, type } from '@/theme';

import { Notice } from './Notice';

/**
 * The versions of the terms and privacy policy shown now, for the one form `AgreementLine` sits
 * in: `body` is what pressing Accept sends (null until they have loaded).
 */
export function useAgreement() {
  const versions = useLegalVersions();
  const body: Agreement | null = versions.data
    ? { terms_version: versions.data.terms, privacy_version: versions.data.privacy }
    : null;
  return { versions, body };
}

/**
 * What pressing Accept agrees to: the terms and privacy policy, and being 13 or older (with a
 * parent's or guardian's permission under 18). The one agreement every sign-up gives: the
 * account form, a guest's first game, and an account asked again after the texts change.
 */
export function AgreementLine({ agreement }: { agreement: ReturnType<typeof useAgreement> }) {
  return (
    <>
      {agreement.versions.isError && (
        <Notice tone="error">{describeError(agreement.versions.error)}</Notice>
      )}
      <Text style={styles.small}>
        {/* One sentence to translate, its two links in the places it gives them. */}
        {t(
          'By pressing Accept you agree to our {terms} and {privacy}, and confirm you are 13 or older (with a parent’s or guardian’s permission if you are under 18).',
        )
          .split(/(\{terms\}|\{privacy\})/)
          .map((part, i) =>
            part === '{terms}' ? (
              <Text key={i} role="link" style={styles.link} onPress={() => router.push('/terms')}>
                {t('Terms of service')}
              </Text>
            ) : part === '{privacy}' ? (
              <Text key={i} role="link" style={styles.link} onPress={() => router.push('/privacy')}>
                {t('Privacy policy')}
              </Text>
            ) : (
              part
            ),
          )}
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  small: { ...type.caption, color: colors.muted },
  link: { color: colors.link, fontWeight: '600', textDecorationLine: 'underline' },
});
