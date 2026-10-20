/**
 * The small part of Markdown the legal texts use (server legal/texts): headings (`#`, `##`),
 * paragraphs, lists (`- `) and **bold**. Parsed into blocks the app draws with its own
 * components, so no HTML is ever rendered from text.
 */

export type Span = { text: string; bold: boolean };

export type Block =
  | { kind: 'title'; text: string }
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; spans: Span[] }
  | { kind: 'list'; items: Span[][] };

/** Splits `a **b** c` into plain and bold runs. */
export function spans(text: string): Span[] {
  return text
    .split('**')
    .map((part, i) => ({ text: part, bold: i % 2 === 1 }))
    .filter((span) => span.text !== '');
}

export function parse(markdown: string): Block[] {
  const blocks: Block[] = [];
  let list: Span[][] | null = null;
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', spans: spans(paragraph.join(' ')) });
    paragraph = [];
    if (list) blocks.push({ kind: 'list', items: list });
    list = null;
  };
  for (const raw of markdown.split('\n')) {
    const line = raw.trim();
    if (line === '') {
      flush();
    } else if (line.startsWith('## ')) {
      flush();
      blocks.push({ kind: 'heading', text: line.slice(3) });
    } else if (line.startsWith('# ')) {
      flush();
      blocks.push({ kind: 'title', text: line.slice(2) });
    } else if (line.startsWith('- ')) {
      if (paragraph.length) flush();
      list = list ?? [];
      list.push(spans(line.slice(2)));
    } else {
      if (list) flush();
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}

/** What is under a heading: everything but headings. */
export type Body = Exclude<Block, { kind: 'heading' }>;

export type Section = { heading: string; blocks: Body[] };

/**
 * The blocks before the first `##` heading (the title and what it says first), and each
 * `##` section with its blocks, so a page can show a long text a section at a time.
 */
export function sections(blocks: Block[]): { intro: Body[]; sections: Section[] } {
  const intro: Body[] = [];
  const out: Section[] = [];
  for (const block of blocks) {
    if (block.kind === 'heading') out.push({ heading: block.text, blocks: [] });
    else (out.at(-1)?.blocks ?? intro).push(block);
  }
  return { intro, sections: out };
}
