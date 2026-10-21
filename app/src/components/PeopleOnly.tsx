import type { ReactNode } from 'react';

import type { Me } from '@/api/endpoints';
import { useMe } from '@/auth/session';
import { t } from '@/i18n';

import { Notice } from './Notice';

/** Why someone may not play other people yet (the server's `plays_people`), or null if they may. */
export function whyNotPeople(me: Me): string | null {
  if (me.plays_people) return null;
  return me.role === 'guest'
    ? t(
        'Under 18, a guest can play the computer and puzzles. To play other people, make a free account: a parent or guardian is asked to agree.',
      )
    : t(
        'A parent or guardian has to agree before you play other people. We emailed them a link; until they open it you can play the computer and puzzles.',
      );
}

/**
 * The one gate for anything played with other people (challenges, quick pairing, tournaments):
 * what it guards, or why it is not open yet. The server enforces the same rule.
 */
export function PeopleOnly({ children }: { children: ReactNode }) {
  const why = whyNotPeople(useMe());
  return why === null ? children : <Notice tone="info">{why}</Notice>;
}
