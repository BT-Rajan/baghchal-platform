import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { SessionProvider } from '@/auth/session';
import { ResendConfirmation } from '@/components/ResendConfirmation';

import { error, fakeServer, type Route } from './support/fakeServer';
import { memoryTokenStore } from './support/memoryTokenStore';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));

async function show(resend: Route) {
  const server = fakeServer({ 'POST /api/v1/auth/verify-email/resend': resend });
  const queryClient = new QueryClient();
  await render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider
        baseUrl="http://localhost:8000"
        queryClient={queryClient}
        tokenStore={memoryTokenStore()}
        fetch={server.fetch}
      >
        <ResendConfirmation email=" alice@example.com " />
      </SessionProvider>
    </QueryClientProvider>,
  );
  return server;
}

describe('a confirmation link that went missing', () => {
  test('can be sent again', async () => {
    const server = await show({ status: 202, body: { status: 'accepted' } });
    await fireEvent.press(screen.getByRole('button', { name: 'Send the link again' }));
    expect(await screen.findByText('Link sent to alice@example.com.')).toBeOnTheScreen();
    expect(server.lastTo('POST /api/v1/auth/verify-email/resend').body).toEqual({
      email: 'alice@example.com',
    });
  });

  test('a refusal is shown', async () => {
    await show(error(429, 'rate_limited', 'Slow down.'));
    await fireEvent.press(screen.getByRole('button', { name: 'Send the link again' }));
    expect(await screen.findByText('Slow down.')).toBeOnTheScreen();
  });
});
