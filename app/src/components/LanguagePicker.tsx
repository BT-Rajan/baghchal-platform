import { useAppearance, useChooseAppearance } from '@/appearance/hooks';
import { LANGUAGE_NAMES, t, type Language, type LanguageChoice } from '@/i18n';
import { needsRestart, useDeviceLanguage } from '@/i18n/LanguageRoot';

import { ErrorNotice } from './ErrorNotice';
import { Notice } from './Notice';
import { Segmented } from './Segmented';

/** The app's language, kept with my appearance on every device: the device's, or one chosen. */
export function LanguagePicker() {
  const choice = useAppearance().language;
  const choose = useChooseAppearance();
  const device = useDeviceLanguage();
  const options: { value: LanguageChoice; label: string }[] = [
    {
      value: 'auto',
      label: t('As this device ({language})', { language: LANGUAGE_NAMES[device] }),
    },
    ...(Object.keys(LANGUAGE_NAMES) as Language[]).map((value) => ({
      value,
      label: LANGUAGE_NAMES[value],
    })),
  ];
  return (
    <>
      <Segmented
        label={t('Language')}
        options={options}
        value={choice}
        onChange={(language) => choose.mutate({ language })}
      />
      <ErrorNotice error={choose.error} />
      {needsRestart() && (
        <Notice tone="info">{t('Close and open ClawPlay again to update the layout.')}</Notice>
      )}
    </>
  );
}
