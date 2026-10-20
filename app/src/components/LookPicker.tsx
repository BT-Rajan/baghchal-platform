import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Appearance, BoardTheme, PieceSet } from '@/api/endpoints';
import { describeError } from '@/api/errors';
import { BOARDS, FREE_APPEARANCE, isThemed, PIECES } from '@/appearance/catalog';
import { useAppearanceQuery, useChooseAppearance } from '@/appearance/hooks';
import { has } from '@/billing/format';
import { useMyPlan } from '@/billing/hooks';
import { colors, radius, spacing } from '@/theme';

import { SectionTitle } from './Card';
import { focusRing } from './focus';
import { BoardPreview } from './game/BoardPreview';
import { Notice } from './Notice';
import { ripple } from './press';
import { Upsell } from './Upsell';

/**
 * My board, pieces and sounds as the server has them, and the way to change them: choices my
 * plan lacks are shown, marked Plus, and do nothing (the Upsell says why). `ready` is null
 * while loading or after an error.
 */
export function useLookChoice() {
  const look = useAppearanceQuery();
  const plan = useMyPlan();
  const choose = useChooseAppearance();
  const error = look.error ?? plan.error;
  const retry = () => {
    void look.refetch();
    void plan.refetch();
  };
  if (look.data === undefined || plan.data === undefined) return { error, retry, ready: null };
  const current = look.data;
  const myPlan = plan.data;
  const themes = has(myPlan, 'themes');
  const pick = (change: Partial<Appearance>) => {
    if (themes || !isThemed({ ...current, ...change })) choose.mutate(change);
  };
  const locked = (free: boolean) => !themes && !free;
  return {
    error,
    retry,
    ready: { current, plan: myPlan, themes, pick, locked, chooseError: choose.error },
  };
}

export type LookChoice = NonNullable<ReturnType<typeof useLookChoice>['ready']>;

/** Above the choices: the Upsell for the ones that come with Plus, and a choice that failed. */
export function LookNotices({ choice }: { choice: LookChoice }) {
  const { themes, chooseError } = choice;
  return (
    <>
      {!themes && (
        <Upsell feature="themes">
          More boards, pieces and sound packs, and a badge by your name.
        </Upsell>
      )}
      {chooseError !== null && <Notice tone="error">{describeError(chooseError)}</Notice>}
    </>
  );
}

/** The boards and piece sets to choose from (Settings → Board, pieces and sounds, and a new
 * player's "Make it yours"), under the `LookNotices`. */
export function BoardAndPieces({ choice }: { choice: LookChoice }) {
  const { current, pick, locked } = choice;
  return (
    <>
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
    </>
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
      aria-disabled={locked}
      disabled={locked}
      onPress={onPress}
      {...ripple()}
      style={(state) => [
        styles.tile,
        selected && styles.selected,
        locked && styles.locked,
        focusRing(state),
      ]}
    >
      <View style={styles.preview}>{children}</View>
      <Text style={styles.name}>{locked ? `${name} · Plus` : name}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Three across a phone, more on a wider screen.
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    width: 110,
    padding: spacing.sm,
    gap: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  selected: { borderColor: colors.accent },
  locked: { opacity: 0.6 },
  preview: { width: '100%', aspectRatio: 1 },
  name: { fontSize: 14, fontWeight: '600', color: colors.text, textAlign: 'center' },
});
