# Bahamut Notifier

Electron-based Windows desktop utility for viewing Bahamut notifications and subscriptions in a compact always-on-top panel.

## Completed Features

- Windows desktop floating panel fixed to the bottom-right corner
- System tray resident behavior
- Manual hide button in the top-right corner
- Built-in Bahamut login window
- Session-based notification and subscription fetching
- Auto refresh every 60 seconds
- Notification and subscription tab switching
- Show first 5 items by default, with expand/collapse support
- Clean notification text rendering with HTML tag cleanup
- Hero info panel with avatar, name, account, level, GP, coins, and donation
- Local default avatar image for logged-out state
- Logout flow that clears Bahamut cookies and persisted session data
- Hidden developer panel toggled with `F12`
- Hidden scrollbar with scrollable content
- Drag-to-scroll behavior for a more touch-like panel experience
- Unified tray icon and packaged app icon
- Windows packaging via `electron-builder`

## Data Sources

Notification data currently uses the same Bahamut navigation API endpoints used by the site UI:

- `type=0` for notifications
- `type=1` for subscriptions

Requests are executed from an authenticated Bahamut browser context with `credentials: "include"` instead of manually stitching together cookie headers.

## Run Locally

```powershell
cd <path-to-extracted-project>
npm.cmd install
npm.cmd start
```

After dependencies are installed once:

```powershell
npm.cmd start
```

## Build Windows Installer

```powershell
cd <path-to-extracted-project>
npm.cmd run dist
```

Build output will be generated in:

- `dist/`

## Usage

1. Start the app.
2. Click `登入` to sign in to Bahamut.
3. After login, the app will fetch notifications and subscriptions automatically.
4. Click the `通知` or `訂閱` cards to switch the active feed.
5. Click `更多` to expand longer lists, and `收合` to collapse them.
6. Click the hero profile card to open the Bahamut home page for that account.
7. Click `登出` to clear the current Bahamut session.
8. Click `×` to hide the app back to the system tray.

## Developer Mode

- Developer messages are hidden by default
- Press `F12` in the app window to toggle them
- The panel shows auth state, cookie names, API response summaries, and parse results

## Project Structure

- `main.js`: Electron main process, tray behavior, login/logout flow, cookie persistence
- `preload.js`: renderer bridge
- `src/services/bahamut-provider.js`: data normalization, fallback profile handling, notification cleanup
- `src/renderer/index.html`: UI structure
- `src/renderer/renderer.js`: interaction logic and scrolling behavior
- `src/renderer/styles.css`: visual styling and hidden-scroll layout
- `src/images/`: app icons and fallback avatar assets

## Notes

- The app depends on Bahamut's current login/session behavior and notification endpoints.
- If Bahamut changes the API or page structure, the integration may need updates.
- Session cookies are persisted locally to reduce repeated logins.
- Do not commit runtime-generated cookie files or private session data to a public repository.
