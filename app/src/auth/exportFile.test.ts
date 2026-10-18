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
  },
  ratings: [],
  games: [],
  challenges: [],
  blocked_players: [],
  sessions: [],
} satisfies DataExport;

test('the file is named after the player', () => {
  expect(exportFileName(DATA)).toBe('clawplay-alice.json');
});

test('the web downloads a JSON file', async () => {
  const click = jest.fn();
  const link = { href: '', download: '', click };
  const createElement = jest.fn(() => link);
  Object.assign(globalThis, { document: { createElement } });
  const blobs: Blob[] = [];
  URL.createObjectURL = jest.fn((blob: Blob) => {
    blobs.push(blob);
    return 'blob:export';
  });
  URL.revokeObjectURL = jest.fn();

  await saveExport(DATA, 'web');
  expect(createElement).toHaveBeenCalledWith('a');
  expect(link).toMatchObject({ href: 'blob:export', download: 'clawplay-alice.json' });
  expect(click).toHaveBeenCalled();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:export');
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
