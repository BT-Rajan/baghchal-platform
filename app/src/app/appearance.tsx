import { useState } from 'react';
import { Platform } from 'react-native';

import type { SoundPack } from '@/api/endpoints';
import { FREE_APPEARANCE, SOUNDS } from '@/appearance/catalog';
import { has } from '@/billing/format';
import { Button } from '@/components/Button';
import { playSound, soundSupported } from '@/components/game/sound';
import {
  BoardAndPieces,
  LookNotices,
  lockedName,
  useLookChoice,
  type LookChoice,
} from '@/components/LookPicker';
import { Screen } from '@/components/Screen';
import { Segmented } from '@/components/Segmented';
import { ErrorState, Loading } from '@/components/States';
import { SwitchRow } from '@/components/SwitchRow';
import { Upsell } from '@/components/Upsell';
import { t } from '@/i18n';

type Tab = 'look' | 'sounds' | 'badge';

/**
 * Choose a board, pieces and sounds (the paid plans' extras), and whether others see my badge:
 * one tab at a time.
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
      {/* The sounds tab has its Upsell beside the sound packs it is about. */}
      <LookNotices choice={ready} upsell={tab !== 'sounds'} />
      <Segmented label={t('What to change')} options={tabs} value={tab} onChange={setTab} />
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
  const { current, pick, locked, lockedPlan, themes } = choice;
  // A sound pack my plan lacks, pressed: the Upsell below names it, instead of nothing happening.
  const [wanted, setWanted] = useState<SoundPack | null>(null);
  const isLocked = (sounds: SoundPack) => locked(sounds === FREE_APPEARANCE.sounds);
  return (
    <>
      <SwitchRow
        label={soundSwitchLabel()}
        value={current.sounds_on}
        onChange={(on) => pick({ sounds_on: on })}
      />
      <Segmented
        label={t('Sound pack')}
        vertical
        value={current.sounds}
        onChange={(sounds) => {
          if (isLocked(sounds)) {
            setWanted(sounds);
          } else {
            setWanted(null);
            pick({ sounds });
          }
        }}
        options={(Object.keys(SOUNDS) as SoundPack[]).map((sounds) => ({
          value: sounds,
          label: t('{name}: {description}', {
            name: lockedName(t(SOUNDS[sounds].name), isLocked(sounds), lockedPlan),
            description: t(SOUNDS[sounds].description),
          }),
        }))}
      />
      {!themes && (
        <Upsell feature="themes">
          {wanted !== null
            ? t(
                'Use {name} and the other sound packs, with more boards and pieces and a badge by your name.',
                {
                  name: t(SOUNDS[wanted].name),
                },
              )
            : t('More boards, pieces and sound packs, and a badge by your name.')}
        </Upsell>
      )}
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
      <SwitchRow
        label={t("Show your opponent's messages in games (quick messages and chat)")}
        value={current.emotes_on}
        onChange={(on) => pick({ emotes_on: on })}
      />
    </>
  );
}

/** The web has no vibration, so there the switch is for sounds alone. */
function soundSwitchLabel(): string {
  return Platform.OS === 'web' ? t('Game sounds') : t('Game sounds and vibration');
}
