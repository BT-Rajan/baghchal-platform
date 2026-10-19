# ClawPlay: rules for every change

## Product rules (strict)

1. **No duplicate or redundant features.** One thing, one place. If the app already does
   something (an upsell, a setting, a way to start a game, a form), use it; never build a second
   version beside it.
2. **Every feature is either new or an extension of an existing one.** It must never conflict
   with or contradict another: no two settings for the same thing, no two flows that disagree,
   no two sources of truth, no wording or behaviour in one place that another place denies.

## How to keep them

- **Before building**, search for what already exists (screens in `app/src/app`, components in
  `app/src/components`, server modules in `server/src/baghchal_server`) and say in the plan
  whether the work is *new* or *extends X*.
- **Extend, don't copy.** A second screen that needs an existing form, card, board or flow
  reuses the same component or endpoint. Copying code to change it slightly is duplication.
- **One source of truth** per piece of state: a setting lives in one place (server or device,
  not both); one endpoint answers each question.
- **One pattern per job**: one way to upsell a paid feature, one way to confirm a destructive
  action, one way to show an error, one way to share a link.
- **If the new work overlaps something**, resolve it first: merge the two, or extend the old one
  and remove what it replaces, in the same change. Never leave both.
- **The PR description states** which existing feature the change extends (or that it is new)
  and anything it replaces.

## The patterns that exist (use these)

- **Upsell** a paid feature: `app/src/components/Upsell.tsx` (`<Upsell feature="…">what it
  does</Upsell>`). It names the plan from the server's plans; never write your own notice,
  card or "See plans" link.
- **Appearance, sound and quick-message settings**: the server's appearance (`PATCH
  /me/appearance`, sending only what changes); nothing about them is kept on the device.
- **A new account's username, email and password**: `app/src/components/AccountForm.tsx`,
  given the action that sends it (signing up, a guest making their account).
- **Start a game with a particular person**: a challenge, by name (`/challenge/[username]`) or by
  link (`/invite`), both from `app/src/components/ChallengeForm.tsx` and `POST /challenges`.
- **Share a link**: `shareLink` in `app/src/lobby/format.ts`.
- **Confirm an action that is hard to undo** (resign, block, leave a live game):
  `app/src/components/Confirm.tsx`, shown in place of the button that asked.
- **Look and feel**: the tokens in `app/src/theme.ts` (colours by role, the `type` scale,
  `radius`, `shadow`) and the shared components (`Button`, `Segmented`, `Card`, `Notice`,
  `Screen`, `Icon`, `IconButton`). One `primary` button per screen for its main action; other
  actions are `secondary`, utility toggles are an `IconButton`. No one-off colours, font sizes or
  icons in a screen; add a token or an icon to the shared set instead. A screen with a header bar
  does not repeat its title.
