import type { Challenge } from '@/api/endpoints';
import { t } from '@/i18n';

import { Notice } from './Notice';

/** A challenge of mine that was turned down or ran out: said, rather than silently dropped. */
export function ChallengeOutcome({ challenge }: { challenge: Challenge }) {
  const name = challenge.opponent?.username ?? '';
  return (
    <Notice tone="info">
      {challenge.status === 'declined'
        ? t('{name} declined your challenge', { name })
        : t('Your challenge to {name} expired', { name })}
    </Notice>
  );
}
