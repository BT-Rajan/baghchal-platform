/**
 * Google's sign-in opens a browser, which tests cannot, so they get this stand-in (Jest uses a
 * mock beside node_modules for every test without being told). Prompting answers at once with
 * `nextAnswer` (a signed-in Google account's ID token, unless a test says otherwise); tests can
 * inspect the calls.
 */
import { useState } from 'react';

type Answer = { type: 'success'; params: { id_token: string } } | { type: 'error'; params: object };

export const mockGoogle = {
  config: jest.fn(),
  prompt: jest.fn(),
  nextAnswer: { type: 'success', params: { id_token: 'google-id-token' } } as Answer,
};

export function useIdTokenAuthRequest(config: object) {
  mockGoogle.config(config);
  const [response, setResponse] = useState<Answer | null>(null);
  const prompt = async () => {
    mockGoogle.prompt();
    setResponse(mockGoogle.nextAnswer);
    return mockGoogle.nextAnswer;
  };
  return [{}, response, prompt] as const;
}
