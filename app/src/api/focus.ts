/**
 * In apps, tell TanStack Query when the app comes to the foreground, so stale data is fetched
 * again (browsers report focus by themselves). Returns a function that stops listening.
 */
import { focusManager } from '@tanstack/react-query';
import { AppState, Platform, type AppStateStatus } from 'react-native';

export function followAppFocus(os: string = Platform.OS): () => void {
  if (os === 'web') return () => {};
  const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
    focusManager.setFocused(state === 'active');
  });
  return () => subscription.remove();
}
