import { useState } from 'react';

import type { SoundPack } from '@/api/endpoints';
import { FREE_APPEARANCE, SOUNDS } from '@/appearance/catalog';
import { has } from '@/billing/format';
import { Button } from '@/components/Button';
import { playSound, soundSupported } from '@/components/game/sound';
import {
  BoardAndPieces,
  LookNotices,
  useLookChoice,
  type LookChoice,
} from '@/components/LookPicker';
import { Screen } from '@/components/Screen';
import { Segmented } from '@/components/Segmented';
import { ErrorState, Loading } from '@/components/States';
import { t } from '@/i18n';

type Tab = 'look' | 'sounds' | 'badge';

/**
 * Choose a board, pieces and sounds (Plus and Pro), and whether others see my badge: one tab
 * at a time.
 */
export default function AppearanceScreen() {
  const { error, retry, ready } = useLookChoice();
  const [tab, setTab] = useState<Tab>('look');

  if (ready === null) {
    return (
      <Screen align="top">
        {error !== null ? (
          <ErrorState error={error} onRetry={retry} />
        ) : (
          <Loading label={t('Loading your board and pieces')} />
        )}
      </Screen>
    );
  }

  const { current, plan, pick } = ready;
  const badge = has(plan, 'badge');
  const tabs: { value: Tab; label: string }[] = [
    { value: 'look', label: t('Board and pieces') },
    { value: 'sounds', label: t('Sounds and messages') },
    ...(badge ? [{ value: 'badge' as const, label: t('Badge') }] : []),
  ];

  return (
    <Screen align="top" wide>
      <LookNotices choice={ready} />
      <Segmented label={t('Show')} options={tabs} value={tab} onChange={setTab} />
      {tab === 'look' && <BoardAndPieces choice={ready} />}
      {tab === 'sounds' && <Sounds choice={ready} />}
      {tab === 'badge' && (
        <Segmented
          label={t('Next to my name, others see')}
          value={current.show_badge ? 'show' : 'hide'}
          onChange={(value) => pick({ show_badge: value === 'show' })}
          options={[
            { value: 'show', label: t('My badge') },
            { value: 'hide', label: t('Nothing') },
          ]}
        />
      )}
    </Screen>
  );
}

function Sounds({ choice }: { choice: LookChoice }) {
  const { current, pick, locked } = choice;
  return (
    <>
      <Segmented
        label={t('Game sounds and vibration')}
        value={current.sounds_on ? 'on' : 'off'}
        onChange={(value) => pick({ sounds_on: value === 'on' })}
        options={[
          { value: 'on', label: t('On') },
          { value: 'off', label: t('Off') },
        ]}
      />
      <Segmented
        label={t('Sound pack')}
        vertical
        value={current.sounds}
        onChange={(sounds) => pick({ sounds })}
        options={(Object.keys(SOUNDS) as SoundPack[]).map((sounds) => ({
          value: sounds,
          label: locked(sounds === FREE_APPEARANCE.sounds)
            ? t('{name} (Plus): {description}', {
                name: t(SOUNDS[sounds].name),
                description: t(SOUNDS[sounds].description),
              })
            : t('{name}: {description}', {
                name: t(SOUNDS[sounds].name),
                description: t(SOUNDS[sounds].description),
              }),
        }))}
      />
      {soundSupported() && (
        <Button
          title={t('Hear {name}', { name: t(SOUNDS[current.sounds].name) })}
          variant="secondary"
          compact
          onPress={() => {
            playSound('move', current.sounds);
            setTimeout(() => playSound('capture', current.sounds), 450);
          }}
        />
      )}
      <Segmented
        label={t("Your opponent's messages in games (quick messages and chat)")}
        value={current.emotes_on ? 'show' : 'hide'}
        onChange={(value) => pick({ emotes_on: value === 'show' })}
        options={[
          { value: 'show', label: t('Show') },
          { value: 'hide', label: t('Hide') },
        ]}
      />
    </>
  );
}
