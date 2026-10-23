import { Linking, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card, Hint } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { ANDROID_APK_URL } from '@/config';
import { t } from '@/i18n';
import { colors, spacing, type } from '@/theme';

/**
 * ClawPlay for Android: the latest test build, as a file to install, and how. For anyone, signed
 * in or not (linked from the web's footer and landing page). Not in Google Play yet.
 */
export default function Download() {
  const steps = [
    t('Open this page on your Android phone and download the file.'),
    t('Open the file. If Android asks, allow installing from this source.'),
    t('Install. A newer file installs over the old one; your account stays.'),
  ];
  return (
    <Screen title={t('ClawPlay for Android')} brand>
      <Text style={styles.lede}>
        {t('The latest test build of the app, as a file to install.')}
      </Text>
      <Button
        title={t('Download for Android')}
        icon="download"
        large
        onPress={() => void Linking.openURL(ANDROID_APK_URL)}
      />
      <Card>
        <Text role="heading" style={styles.heading}>
          {t('How to install')}
        </Text>
        {steps.map((step, i) => (
          <View key={step} style={styles.step}>
            <Text style={styles.number}>{i + 1}</Text>
            <Text style={styles.text}>{step}</Text>
          </View>
        ))}
      </Card>
      <Hint>{t('A test build: not from Google Play yet, and signed with a test key.')}</Hint>
    </Screen>
  );
}

const styles = StyleSheet.create({
  lede: { ...type.body, color: colors.muted },
  heading: { ...type.heading, color: colors.text },
  step: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  number: { ...type.heading, color: colors.accent, minWidth: 20 },
  text: { ...type.body, color: colors.text, flex: 1 },
});
