import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform, Share } from 'react-native';

import { ShareButton, canCopy, canShare, copyText } from './ShareButton';

type Global = { navigator?: unknown; document?: unknown };
const g = globalThis as Global;
const realDocument = g.document;

afterEach(() => {
  jest.restoreAllMocks();
  delete g.navigator;
  g.document = realDocument;
  Platform.OS = 'ios';
});

function abort(): Error {
  const error = new Error('The user cancelled');
  error.name = 'AbortError';
  return error;
}

test('the apps always have a share sheet; browsers only when they offer one', () => {
  expect(canShare('ios')).toBe(true);
  expect(canShare('android')).toBe(true);
  expect(canShare('web')).toBe(false);
  g.navigator = { share: () => Promise.resolve() };
  expect(canShare('web')).toBe(true);
});

test('shares the full address', async () => {
  const share = jest
    .spyOn(Share, 'share')
    .mockResolvedValue({ action: 'sharedAction', activityType: undefined });
  await render(<ShareButton path="/tournament/cup1" title="Share the tournament" />);
  await fireEvent.press(screen.getByRole('button', { name: 'Share the tournament' }));
  expect(share).toHaveBeenCalledWith({ url: 'http://localhost:8000/tournament/cup1' });
  expect(screen.queryByRole('alert')).toBeNull();
});

test('closing the share sheet is not a failure; a real failure is said', async () => {
  const share = jest.spyOn(Share, 'share').mockRejectedValueOnce(abort());
  await render(<ShareButton path="/c/abc" />);
  await fireEvent.press(screen.getByRole('button', { name: 'Share the link' }));
  expect(screen.queryByRole('alert')).toBeNull();
  share.mockRejectedValueOnce(new Error('no'));
  await fireEvent.press(screen.getByRole('button', { name: 'Share the link' }));
  expect(
    await screen.findByText('The link could not be shared. Select it to copy it instead.'),
  ).toBeOnTheScreen();
});

test('android shares the address as a message', async () => {
  Platform.OS = 'android';
  const share = jest
    .spyOn(Share, 'share')
    .mockResolvedValue({ action: 'sharedAction', activityType: undefined });
  await render(<ShareButton path="/c/abc" variant="primary" />);
  await fireEvent.press(screen.getByRole('button', { name: 'Share the link' }));
  expect(share).toHaveBeenCalledWith({ message: 'http://localhost:8000/c/abc' });
});

describe('a browser without a share sheet', () => {
  beforeEach(() => {
    Platform.OS = 'web';
  });

  test('copies the link instead, and says so', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    g.navigator = { clipboard: { writeText } };
    expect(canCopy()).toBe(true);
    await render(<ShareButton path="/c/abc" />);
    await fireEvent.press(screen.getByRole('button', { name: 'Copy the link' }));
    expect(writeText).toHaveBeenCalledWith('http://localhost:8000/c/abc');
    expect(await screen.findByText('Copied')).toBeOnTheScreen();
  });

  test('a copy that fails is said', async () => {
    g.navigator = { clipboard: { writeText: jest.fn().mockRejectedValue(new Error('denied')) } };
    await render(<ShareButton path="/c/abc" />);
    await fireEvent.press(screen.getByRole('button', { name: 'Copy the link' }));
    expect(
      await screen.findByText('The link could not be copied. Select it to copy it instead.'),
    ).toBeOnTheScreen();
  });

  test('nothing is offered where nothing can share or copy', async () => {
    g.navigator = {};
    g.document = undefined;
    expect(canCopy()).toBe(false);
    await render(<ShareButton path="/c/abc" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('the older copy command', () => {
  function page(copied: boolean) {
    const field = { value: '', style: {}, setAttribute: jest.fn(), select: jest.fn() };
    const body = { appendChild: jest.fn(), removeChild: jest.fn() };
    g.document = {
      createElement: () => field,
      body,
      execCommand: jest.fn(() => copied),
    };
    return { field, body };
  }

  test('copies through a hidden field, then removes it', async () => {
    g.navigator = {};
    const { field, body } = page(true);
    expect(canCopy()).toBe(true);
    await copyText('hello');
    expect(field.value).toBe('hello');
    expect(field.select).toHaveBeenCalled();
    expect(body.removeChild).toHaveBeenCalledWith(field);
  });

  test('a refused copy fails', async () => {
    g.navigator = {};
    page(false);
    await expect(copyText('hello')).rejects.toThrow('copy refused');
  });
});
