# Chess Arena — Firebase website starter

A responsive chess website starter with Firebase email/password accounts, a dark blue chess-themed landing page, four-language UI shell (English, Indonesian, Japanese, Korean), chess board rules powered by chess.js, AI difficulty selector, custom room-code UI, player chat tabs, admin panel, and live announcement popup.

## Important scope note
This is a starter/MVP, not a production-ready Chess.com clone. The local board supports legal chess moves and check/checkmate/draw detection. Easy AI is random; Medium/Hard/Impossible currently use a simple capture/check-priority heuristic and are **not** strong chess engines. Ranked/Classic now include a client-side realtime queue, and Custom room moves sync between devices through Realtime Database. This is an MVP implementation: queue coordination and move validation are client-side and are not safe against cheating or race abuse. Ranked ELO awards are not yet server-verified. Global/Local/Friends are separate chat feeds, but Local and Friends are not yet filtered to real geography/friend lists. User search/moderation is a client-side admin UI and should be moved to a trusted backend before public launch.

## 1. Create Firebase project
1. Open https://console.firebase.google.com/ and create a project.
2. Add a Web App and copy its Firebase config.
3. In **Authentication → Sign-in method**, enable **Email/Password**.
4. Create **Realtime Database**.
5. Open `app.js`, replace the placeholder values in `firebaseConfig` with your actual config.
6. In Realtime Database → Rules, paste `database.rules.json` and publish. Review rules carefully before production; rules are a baseline for this demo, not a substitute for a security audit.
7. Create your first account through the website. In Realtime Database, open `users/<your Firebase UID>` and change `role` from `player` to `admin`. Refresh the site.

## 2. Run/deploy
Because this uses JavaScript modules, open it through a local web server rather than `file://`.
- Quick local test: VS Code Live Server, or `python -m http.server 8000` from this folder.
- Firebase Hosting: install Firebase CLI, run `firebase login`, `firebase init hosting`, select this folder as the public directory, then `firebase deploy`.
- GitHub Pages can also host the static files after Firebase config is set.

## Features currently included
- Firebase Authentication: email/password sign-up and login.
- Realtime Database player profile with initial ELO 20 and role/status fields.
- Responsive dark chess-themed home/dashboard.
- English, Indonesian, Japanese, Korean UI string switcher (some dynamically generated game/setup copy remains English).
- Legal local chess moves, promotion to queen, check, checkmate and draw display.
- AI mode selector (Easy / Medium / Hard / Impossible heuristic demo).
- Custom offers two choices: local two-player on one device, or online room create/join with realtime board synchronization. Ranked and Classic queue for another connected player and open an online board when matched. Settings include account display-name updates, password changes (current password required), and match history.
- Global/Local/Friends chat feeds using Realtime Database.
- Admin UI gated by `users/<uid>/role === "admin"` for user profile status actions and live announcements.
- Live announcement popup for signed-in clients.

## Security and production requirements
- Do **not** put service-account keys or Admin SDK credentials in browser JavaScript.
- For real permanent bans/suspensions, deleting Firebase Auth accounts, enforcing suspension on every request, and secure ranked ELO, implement Firebase Cloud Functions or another trusted backend using the Firebase Admin SDK. The browser cannot securely delete Auth accounts for arbitrary users.
- The demo `database.rules.json` allows authenticated users to read profiles only through admin access or their own profile. This means an admin's broad user-list query needs rules that explicitly authorize the admin at `/users`; the current `.read` declaration is intended for admin-only list access. Validate rules in the Firebase Rules Simulator before production.
- Add rate limits, profanity/spam controls, report/block tools, privacy policy, age-appropriate community safeguards, and moderation audit logs before enabling public chat.
- For competitive online chess, use server-side move validation, room membership checks, reconnect handling, clocks, draw offers, resign/result verification, anti-cheat measures, and a real chess engine such as Stockfish running in a suitable worker/server.


## Troubleshooting login
- In Firebase Console → Authentication → Sign-in method, enable **Email/Password**.
- If the page says `auth/invalid-credential`, use the exact same email and password used during sign-up; Firebase passwords are case-sensitive.
- If the account was created but the dashboard does not open, check **Realtime Database → Rules** and publish the rules from `database.rules.json`. The signed-in user must be allowed to read/write `users/<their UID>`.
- Confirm the website's `firebaseConfig` points to the same Firebase project where the account was created.
- The updated `app.js` displays a more specific error when Firebase Authentication or the profile database fails. Open browser developer tools if the issue persists.


## Settings and Custom modes
- Custom → **Main di satu perangkat** starts a local two-player board with no ELO shown or changed.
- Custom → **Buat room online** creates a room code; the other player chooses Custom and joins with that code from their own device.
- Settings lets users change their display name, change their password after re-authenticating with the current password, and view saved match history.
- The updated `database.rules.json` supports history reads/writes for the signed-in owner and allows a guest to join a waiting room. Publish the entire rules file in Firebase Console for these changes to take effect.

## Online multiplayer setup (important)
- Publish the updated `database.rules.json` in Firebase Realtime Database → Rules.
- Deploy the updated `app.js`, `index.html`, `style.css`, and rules file together. Both players must use the same Firebase project and current deployed version.
- Custom: one player chooses Custom → Create online room and shares the code; the other chooses Custom and joins with that code. Moves should sync live.
- Ranked/Classic: both players select the same mode while online; they are matched from the realtime queue. The queue is a prototype, not production-secure.
- The current rules allow authenticated clients to write matchmaking queue data and do not enforce legal moves at the database layer. For a public competitive game, move matchmaking and result/ELO verification to Firebase Cloud Functions or another trusted server.
- Chat messages now show the sender ELO captured when the message is sent. Existing old messages may not have ELO and display 20 by default.
