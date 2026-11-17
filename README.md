# Habits

A simple, private habit tracker you install on your iPhone home screen. No account, no server: all data stays on the phone.

## Features

- Tap any of the last 7 days to check a habit off (or undo it)
- Daily habits, or a weekly goal (1, 3 or 5 times a week)
- Streaks, a daily progress ring, and a 16-week history you can tap to fix past days
- Pick an emoji and a color for each habit
- Works offline, follows light/dark mode
- Export and import backups as JSON (Settings, the ⋯ button)

## Run it locally

No build step. Serve the folder:

```bash
python3 -m http.server 8765
```

Then open http://localhost:8765.

## Put it on your iPhone

iOS only installs web apps over HTTPS, so host it somewhere first. GitHub Pages is free:

1. Push this repo to GitHub.
2. Repo **Settings → Pages → Build and deployment**: Source "Deploy from a branch", branch `main`, folder `/ (root)`.
3. On your iPhone, open `https://<your-username>.github.io/habit-tracker/` in **Safari**.
4. Tap **Share → Add to Home Screen**.

It now opens full-screen like a native app and works without a connection.

## Your data

Data lives in the browser storage for the installed app on that phone. It isn't synced anywhere. Use **⋯ → Export backup** now and then: on iPhone it opens the share sheet so you can save the file to Files or iCloud Drive.

## Updating

After changing files, bump `VERSION` in `sw.js` so installed copies fetch the new version.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Markup and dialogs |
| `styles.css` | Styling (light/dark, iPhone safe areas) |
| `app.js` | All app logic; data stored in `localStorage` under `habits.v1` |
| `sw.js` | Service worker for offline use |
| `manifest.webmanifest`, `icons/` | Home-screen install metadata and icons |
