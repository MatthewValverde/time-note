# Time Note

**Live at:** [time-note](https://2mgy1y4jhb.c24.airoapp.ai/)

A simple, calendar-based time tracker. Click a day, log your hours, add a note. That's it.

Built as a native desktop app for macOS, Windows, and Linux. Your data lives on your own machine in a plain JSON file you can read, back up, or edit by hand.

## Why

Most time trackers are subscription SaaS that want to live in the cloud, watch what window you have focused, and bill you forever. Time Note is the opposite: a tiny native app you buy once, keep forever, and that stores its data on your own disk. No accounts. No syncing. No telemetry. No internet required after install.

It's deliberately minimal — a calendar, a number per day, and an optional note. Made for people who already know what they worked on and just want a quiet place to write it down.

## Features

- **Calendar as the main UI.** The whole month at a glance. Click any day to enter hours and an optional note.
- **Multiple projects.** Switch between projects from a dropdown next to the title. Each project has its own calendar of entries.
- **Notes per day.** Days with notes show a small `·` marker next to the day number. Notes don't clutter the calendar.
- **Notes without hours.** A day can have a note even with zero hours logged.
- **Monthly and year-to-date totals.** Month total is always visible; year-to-date is a toggle.
- **Daily goal.** Set an optional target (e.g. 8h). Days that hit it get a small accent dot.
- **Dark and light themes.** Dark by default.
- **Keyboard navigation.** ← / → to move between months, Esc to close modals, Enter to save.
- **Plain JSON storage.** Your data lives in a single human-readable file. Open it in any text editor.
- **No cloud, no account, no telemetry.** Works fully offline.

## Where your data lives

Time Note writes a single JSON file to the standard application data directory for your OS.
The data is structured like this:

```
app.json              # Global settings + project list + active project
projects/
  default.json        # Entries for the "Default" project
  client-work.json    # Entries for any project you create
  ...
```

Each project file looks like:

```json
{
  "entries": {
    "2026-05-04": { "hours": 8, "note": "Reviewed design specs" },
    "2026-05-05": { "hours": 7.5 },
    "2026-05-06": { "note": "Day off, jotted ideas" }
  }
}
```

## Building from source

Time Note is built with [Tauri 2](https://v2.tauri.app/) — a tiny Rust core wrapping a web frontend that runs in your OS's native webview. The frontend is vanilla HTML / CSS / JavaScript. No framework, no build step for the frontend.

### Prerequisites

- **Node.js 20+**
- **Rust** (install via [rustup.rs](https://www.rust-lang.org/tools/install))
- **macOS**: Xcode Command Line Tools (`xcode-select --install`)
- **Windows**: Microsoft C++ Build Tools and WebView2 (preinstalled on Windows 11)
- **Linux**: `webkit2gtk-4.1`, `libssl-dev`, `librsvg2-dev`, `libayatana-appindicator3-dev`. See [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for the exact apt/dnf commands.

### Development

```bash
npm install
npm run dev
```

First run takes a few minutes — Cargo downloads and compiles the Tauri dependencies. After that, dev runs in a few seconds with hot-reload on frontend changes.

### Building installers

```bash
npm run build
```

Output lands in `src-tauri/target/release/bundle/`:

- macOS: `.dmg` and `.app`
- Windows: `.msi` and `.exe`
- Linux: `.deb`, `.rpm`, and `.AppImage`

Tauri only builds for the OS you're currently running on. To produce installers for all three platforms from one commit, use GitHub Actions with the [tauri-action](https://github.com/tauri-apps/tauri-action) workflow.

## Project layout

```
time-note/
├── package.json              Frontend deps + dev/build scripts
├── src/                      Web frontend (HTML, CSS, JS)
│   ├── index.html
│   ├── main.js               Uses window.__TAURI__.core.invoke
│   └── styles.css
└── src-tauri/                Rust backend
    ├── Cargo.toml
    ├── tauri.conf.json       Window size, app name, identifier
    ├── capabilities/
    ├── icons/
    └── src/
        ├── main.rs
        └── lib.rs            load_app / save_app / project commands
```

The IPC surface is small — six commands total: `load_app`, `save_app`, `load_project`, `save_project`, `create_project`, `delete_project`. Everything else is the frontend talking to itself.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| ← / → | Previous / next month |
| Esc | Close any open modal or dropdown |
| Enter (in hours field) | Save entry |
| Enter (in note field) | Newline within the note |

## Self-hosted web version

A companion project ([time-note-server](https://github.com/yourusername/time-note-server)) runs Time Note as a Node.js app on your own server, accessible from any browser including mobile. Same UI, same features, but persistence goes through an Express API to a single JSON file on the server. Useful if you want to log time from a phone without a native mobile app.

## License

[Add your license here — MIT and "All Rights Reserved" are common picks.]
