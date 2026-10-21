import { StyleSheet, Text, View } from 'react-native';

import { ACHIEVEMENTS, achievementCount, earnedText } from '@/lobby/achievements';
import { useAchievements } from '@/lobby/hooks';
import { t } from '@/i18n';
import { colors, radius, shadow, spacing, type } from '@/theme';

import type { Achievement } from '@/api/endpoints';

import { SectionTitle } from './Card';
import { ErrorState, Loading } from './States';
import { Disclosure } from './Disclosure';
import { Icon } from './Icon';

/**
 * A player's achievements on their profile: the earned ones, with when; the rest folded away
 * under "Still to earn", so a new player's profile is not a wall of locked tiles.
 */
export function Achievements({ username }: { username: string }) {
  const achievements = useAchievements(username);
  if (achievements.error !== null) {
    return (
      <>
        <SectionTitle>{t('Achievements')}</SectionTitle>
        <ErrorState error={achievements.error} onRetry={() => void achievements.refetch()} />
      </>
    );
  }
  if (achievements.data === undefined) {
    return (
      <>
        <SectionTitle>{t('Achievements')}</SectionTitle>
        <Loading label={t('Loading achievements')} />
      </>
    );
  }
  const list = achievements.data;
  if (list.length === 0) return null;
  const earned = list.filter((a) => a.earned_at !== null);
  const locked = list.filter((a) => a.earned_at === null);
  return (
    <>
      <SectionTitle>{t('Achievements')}</SectionTitle>
      <Text style={styles.count}>{achievementCount(list)}</Text>
      {earned.length > 0 && <Tiles list={earned} />}
      {locked.length > 0 && (
        <Disclosure title={t('Still to earn ({count})', { count: locked.length })}>
          <Tiles list={locked} />
        </Disclosure>
      )}
    </>
  );
}

function Tiles({ list }: { list: Achievement[] }) {
  return (
    <View style={styles.grid}>
      {list.map((a) => {
        const earned = a.earned_at !== null;
        const name = t(ACHIEVEMENTS[a.key].name);
        const text = t(ACHIEVEMENTS[a.key].text);
        return (
          <View
            key={a.key}
            style={styles.tile}
            accessible
            aria-label={t('{name}: {text} {when}', {
              name,
              text,
              when: earned ? earnedText(a.earned_at!) : t('Not yet earned'),
            })}
          >
            {/* Only the medal is dimmed while still to earn: the words stay readable. */}
            <View style={[styles.medal, earned ? styles.medalEarned : styles.locked]}>
              <Icon name="trophy" color={earned ? colors.accentText : colors.muted} size={20} />
            </View>
            <Text style={styles.name}>{name}</Text>
            <Text style={styles.text}>{text}</Text>
            {earned && <Text style={styles.when}>{earnedText(a.earned_at!)}</Text>}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  count: { ...type.caption, color: colors.muted, marginTop: -spacing.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    flexGrow: 1,
    flexBasis: 150,
    maxWidth: 240,
    gap: 2,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    ...shadow,
  },
  locked: { opacity: 0.55 },
  medal: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.subtle,
    marginBottom: spacing.xs,
  },
  medalEarned: { backgroundColor: colors.gold },
  name: { ...type.label, color: colors.text },
  text: { ...type.caption, color: colors.muted },
  when: { ...type.caption, color: colors.success },
});
