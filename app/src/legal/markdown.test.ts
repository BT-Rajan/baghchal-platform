import { parse, spans } from './markdown';

test('bold runs', () => {
  expect(spans('a **b** c')).toEqual([
    { text: 'a ', bold: false },
    { text: 'b', bold: true },
    { text: ' c', bold: false },
  ]);
  expect(spans('**all**')).toEqual([{ text: 'all', bold: true }]);
});

test('the blocks the legal texts use', () => {
  const text = [
    '# Privacy policy',
    '',
    'First line',
    'continues here.',
    '## What we collect',
    '**Your account**',
    '- one',
    '- **two** things',
    'After the list.',
    '',
    '- alone',
  ].join('\n');
  expect(parse(text)).toEqual([
    { kind: 'title', text: 'Privacy policy' },
    { kind: 'paragraph', spans: [{ text: 'First line continues here.', bold: false }] },
    { kind: 'heading', text: 'What we collect' },
    { kind: 'paragraph', spans: [{ text: 'Your account', bold: true }] },
    {
      kind: 'list',
      items: [
        [{ text: 'one', bold: false }],
        [
          { text: 'two', bold: true },
          { text: ' things', bold: false },
        ],
      ],
    },
    { kind: 'paragraph', spans: [{ text: 'After the list.', bold: false }] },
    { kind: 'list', items: [[{ text: 'alone', bold: false }]] },
  ]);
});
