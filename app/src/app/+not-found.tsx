import { Stack } from 'expo-router';

import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { TextLink } from '@/components/TextLink';

export default function NotFound() {
  return (
    <Screen title="Page not found">
      <Stack.Screen options={{ title: 'Page not found' }} />
      <Notice tone="info">There is nothing at this address.</Notice>
      <TextLink href="/">Go to the lobby</TextLink>
    </Screen>
  );
}
