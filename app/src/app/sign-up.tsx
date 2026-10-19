import { useMutation } from '@tanstack/react-query';

import { useApi } from '@/auth/session';
import { AccountForm, type AccountDetails } from '@/components/AccountForm';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { TextLink } from '@/components/TextLink';

export default function SignUp() {
  const api = useApi();
  const register = useMutation({
    mutationFn: (details: AccountDetails) => api.register(details),
  });

  if (register.isSuccess) {
    return (
      <Screen title="Check your email" brand>
        <Notice tone="success">
          {`We sent a link to ${register.variables.email}. Open it to finish creating your account.`}
        </Notice>
        <TextLink href="/sign-in">Back to sign in</TextLink>
      </Screen>
    );
  }

  return (
    <Screen title="Create an account" brand>
      <AccountForm action={register} submitTitle="Create account" />
      <TextLink href="/sign-in">Already have an account? Sign in</TextLink>
    </Screen>
  );
}
