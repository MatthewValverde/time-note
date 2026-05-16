# Time App — v2 (multi-project)

Same calendar-based time tracker, now with multiple projects and per-day notes.

## What's new in v2

- **Multiple projects**: dropdown next to the title lets you switch between projects, add new ones, or rename/delete from a manage screen. Each project has its own calendar of time entries.
- **Notes per day**: the entry modal has a textarea for an optional note. Days with notes get a small `·` next to the day number on the calendar.
- **Notes without hours**: a day can have a note even with zero hours logged.
- **Auto-migration**: existing v1 `data.json` is automatically converted to the new multi-project format on first load. The original is preserved as `data.legacy.json`.

## File layout

```
time-app/
├── server.js        # Express server: serves files + /api/data
├── package.json
├── index.html
├── app.js
├── styles.css
└── data.json        # Single document holding everything (auto-created)
```

## Storage format

Everything lives in `data.json`:

```json
{
  "settings": {
    "theme": "dark",
    "weekStart": "sunday",
    "dailyGoal": 0,
    "showYearTotal": false
  },
  "projects": [
    { "id": "default", "name": "Default" },
    { "id": "client-work", "name": "Client work" }
  ],
  "activeProjectId": "default",
  "projectData": {
    "default": {
      "entries": {
        "2026-05-04": { "hours": 8, "note": "Reviewed design specs" },
        "2026-05-05": { "hours": 7.5 },
        "2026-05-06": { "note": "Day off, jotted ideas" }
      }
    },
    "client-work": {
      "entries": {}
    }
  }
}
```

Edit by hand if you want — just don't have the app open in another tab while you do, since the next save from the app will overwrite your changes.

## Running locally

```bash
npm install
npm start
```

Then open <http://localhost:3000>. Set `PORT` to override (e.g. `PORT=8080 npm start`).

## Deploying to GoDaddy

1. Zip the project folder, **excluding `node_modules`**.
2. In cPanel → Node.js, point at `server.js` as the entry point.
3. The `build` and `start` scripts are already in `package.json`.
4. GoDaddy runs `npm install` automatically.

The first deploy of v2 will read your existing `data.json`, migrate it on the fly, and back up the original to `data.legacy.json`. No manual conversion needed.

## Migration details

- v1 entries (`{ "2026-05-04": 8 }`) become v2 entries (`{ "2026-05-04": { "hours": 8 } }`).
- All v1 settings carry over.
- Migrated data goes into a project called "Default" (id: `default`).
- Migration only runs once — on the first GET after upgrade. After that, the file is in the new format and stays there.

## Settings

- **Theme**: Dark (default) or Light.
- **Week starts on**: Sunday or Monday.
- **Daily goal**: Optional. Set a target (e.g., 8). Days that hit it get a small accent dot. Set to 0 to disable.
- **Show year total**: Toggle a year-to-date total under the monthly total.

Settings apply across all projects.

## Keyboard shortcuts

- **← / →** — previous / next month
- **Esc** — close any open modal or dropdown
- **Enter** in the hours field — save entry (Enter inside the note field still adds newlines)
