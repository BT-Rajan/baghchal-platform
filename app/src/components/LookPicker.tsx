import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Appearance, BoardTheme, PieceSet } from '@/api/endpoints';
import { BOARDS, FREE_APPEARANCE, isThemed, PIECES } from '@/appearance/catalog';
import { useAppearanceQuery, useChooseAppearance } from '@/appearance/hooks';
import { has, PLAN_NAMES, planFor } from '@/billing/format';
import { useMyPlan, usePlans } from '@/billing/hooks';
import { t } from '@/i18n';
import { colors, radius, spacing, type } from '@/theme';

import { SectionTitle } from './Card';
import { focusRing } from './focus';
import { BoardPreview } from './game/BoardPreview';
import { ripple } from './press';
import { Upsell } from './Upsell';
import { ErrorNotice } from './ErrorNotice';

/**
 * My board, pieces and sounds as the server has them, and the way to change them: choices my
 * plan lacks are shown disabled, marked with the plan that has them (from the server's plans),
 * and the Upsell says why. `ready` is null while loading or after an error.
 */
export function useLookChoice() {
  const look = useAppearanceQuery();
  const plan = useMyPlan();
  const plans = usePlans();
  const choose = useChooseAppearance();
  const error = look.error ?? plan.error ?? plans.error;
  const retry = () => {
    void look.refetch();
    void plan.refetch();
    void plans.refetch();
  };
  if (look.data === undefined || plan.data === undefined || plans.data === undefined)
    return { error, retry, ready: null };
  const current = look.data;
  const myPlan = plan.data;
  const themes = has(myPlan, 'themes');
  const pick = (change: Partial<Appearance>) => {
    if (themes || !isThemed({ ...current, ...change })) choose.mutate(change);
  };
  const locked = (free: boolean) => !themes && !free;
  const paid = planFor(plans.data, 'themes');
  /** The plan the locked choices come with ("Plus"), or null if none has them. */
  const lockedPlan = paid === null ? null : PLAN_NAMES[paid];
  return {
    error,
    retry,
    ready: { current, plan: myPlan, themes, pick, locked, lockedPlan, chooseError: choose.error },
  };
}

export type LookChoice = NonNullable<ReturnType<typeof useLookChoice>['ready']>;

/**
 * Above the choices: the Upsell for the ones that come with a paid plan (unless `upsell` is
 * false: a new account's first stop does not open with a sales pitch), and a choice that failed.
 */
export function LookNotices({ choice, upsell = true }: { choice: LookChoice; upsell?: boolean }) {
  const { themes, chooseError } = choice;
  return (
    <>
      {upsell && !themes && (
        <Upsell feature="themes">
          {t('More boards, pieces and sound packs, and a badge by your name.')}
        </Upsell>
      )}
      <ErrorNotice error={chooseError} />
    </>
  );
}

/** The boards and piece sets to choose from (Settings → Board, pieces and sounds, and a new
 * player's "Make it yours"), under the `LookNotices`. */
export function BoardAndPieces({ choice }: { choice: LookChoice }) {
  const { current, pick, locked, lockedPlan } = choice;
  return (
    <>
      <SectionTitle>{t('Board')}</SectionTitle>
      <View role="radiogroup" aria-label={t('Board')} style={styles.grid}>
        {(Object.keys(BOARDS) as BoardTheme[]).map((board) => (
          <Tile
            key={board}
            name={t(BOARDS[board].name)}
            selected={current.board === board}
            locked={locked(board === FREE_APPEARANCE.board)}
            lockedPlan={lockedPlan}
            onPress={() => pick({ board })}
          >
            <BoardPreview theme={board} pieces={current.pieces} />
          </Tile>
        ))}
      </View>

      <SectionTitle>{t('Pieces')}</SectionTitle>
      <View role="radiogroup" aria-label={t('Pieces')} style={styles.grid}>
        {(Object.keys(PIECES) as PieceSet[]).map((pieces) => (
          <Tile
            key={pieces}
            name={t(PIECES[pieces].name)}
            selected={current.pieces === pieces}
            locked={locked(pieces === FREE_APPEARANCE.pieces)}
            lockedPlan={lockedPlan}
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
  lockedPlan,
  onPress,
  children,
}: {
  name: string;
  selected: boolean;
  locked: boolean;
  lockedPlan: string | null;
  onPress: () => void;
  children: ReactNode;
}) {
  const label = lockedName(name, locked, lockedPlan);
  return (
    <Pressable
      role="radio"
      aria-checked={selected}
      aria-label={
        locked && lockedPlan !== null
          ? t('{name}, comes with {plan}', { name, plan: lockedPlan })
          : label
      }
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
      <Text style={styles.name}>{label}</Text>
    </Pressable>
  );
}

/** A choice's name, marked with the plan it comes with when my plan lacks it ("Jade · Plus"). */
export function lockedName(name: string, locked: boolean, lockedPlan: string | null): string {
  return locked && lockedPlan !== null ? t('{name} · {plan}', { name, plan: lockedPlan }) : name;
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
  name: { ...type.label, color: colors.text, textAlign: 'center' },
});
