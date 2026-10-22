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
  `app/src/components/Confirm.tsx`, wrapping the button that asks (`<Confirm open={asking} …>
  <Button …/></Confirm>`): on the web the question replaces the button; in Android and iOS the
  button stays put under the apps' own dialog (the same component either way).
- **Show an error**: `app/src/components/ErrorNotice.tsx` (with its next step, where there is one).
- **Say an action succeeded, for a moment**: `<SuccessNotice>` from
  `app/src/components/Snackbar.tsx`: a success Notice in place on the web, the snackbar in the apps
  (above the tab bar and the keyboard, 4 s). What stays true for a while (a link sent, a challenge
  waiting) stays a Notice.
- **Look and feel**: the tokens in `app/src/theme.ts` (colours by role, the `type` scale,
  `radius`, `shadow`) and the shared components (`Button`, `Segmented`, `Card`, `Notice`,
  `Screen`, `Icon`, `IconButton`). One `primary` button per screen for its main action; other
  actions are `secondary`, utility toggles are an `IconButton`. No one-off colours, font sizes or
  icons in a screen; add a token or an icon to the shared set instead. A screen with a header bar
  does not repeat its title.

## The apps' JavaScript is not the browser's

Android and iOS run the app on Hermes, which lacks parts of what browsers and Node have and
formats through each phone's own libraries, so a call can pass every test and the web yet crash a
phone. The app uses no `Intl` and no `toLocale…String`: dates, times and amounts come from
`app/src/i18n/format.ts` (month names in the catalogs), plural forms from `pluralForm`. Lint
forbids the rest in `src`, the tests run with only Hermes's Intl (`tests/support/likeHermes.js`),
`tests/everyScreen.test.tsx` opens every screen in every language as on Android, and the APK
build checks the bundle (`scripts/check-hermes-bundle.mjs`). A new screen goes into that sweep;
check any newer JavaScript feature against Hermes before using it.

## CI is off

The project does not use the CI workflow (`.github/workflows/ci.yml`): never start it, and do
not wait for it before merging. Check changes locally instead (the server's ruff, mypy and
pytest; the app's typecheck, lint, format check and tests). The Android test build
(`.github/workflows/android.yml`) is separate and stays: it makes the APKs.
