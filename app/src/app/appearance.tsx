import type { SoundPack } from '@/api/endpoints';
import { FREE_APPEARANCE, SOUNDS } from '@/appearance/catalog';
import { has } from '@/billing/format';
import { Button } from '@/components/Button';
import { SectionTitle } from '@/components/Card';
import { playSound, soundSupported } from '@/components/game/sound';
import { BoardAndPieces, useLookChoice } from '@/components/LookPicker';
import { Screen } from '@/components/Screen';
import { Segmented } from '@/components/Segmented';
import { ErrorState, Loading } from '@/components/States';

/** Choose a board, pieces and sounds (Plus and Pro), and whether others see my badge. */
export default function AppearanceScreen() {
  const { error, retry, ready } = useLookChoice();

  if (ready === null) {
    return (
      <Screen align="top">
        {error !== null ? (
          <ErrorState error={error} onRetry={retry} />
        ) : (
          <Loading label="Loading your board and pieces" />
        )}
      </Screen>
    );
  }

  const { current, plan, pick, locked } = ready;

  return (
    <Screen align="top" wide>
      <BoardAndPieces choice={ready} />

      <SectionTitle>Sounds</SectionTitle>
      <Segmented
        label="Game sounds and vibration"
        value={current.sounds_on ? 'on' : 'off'}
        onChange={(value) => pick({ sounds_on: value === 'on' })}
        options={[
          { value: 'on', label: 'On' },
          { value: 'off', label: 'Off' },
        ]}
      />
      <Segmented
        label="Sound pack"
        vertical
        value={current.sounds}
        onChange={(sounds) => pick({ sounds })}
        options={(Object.keys(SOUNDS) as SoundPack[]).map((sounds) => ({
          value: sounds,
          label: `${SOUNDS[sounds].name}${locked(sounds === FREE_APPEARANCE.sounds) ? ' (Plus)' : ''}: ${SOUNDS[sounds].description}`,
        }))}
      />
      <Segmented
        label="Your opponent's messages in games (quick messages and chat)"
        value={current.emotes_on ? 'show' : 'hide'}
        onChange={(value) => pick({ emotes_on: value === 'show' })}
        options={[
          { value: 'show', label: 'Show' },
          { value: 'hide', label: 'Hide' },
        ]}
      />
      {soundSupported() && (
        <Button
          title={`Hear ${SOUNDS[current.sounds].name}`}
          variant="secondary"
          compact
          onPress={() => {
            playSound('move', current.sounds);
            setTimeout(() => playSound('capture', current.sounds), 450);
          }}
        />
      )}

      {has(plan, 'badge') && (
        <>
          <SectionTitle>Badge</SectionTitle>
          <Segmented
            label="Next to my name, others see"
            value={current.show_badge ? 'show' : 'hide'}
            onChange={(value) => pick({ show_badge: value === 'show' })}
            options={[
              { value: 'show', label: 'My badge' },
              { value: 'hide', label: 'Nothing' },
            ]}
          />
        </>
      )}
    </Screen>
  );
}
