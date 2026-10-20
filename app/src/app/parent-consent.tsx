import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import type { ParentLink } from '@/api/endpoints';
import { describeError } from '@/api/errors';
import { useApi } from '@/auth/session';
import { isLinkToken } from '@/auth/validation';
import { Button } from '@/components/Button';
import { Hint } from '@/components/Card';
import { Confirm } from '@/components/Confirm';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { Loading } from '@/components/States';
import { TextLink } from '@/components/TextLink';

/**
 * Opened from the email to a player's parent or guardian: `/parent-consent?token=…`. They agree,
 * which lets the player play other people, or refuse, which deletes the account. The same link
 * withdraws an agreement given earlier, until the player turns 18.
 */
export default function ParentConsent() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const api = useApi();
  const valid = isLinkToken(token);
  const lookUp = useMutation({ mutationFn: (linkToken: string) => api.parentLookUp(linkToken) });
  const decide = useMutation({
    mutationFn: (decision: 'agree' | 'refuse') => api.parentDecide(token ?? '', decision),
  });
  const [refusing, setRefusing] = useState(false);
  const asked = useRef(false);

  useEffect(() => {
    if (valid && !asked.current) {
      asked.current = true;
      lookUp.mutate(token);
    }
  }, [valid, token, lookUp]);

  if (!valid || lookUp.isError) {
    return (
      <Screen title="A parent's agreement" brand>
        <Notice tone="error">
          {valid ? describeError(lookUp.error) : 'This link is invalid or has expired.'}
        </Notice>
        <TextLink href="/privacy">Our privacy policy</TextLink>
      </Screen>
    );
  }
  const link: ParentLink | undefined = decide.data ?? lookUp.data;
  if (link === undefined) {
    return (
      <Screen title="A parent's agreement" brand>
        <Loading />
      </Screen>
    );
  }
  if (link.status === 'deleted') {
    return (
      <Screen title="The account is deleted" brand>
        <Notice tone="success">
          {`${link.username}'s account and what it held are deleted. Thank you for letting us know.`}
        </Notice>
      </Screen>
    );
  }

  const refuse = refusing ? (
    <Confirm
      question={`Delete ${link.username}'s account? Their games and everything in the account are removed, and this cannot be undone.`}
      confirmTitle="Delete the account"
      busy={decide.isPending}
      onConfirm={() => decide.mutate('refuse')}
      onCancel={() => setRefusing(false)}
    />
  ) : (
    <Button
      title={link.status === 'given' ? 'Withdraw my agreement' : 'I do not agree'}
      variant="secondary"
      onPress={() => setRefusing(true)}
    />
  );

  return (
    <Screen title="A parent's agreement" brand>
      {decide.isError && <Notice tone="error">{describeError(decide.error)}</Notice>}
      {link.status === 'given' ? (
        <Notice tone="success">
          {`You agreed: ${link.username} can play other people on ClawPlay. You can withdraw at any time until they turn 18, which deletes their account.`}
        </Notice>
      ) : (
        <>
          <Hint>
            {`${link.username} made a ClawPlay account and told us they are under 18. ClawPlay is an online game of Bagh Chal: players play the computer, and with your agreement, other people (live games, friends, tournaments and short preset messages; free chat is only between adults, never with players under 18).`}
          </Hint>
          <Hint>
            If you agree, they can play other people. If you do not, we delete their account. Until
            you answer they can play only the computer, and if no one answers within 7 days the
            account is deleted.
          </Hint>
          <TextLink href="/privacy">What we keep about them: our privacy policy</TextLink>
          <Button
            title="I agree"
            busy={decide.isPending && decide.variables === 'agree'}
            onPress={() => decide.mutate('agree')}
          />
        </>
      )}
      {refuse}
    </Screen>
  );
}
