import { StyleSheet, Text, View } from 'react-native';

import type { Agreement } from '@/api/endpoints';
import { useLegalVersions } from '@/legal/hooks';
import { t } from '@/i18n';
import { colors, spacing, type } from '@/theme';

import { ErrorState } from './States';
import { TextLink } from './TextLink';

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
  const { versions } = agreement;
  return (
    <>
      {versions.isError && (
        <ErrorState error={versions.error} onRetry={() => void versions.refetch()} />
      )}
      <Text style={styles.small}>
        {t(
          'By pressing Accept you agree to our {terms} and {privacy}, and confirm you are 13 or older (with a parent’s or guardian’s permission if you are under 18).',
          { terms: t('Terms of service'), privacy: t('Privacy policy') },
        )}
      </Text>
      {/* The two texts, each a finger-sized link of its own under the sentence. */}
      <View style={styles.links}>
        <TextLink href="/terms">{t('Terms of service')}</TextLink>
        <TextLink href="/privacy">{t('Privacy policy')}</TextLink>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  small: { ...type.caption, color: colors.muted },
  links: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.lg },
});
