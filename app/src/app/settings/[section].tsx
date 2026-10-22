import { Redirect, router, useLocalSearchParams } from 'expo-router';

import { useMe } from '@/auth/session';
import { accountParts } from '@/components/AccountSettings';
import { FeatureLink } from '@/components/FeatureLink';
import { LanguagePicker } from '@/components/LanguagePicker';
import { Screen } from '@/components/Screen';
import { t } from '@/i18n';

/**
 * One row of Settings, in the apps: the language, the account's list, or one of its parts (the
 * same parts the web's Settings page folds open).
 */
export default function SettingsSection() {
  const { section } = useLocalSearchParams<{ section: string }>();
  const guest = useMe().role === 'guest';
  const parts = accountParts(guest);
  if (section === 'language') {
    return (
      <Screen title={t('Language')} align="top">
        <LanguagePicker />
      </Screen>
    );
  }
  if (section === 'account') {
    return (
      <Screen title={t('Account')} align="top">
        {parts.map((part) => (
          <FeatureLink
            key={part.section}
            icon={part.icon}
            title={t(part.title)}
            onPress={() => router.push(`/settings/${part.section}`)}
          />
        ))}
      </Screen>
    );
  }
  const part = parts.find((p) => p.section === section);
  if (part === undefined) return <Redirect href="/settings" />;
  return (
    <Screen title={t(part.title)} align="top">
      <part.Part />
    </Screen>
  );
}
