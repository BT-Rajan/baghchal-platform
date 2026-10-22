import { router } from 'expo-router';
import { Platform, View } from 'react-native';

import { useMe } from '@/auth/session';
import { myPlanText } from '@/billing/format';
import { useMyPlan } from '@/billing/hooks';
import { accountParts } from '@/components/AccountSettings';
import { SectionTitle } from '@/components/Card';
import { Disclosure } from '@/components/Disclosure';
import { FeatureLink } from '@/components/FeatureLink';
import { LanguagePicker } from '@/components/LanguagePicker';
import { PlanCard } from '@/components/PlanCard';
import { Screen } from '@/components/Screen';
import { SignOutButton } from '@/components/SignOutButton';
import { t } from '@/i18n';

/**
 * Settings: the board, sounds and language, the plan, the account, the terms and signing out.
 * In the apps a short list, each row its own screen (app/settings/[section].tsx); on the web
 * one page, the account's parts folded shut until opened.
 */
export default function SettingsScreen() {
  return Platform.OS === 'web' ? <SettingsPage /> : <SettingsMenu />;
}

function SettingsMenu() {
  const mine = useMyPlan();
  return (
    <Screen align="top">
      <AppearanceLink />
      <FeatureLink
        icon="globe"
        title={t('Language')}
        onPress={() => router.push('/settings/language')}
      />
      <FeatureLink
        icon="star"
        title={t('Plan')}
        {...(mine.data !== undefined && { text: myPlanText(mine.data) })}
        onPress={() => router.push('/plans')}
      />
      <FeatureLink
        icon="me"
        title={t('Account')}
        onPress={() => router.push('/settings/account')}
      />
      <StaffLinks />
      <LegalLinks />
      <SignOutButton />
    </Screen>
  );
}

function SettingsPage() {
  const guest = useMe().role === 'guest';
  return (
    <Screen align="top">
      <SectionTitle>{t('Board, pieces, sounds and language')}</SectionTitle>
      <AppearanceLink />
      <LanguagePicker />
      <PlanCard />
      <StaffLinks />
      <SectionTitle>{t('Account')}</SectionTitle>
      <View>
        {accountParts(guest).map(({ section, title, Part }) => (
          <Disclosure key={section} title={t(title)}>
            <Part />
          </Disclosure>
        ))}
      </View>
      <SectionTitle>{t('Terms and privacy')}</SectionTitle>
      <LegalLinks />
      <SignOutButton />
    </Screen>
  );
}

function AppearanceLink() {
  return (
    <FeatureLink
      icon="palette"
      title={t('Board, pieces and sounds')}
      onPress={() => router.push('/appearance')}
    />
  );
}

/** Moderation and payments, for staff. */
function StaffLinks() {
  const role = useMe().role;
  if (role !== 'moderator' && role !== 'admin') return null;
  return (
    <>
      <SectionTitle>{t('Admin')}</SectionTitle>
      <FeatureLink
        icon="shield"
        title={t('Moderation')}
        onPress={() => router.push('/moderation')}
      />
      {role === 'admin' && (
        <FeatureLink
          icon="shield"
          title={t('Payments')}
          text={t('Razorpay keys. Needs an emailed code.')}
          onPress={() => router.push('/admin/payments')}
        />
      )}
    </>
  );
}

function LegalLinks() {
  return (
    <>
      <FeatureLink
        icon="document"
        title={t('Terms of service')}
        onPress={() => router.push('/terms')}
      />
      <FeatureLink
        icon="document"
        title={t('Privacy policy')}
        onPress={() => router.push('/privacy')}
      />
    </>
  );
}
