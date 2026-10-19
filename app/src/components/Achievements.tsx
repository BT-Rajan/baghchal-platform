import { StyleSheet, Text, View } from 'react-native';

import { ACHIEVEMENTS, achievementCount, earnedText } from '@/lobby/achievements';
import { useAchievements } from '@/lobby/hooks';
import { colors, radius, shadow, spacing, type } from '@/theme';

import { SectionTitle } from './Card';
import { Icon } from './Icon';

/** A player's achievements on their profile: earned ones first, with when; then the rest. */
export function Achievements({ username }: { username: string }) {
  const achievements = useAchievements(username);
  const list = achievements.data ?? [];
  if (list.length === 0) return null;
  const sorted = [...list].sort(
    (a, b) => Number(a.earned_at === null) - Number(b.earned_at === null),
  );
  return (
    <>
      <SectionTitle>Achievements</SectionTitle>
      <Text style={styles.count}>{achievementCount(list)}</Text>
      <View style={styles.grid}>
        {sorted.map((a) => {
          const earned = a.earned_at !== null;
          const { name, text } = ACHIEVEMENTS[a.key];
          return (
            <View
              key={a.key}
              style={[styles.tile, !earned && styles.locked]}
              accessible
              aria-label={`${name}: ${text} ${earned ? earnedText(a.earned_at!) : 'Not yet earned'}`}
            >
              <View style={[styles.medal, earned && styles.medalEarned]}>
                <Icon name="trophy" color={earned ? colors.accentText : colors.muted} size={20} />
              </View>
              <Text style={styles.name}>{name}</Text>
              <Text style={styles.text}>{text}</Text>
              {earned && <Text style={styles.when}>{earnedText(a.earned_at!)}</Text>}
            </View>
          );
        })}
      </View>
    </>
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
