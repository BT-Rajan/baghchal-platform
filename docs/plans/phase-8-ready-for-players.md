# Phase 8 plan: the rest of "Ready for players"

Status: step 1 done (server and app); steps 2–3 to come. Push notifications are not planned
for now (dropped 2026-10-19): the in-app notifications (the bell) stay the only kind. Rebased on `main` after PRs #29–#31
(friends, in-app notifications, challenges by link replacing private rooms); the age rule covers
every way to meet another player: challenges (by name and by link), quick pairing, tournaments
and friend requests. In the app, step 1 extends `AccountForm` (sign-up and a guest's claim)
with the age and agreement fields, moves "Play now" from one tap to a short `/start` form (the
age is needed first), extends `GuestBanner` with the waiting-for-a-parent notice, and uses
`Confirm` for a parent's refusal. The accounts, moderation, operations, fair-play and
security-review parts of Phase 8 are already on `main`. What is left before a public launch:

1. Privacy policy and terms of service, with the consent and age rules they promise.
2. Store builds for Android and iOS, made on our own machines or in GitHub Actions, never in
   Expo's cloud ([ADR 0002](../adr/0002-no-dependency-on-expo-cloud.md)).
3. Testing on real phones and tablets. This needs you and real devices; this phase prepares
   the checklist and the builds to test.

## Decisions taken
- **Operator:** an Indian company. Its name, registered address, contact and grievance officer
  are filled in later. They are marked `[…]` in the pages and listed in one settings file, so
  nothing is hard-coded twice.
- **Law:** India's Digital Personal Data Protection Act 2023 (DPDP) and the IT Rules 2021, as
  the operator's home law. The GDPR and UK GDPR rights are added for players in Europe, since
  anyone may play.
- **Minimum age: 13.**

> **To settle with your lawyer before launch:** under the DPDP Act, anyone under 18 is a child,
> and processing their personal data needs *verifiable* consent from a parent or guardian. It
> also forbids tracking, behavioural monitoring and targeted advertising of children. A 13+
> service therefore has to collect that consent for players aged 13 to 17. This plan builds a
> parent-consent step for them (below). How strong the verification must be (the DPDP Rules
> 2025 allow, for example, checks against identity details the parent already holds) is a legal
> call. The step is built so a stronger check can be added without changing anything else.

## 1. Privacy policy and terms
**Pages:**
- `/privacy` and `/terms` in the app (web, iOS, Android), readable signed in or out.
- Linked from the welcome page, sign-up, the "Me" tab and the site footer.
- Each page shows the version and its effective date.

**Content of the privacy policy, written from what the platform actually stores** (each item
checked against the models):
- **Account:** username, email, password hash, sessions with IP addresses.
- **Play:** games, moves with timings, ratings, presence, challenges.
- **Moderation:** reports, actions, and fair-play figures (automatic checks of rated games).
- **Payments:** Razorpay order and payment IDs. Card details never reach us.
- **Technical:** logs and error reports. Error reports carry no personal data.
- **Also covered:**
  - purposes and legal grounds;
  - who data is shared with: Razorpay, the email provider, hosting;
  - where it is stored, and transfers abroad;
  - how long each kind of data is kept (stated and enforced, see below);
  - player rights: access (export), correction, erasure (delete account), grievance, and
    complaints to the Data Protection Board of India or a European authority;
  - children, cookies (only the session cookie: no analytics or advertising), changes, and
    contact.

**Terms:**
- eligibility and age, the account and its security;
- fair play (engine use, multiple accounts, abuse) and moderation;
- plans and payments: what Plus and Pro include, renewal, refunds, taxes;
- intellectual property, availability, limitation of liability;
- termination, governing law (India) and disputes;
- the grievance officer, with acknowledgement within 24 hours and resolution within 15 days
  (IT Rules).

**Consent records:**
- Sign-up requires accepting the current terms and privacy policy. The server stores which
  versions were accepted, and when, in a new `consents` table.
- When a version changes, signed-in players see the change once and must accept to keep
  playing; their data stays theirs either way.

**Age:**
- Sign-up asks for the year of birth (not the full date: we need no more).
- **Under 13:** refused.
- **13 to 17:** the account starts in a `pending_parent` state. A parent or guardian's email is
  asked for, and they get a link to read the policy and consent, or refuse.
- Until a parent consents, the young player can play only against the computer, with no chat,
  no rated games and no leaderboard listing. Without consent within 7 days, the
  account and its data are deleted.
- A parent can withdraw consent later, which deletes the account.
- Child accounts are never part of fair-play timing analysis beyond what rated play needs. We
  do no advertising or behavioural tracking for anyone, so nothing else changes.

**Retention:** a nightly job enforces the periods the policy states (exact numbers to be
confirmed):
- sessions: 30 days after expiry;
- IP addresses: 90 days;
- unfinished sign-ups: 7 days;
- deleted accounts: removed at once, except what law requires (payment records: 8 years,
  for Indian tax law).

## 2. Store builds without Expo's cloud
- `npx expo prebuild` generates `android/` and `ios/` in CI only; they are never committed.
- **Android (GitHub Actions, Ubuntu):**
  - Gradle builds a release AAB for Play and an APK for direct testing.
  - Signing comes from repository secrets (the keystore in base64, plus its passwords).
  - Without secrets, it builds an unsigned APK, so the pipeline is tested on every run.
- **iOS (GitHub Actions, macOS):**
  - `xcodebuild` builds for the simulator on every run, with no secrets.
  - fastlane `match` (certificates in a private git repo we own) signs and uploads to
    TestFlight when the App Store Connect API key secrets are set.
- **Versions:** taken from a tag (`app-v1.2.3`), with the build number from the run number.
- **Store listings:** texts, privacy labels (Apple's privacy "nutrition label", Google's data
  safety form) and screenshots are drafted from the privacy policy, so they agree.
- **Over-the-air updates:** none in this phase; every release goes through the stores. (Our
  own update server stays a later option.)
- **Guardrail:** CI also fails if an `eas.json` appears or a build step calls EAS.

## 3. Real devices
`docs/device-testing.md` is a checklist to run on a recent and an old Android phone, an iPhone
and an iPad. It covers:
- install from the internal test track or TestFlight;
- sign up (including the parent flow), play a live game on two devices, a challenge by link, a
  rated match and game 2;
- reconnecting after flight mode or switching apps;
- notifications (the bell) after time away from the app;
- payments in Razorpay's test mode;
- accessibility (screen readers, font scaling), small and large screens, and dark rooms.

Each run's results go into the same file.

## What you need to provide (none of it blocks the code)
- Company name, registered address, contact email and grievance officer.
- Google Play developer account, and an upload keystore (or let CI generate one that you
  keep).
- Apple Developer Program membership, an App Store Connect API key and a private repository
  for `match`.
- A lawyer's review of the two pages and the children's-data approach.

## Delivery steps
1. Legal pages and settings, consent records, the age and parent-consent flow, retention job.
2. Build pipeline: prebuild, Android and iOS jobs, signing when secrets exist, guardrail.
3. Store listing drafts and the device-testing checklist.
4. Docs (README, operations, SECURITY), tests at 100% server and logic coverage, CI.
