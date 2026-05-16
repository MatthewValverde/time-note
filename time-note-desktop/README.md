# Time Note — Desktop

The same calendar-based time tracker, packaged as a native desktop app via [Tauri 2](https://v2.tauri.app/). Bundles to small native binaries for macOS, Windows, and Linux.

## Prerequisites (one-time)

You need **Node.js 20+** and **Rust** installed.

- **Rust**: <https://www.rust-lang.org/tools/install> (run the rustup script, accept defaults).
- **macOS**: also requires Xcode Command Line Tools — `xcode-select --install`.
- **Windows**: also requires the [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) and WebView2 (preinstalled on Windows 11).
- **Linux**: needs `webkit2gtk-4.1`, `libssl-dev`, `librsvg2-dev`, `libayatana-appindicator3-dev`. See <https://v2.tauri.app/start/prerequisites/> for the apt/dnf one-liners.

## Run in development

```bash
npm install
npm run dev
```

First run takes a while — Cargo downloads and compiles the Tauri crates (~3-5 min). Subsequent runs are fast (<5 sec). A native window opens with hot-reload for the frontend; Rust changes trigger a rebuild.

## Build for distribution

```bash
npm run build
```

Output ends up in `src-tauri/target/release/bundle/`:

- **macOS**: `.app` bundle and `.dmg` installer
- **Windows**: `.msi` and `.exe` installers (NSIS)
- **Linux**: `.deb`, `.rpm`, and `.AppImage`

Tauri only builds for the platform you're currently running on. To ship for all three OSes, you either:

1. Build on each platform yourself (Mac, Windows VM, Linux VM/container), or
2. Use GitHub Actions with the official `tauri-action` workflow — it spins up runners for all three OSes and produces the installers for you. Recommended.

## Where the data lives

Each user's `data.json` is written to the OS-standard app data directory:

- **macOS**: `~/Library/Application Support/rocks.therainmaker.timeapp/data.json`
- **Windows**: `%APPDATA%\rocks.therainmaker.timeapp\data.json`
- **Linux**: `~/.local/share/rocks.therainmaker.timeapp/data.json`

App updates won't touch this file. Users can back it up or hand-edit it.

## Project layout

```
time-app-desktop/
├── package.json               # frontend deps + dev/build scripts
├── src/                       # web frontend (HTML/CSS/JS)
│   ├── index.html
│   ├── main.js                # uses window.__TAURI__.core.invoke
│   └── styles.css
└── src-tauri/                 # Rust backend
    ├── Cargo.toml
    ├── tauri.conf.json        # window size, app name, identifier
    ├── capabilities/
    │   └── default.json
    ├── icons/                 # default Tauri icons (replace these!)
    └── src/
        ├── main.rs
        └── lib.rs             # load_data and save_data commands
```

## Customizing

**App icon**: replace the files in `src-tauri/icons/`. Easiest way: drop a 1024×1024 PNG somewhere and run:

```bash
npx @tauri-apps/cli icon path/to/your-icon.png
```

That regenerates every required size and format.

**Window size**: edit `src-tauri/tauri.conf.json` → `app.windows[0]`. Defaults are 480×800, min 380×600 (mobile-shaped on purpose — the layout was designed for that aspect ratio).
