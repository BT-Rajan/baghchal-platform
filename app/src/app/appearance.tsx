import { router } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Appearance, BoardTheme, PieceSet, SoundPack } from '@/api/endpoints';
import { describeError } from '@/api/errors';
import { BOARDS, FREE_APPEARANCE, isThemed, PIECES, SOUNDS } from '@/appearance/catalog';
import { useAppearanceQuery, useChooseAppearance } from '@/appearance/hooks';
import { has } from '@/billing/format';
import { useMyPlan } from '@/billing/hooks';
import { Button } from '@/components/Button';
import { Hint, SectionTitle } from '@/components/Card';
import { focusRing } from '@/components/focus';
import { BoardPreview } from '@/components/game/BoardPreview';
import { playSound, soundSupported } from '@/components/game/sound';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { Segmented } from '@/components/Segmented';
import { ErrorState, Loading } from '@/components/States';
import { colors, radius, spacing } from '@/theme';

const LOCKED = 'A choice of boards, pieces and sounds comes with ClawPlay Plus.';

/** Choose a board, pieces and sounds (Plus and Pro), and whether others see my badge. */
export default function AppearanceScreen() {
  const look = useAppearanceQuery();
  const plan = useMyPlan();
  const choose = useChooseAppearance();
  const [refused, setRefused] = useState(false);
  const error = look.error ?? plan.error;

  if (error !== null) {
    return (
      <Screen title="Board, pieces and sounds" align="top">
        <ErrorState
          error={error}
          onRetry={() => {
            void look.refetch();
            void plan.refetch();
          }}
        />
      </Screen>
    );
  }
  if (look.data === undefined || plan.data === undefined) {
    return (
      <Screen title="Board, pieces and sounds" align="top">
        <Loading label="Loading your board and pieces" />
      </Screen>
    );
  }

  const current = look.data;
  const themes = has(plan.data, 'themes');
  const pick = (change: Partial<Appearance>) => {
    if (!themes && isThemed({ ...current, ...change })) {
      setRefused(true);
      return;
    }
    setRefused(false);
    choose.mutate(change);
  };
  const locked = (free: boolean) => !themes && !free;

  return (
    <Screen title="Board, pieces and sounds" align="top" wide>
      {!themes && (
        <Notice tone="info">
          Free has the Wood board, Classic pieces and Gentle sounds. More come with ClawPlay Plus.
        </Notice>
      )}
      {refused && (
        <>
          <Notice tone="error">{LOCKED}</Notice>
          <Button title="See plans" variant="secondary" onPress={() => router.push('/plans')} />
        </>
      )}
      {choose.error !== null && <Notice tone="error">{describeError(choose.error)}</Notice>}

      <SectionTitle>Board</SectionTitle>
      <View role="radiogroup" aria-label="Board" style={styles.grid}>
        {(Object.keys(BOARDS) as BoardTheme[]).map((board) => (
          <Tile
            key={board}
            name={BOARDS[board].name}
            selected={current.board === board}
            locked={locked(board === FREE_APPEARANCE.board)}
            onPress={() => pick({ board })}
          >
            <BoardPreview theme={board} pieces={current.pieces} />
          </Tile>
        ))}
      </View>

      <SectionTitle>Pieces</SectionTitle>
      <View role="radiogroup" aria-label="Pieces" style={styles.grid}>
        {(Object.keys(PIECES) as PieceSet[]).map((pieces) => (
          <Tile
            key={pieces}
            name={PIECES[pieces].name}
            selected={current.pieces === pieces}
            locked={locked(pieces === FREE_APPEARANCE.pieces)}
            onPress={() => pick({ pieces })}
          >
            <BoardPreview theme={current.board} pieces={pieces} />
          </Tile>
        ))}
      </View>

      <SectionTitle>Sounds</SectionTitle>
      <Segmented
        label="Game sounds"
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

      <SectionTitle>Badge</SectionTitle>
      {has(plan.data, 'badge') ? (
        <Segmented
          label="Next to my name, others see"
          value={current.show_badge ? 'show' : 'hide'}
          onChange={(value) => pick({ show_badge: value === 'show' })}
          options={[
            { value: 'show', label: 'My badge' },
            { value: 'hide', label: 'Nothing' },
          ]}
        />
      ) : (
        <Hint>Plus and Pro players can show a badge next to their name.</Hint>
      )}
    </Screen>
  );
}

function Tile({
  name,
  selected,
  locked,
  onPress,
  children,
}: {
  name: string;
  selected: boolean;
  locked: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      role="radio"
      aria-checked={selected}
      aria-label={locked ? `${name}, comes with Plus` : name}
      onPress={onPress}
      style={(state) => [styles.tile, selected && styles.selected, focusRing(state)]}
    >
      <View style={styles.preview}>{children}</View>
      <Text style={styles.name}>{locked ? `${name} · Plus` : name}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tile: {
    width: 132,
    padding: spacing.sm,
    gap: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  selected: { borderColor: colors.accent },
  preview: { width: 112, height: 112 },
  name: { fontSize: 14, fontWeight: '600', color: colors.text, textAlign: 'center' },
});
