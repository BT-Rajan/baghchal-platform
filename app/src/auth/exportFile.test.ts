import { Share } from 'react-native';

import type { DataExport } from '@/api/endpoints';

import { exportFileName, saveExport } from './exportFile';

const DATA = {
  exported_at: '2026-10-17T12:00:00Z',
  account: {
    id: '00000000-0000-4000-8000-000000000001',
    username: 'alice',
    email: 'alice@example.com',
    created_at: '2026-01-01T12:00:00Z',
    email_verified_at: '2026-01-01T12:01:00Z',
    adult_from: null,
    parent_email: null,
    parent_consented_at: null,
  },
  consents: [],
  ratings: [],
  games: [],
  challenges: [],
  blocked_players: [],
  friends: [],
  notifications: [],
  chat_messages: [],
  sessions: [],
} satisfies DataExport;

test('the file is named after the player', () => {
  expect(exportFileName(DATA)).toBe('clawplay-alice.json');
});

test('the web downloads a JSON file', async () => {
  jest.useFakeTimers();
  const click = jest.fn();
  const remove = jest.fn();
  const link = { href: '', download: '', click, remove };
  const createElement = jest.fn(() => link);
  const appendChild = jest.fn();
  Object.assign(globalThis, { document: { createElement, body: { appendChild } } });
  const blobs: Blob[] = [];
  URL.createObjectURL = jest.fn((blob: Blob) => {
    blobs.push(blob);
    return 'blob:export';
  });
  URL.revokeObjectURL = jest.fn();

  await saveExport(DATA, 'web');
  expect(createElement).toHaveBeenCalledWith('a');
  expect(link).toMatchObject({ href: 'blob:export', download: 'clawplay-alice.json' });
  expect(appendChild).toHaveBeenCalledWith(link);
  expect(click).toHaveBeenCalled();
  expect(remove).toHaveBeenCalled();
  expect(URL.revokeObjectURL).not.toHaveBeenCalled(); // kept a moment for the download
  jest.advanceTimersByTime(60_000);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:export');
  jest.useRealTimers();
  expect(blobs[0]?.type).toBe('application/json');
  expect(JSON.parse(await blobs[0]!.text())).toEqual(DATA);
});

test('apps open the share sheet', async () => {
  const share = jest
    .spyOn(Share, 'share')
    .mockResolvedValue({ action: 'sharedAction', activityType: undefined });
  await saveExport(DATA, 'ios');
  expect(share).toHaveBeenCalledWith({
    title: 'clawplay-alice.json',
    message: JSON.stringify(DATA, null, 2),
  });
  share.mockRestore();
});
