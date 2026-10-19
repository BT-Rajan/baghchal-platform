import { useLocalSearchParams } from 'expo-router';

import { ChallengeForm } from '@/components/ChallengeForm';

export default function ChallengePlayer() {
  const { username } = useLocalSearchParams<{ username: string }>();
  return <ChallengeForm opponent={username} />;
}
