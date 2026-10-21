# ClawPlay on Google Play: store listing and App Store Optimization

The listing text lives beside this file in the layout Google Play's upload tools read
(`<language>/title.txt`, `short_description.txt`, `full_description.txt`), so it can be
uploaded as is. `en-IN` is the main listing; other languages are listed under
[Languages](#languages).

| Field                  | Limit            | Now                              |
| ---------------------- | ---------------- | -------------------------------- |
| App name (`title.txt`) | 30 characters    | 26: "ClawPlay: Bagh Chal Online" |
| Short description      | 80 characters    | 75                               |
| Full description       | 4,000 characters | about 2,840                      |

## Before publishing: two Google Play rules (both met)

1. **The app must not send players to the website to pay.** Google Play's Payments policy
   does not let an app link to, or encourage, buying its digital features outside Google
   Play's billing. The apps' plans screen shows what Plus and Pro include, with no prices,
   buttons or mention of where to buy; players who already have a plan keep it (plans live
   on the server). Selling inside the app later would mean Google Play Billing, or Google's
   alternative billing programme for India if the account qualifies.
2. **Account deletion needs a web address as well as the in-app way.** It is
   `https://<the website>/delete-account`, for anyone, signed in or not; put it in Play
   Console → App content → Data safety.

## Keywords

Google Play has no keyword field: it reads the app name, the short description and the full
description. Each keyword below appears in those naturally, and none is repeated to stuff it.

- **Main:** Bagh Chal, Baghchal, Bagh-Chal (players search all three spellings), tigers and
  goats, tiger and goat game, board game, Nepal.
- **Intent:** online, play live, multiplayer, play with friends, rated, ratings, leaderboard,
  play the computer, daily puzzle, tournament.
- **Left out on purpose:**
  - Names of other hunt games such as Aadu Puli Aattam or Puli Meka. They are cousins of
    Bagh Chal with different rules, so using them would describe a game the app does not have.
  - Words like "best", "#1", "free" and "top", which Google's metadata policy forbids in the
    name and discourages elsewhere.
  - Other apps' names.

**Where ClawPlay is different:** the leading app, "BaghChal - Tigers and Goats", has over
500,000 installs and centres on play against the computer and on one device. Most other apps
are offline or computer-only. ClawPlay's strength is live play against real people: rated
two-game matches, ratings and leaderboards, friends and challenge links, and daily puzzles.
The name, the first line and the first screenshot all lead with that.

**One gap that costs searches:** competitors offer **two players on one phone** (pass and
play), and people search for it. ClawPlay has no such mode. Adding it later would let the
listing say so; until then, the listing does not claim it.

## Category and tags

- **Category:** Games → Board.
- **Tags** (Play Console → Store settings, up to five): Board, Strategy, Abstract strategy,
  Multiplayer, Classic.
- **Contact details:** the contact email from the server's settings, and the website.

## Graphics

- **App icon (512 × 512):** the claw mark from `assets/icon.png`, without the name; Google
  draws the name itself.
- **Feature graphic (1024 × 500):** the dark brand colour (`#2a1608`), the claw mark and
  "ClawPlay" on the left, a board mid-game on the right with tigers hemmed in by goats, and
  the line "Bagh Chal, live". Keep the middle clear of small text; Google may crop it.
- **Phone screenshots (eight, upright, 1080 × 1920 or larger):** each with a short caption
  above the screen, in the brand colours. In order:
  1. A live game against a real player, with clocks: "Play Bagh Chal live, against real
     people".
  2. Quick pairing with the time controls: "A game in seconds: quick, standard or sand clock".
  3. A rated match result and the rating change: "Rated matches: goats once, tigers once".
  4. The leaderboard: "Climb the leaderboard".
  5. Friends, with who is online, and a challenge: "Challenge your friends".
  6. A game against the Easy computer with the coach's tip: "Learn with the coach".
  7. The daily puzzle and its streak: "A new puzzle every day".
  8. The board and piece choices: "Make it yours".
- **Tablet screenshots:** the same eight on a 10-inch tablet, where the board sits beside the
  game panel. Play shows these to tablet users, and they help ranking there.
- Take screenshots from the release build with real-looking names and ratings, and nothing
  personal.

## Play Console forms

- **Content rating (IARC):** a board game with no violence. Answer **yes** to "users can
  interact" (chat and quick messages) and **yes** to "users can share personal information"
  only if the questionnaire counts chat that way. Expect a 3+ or 7+ rating, with "Users
  Interact".
- **Target audience:** 13 and over. ClawPlay refuses players under 13, so choose the 13–15,
  16–17 and 18+ groups and not the children's groups, which would bring in the Families
  policy.
- **Data safety:** describe what the privacy policy says:
  - Collected: email address, username, month and year of birth (to check age), a parent's
    email for players under 18, games played, chat messages (kept 30 days), and device
    connection details for security.
  - Not sold, and no advertising.
  - Encrypted in transit.
  - Deletion: in the app (Me → Settings → Delete account), and at `/delete-account` on the
    website.
  - Payments: none taken in the Android app.
- **Ads:** the app contains no ads.
- **App access:** reviewers can start as a guest. Give them a test account too, so they can
  see friends, ratings and chat.

## Languages

Write each language's listing with a native speaker rather than a machine translation; a
stilted listing loses more installs than it wins.

The app itself speaks English, Tamil, Hindi and Arabic (Settings → Language, or the phone's
language), so the listing should too, and should say so.

1. **en-IN** (done) and **en-US**: the same text works for both; copy the folder.
2. **hi-IN** (Hindi): India is where most players will come from.
3. **ta-IN** (Tamil).
4. **ar** (Arabic): screenshots taken in Arabic show the right-to-left layout.
5. **ne-NP** (Nepali): Bagh Chal is Nepal's game, and Nepali searches are there to win. The
   app does not speak Nepali yet, so its listing must not claim it.

## After launch

- **Store listing experiments** (Play Console): try the first screenshot and the short
  description first, since they decide most installs. Run one test at a time, for at least
  a week.
- **Ratings:** ask for a review with Google's in-app review prompt after a player wins a rated
  game or finishes a puzzle streak, not on first launch.
- **Watch:** store listing conversion rate, the searches that bring visitors (Play Console →
  Statistics → Acquisition), and crash-free sessions (Android vitals), which Google uses in
  ranking.
- **Keep the listing true:** when a feature changes, change the listing in the same change,
  as the product rules ask.
