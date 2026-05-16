// Time App — minimal server (multi-project edition)
//
// Storage model: a single data.json file next to index.html with this shape:
// {
//   "settings":         { theme, weekStart, dailyGoal, showYearTotal },
//   "projects":         [ { id, name }, ... ],
//   "activeProjectId":  "default",
//   "projectData":      { "default": { entries: { "YYYY-MM-DD": { hours, note } } }, ... }
// }
//
// On startup, if data.json is in the OLD format (entries at the root), it is
// automatically migrated into a "Default" project. The original is renamed
// to data.legacy.json (non-destructive).

const express = require('express');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_FILE = path.join(__dirname, 'data.json');
const LEGACY_BACKUP = path.join(__dirname, 'data.legacy.json');

const DEFAULT_PROJECT_ID = 'default';
const DEFAULT_PROJECT_NAME = 'Default';

const DEFAULT_SETTINGS = {
  theme: 'dark',
  weekStart: 'sunday',
  dailyGoal: 0,
  showYearTotal: false
};

function defaultDoc() {
  return {
    settings: { ...DEFAULT_SETTINGS },
    projects: [{ id: DEFAULT_PROJECT_ID, name: DEFAULT_PROJECT_NAME }],
    activeProjectId: DEFAULT_PROJECT_ID,
    projectData: {
      [DEFAULT_PROJECT_ID]: { entries: {} }
    }
  };
}

// Migrate old shape { entries: { "YYYY-MM-DD": <number> }, settings: {...} }
// into the new multi-project shape with a "Default" project.
function migrateIfNeeded(parsed) {
  if (!parsed || typeof parsed !== 'object') return { doc: defaultDoc(), migrated: false };

  // Already new format?
  if (parsed.projects && parsed.projectData) {
    return { doc: parsed, migrated: false };
  }

  // Old format detected.
  const newEntries = {};
  if (parsed.entries && typeof parsed.entries === 'object') {
    for (const [dateKey, raw] of Object.entries(parsed.entries)) {
      if (typeof raw === 'number') {
        newEntries[dateKey] = { hours: raw };
      } else if (raw && typeof raw === 'object') {
        // Defensive: someone may have already partially migrated.
        newEntries[dateKey] = raw;
      }
    }
  }

  const doc = {
    settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
    projects: [{ id: DEFAULT_PROJECT_ID, name: DEFAULT_PROJECT_NAME }],
    activeProjectId: DEFAULT_PROJECT_ID,
    projectData: {
      [DEFAULT_PROJECT_ID]: { entries: newEntries }
    }
  };

  return { doc, migrated: true };
}

// Validate / sanitize an incoming POST body so we never write garbage.
// Returns a clean document with all required fields filled in.
function sanitizeIncoming(body) {
  const safe = defaultDoc();
  safe.settings = { ...DEFAULT_SETTINGS, ...(body.settings || {}) };

  // Projects list
  if (Array.isArray(body.projects) && body.projects.length > 0) {
    safe.projects = body.projects
      .filter(p => p && typeof p.id === 'string' && typeof p.name === 'string')
      .map(p => ({ id: p.id, name: p.name }));
  }
  if (safe.projects.length === 0) {
    safe.projects = [{ id: DEFAULT_PROJECT_ID, name: DEFAULT_PROJECT_NAME }];
  }

  // Active project must exist in the list
  const ids = new Set(safe.projects.map(p => p.id));
  safe.activeProjectId = ids.has(body.activeProjectId)
    ? body.activeProjectId
    : safe.projects[0].id;

  // Project data: only keep keys that match a project in the list
  safe.projectData = {};
  const incoming = body.projectData && typeof body.projectData === 'object' ? body.projectData : {};
  for (const p of safe.projects) {
    const pd = incoming[p.id];
    safe.projectData[p.id] = (pd && typeof pd === 'object' && pd.entries && typeof pd.entries === 'object')
      ? { entries: pd.entries }
      : { entries: {} };
  }

  return safe;
}

app.use(express.json({ limit: '5mb' }));

// API: read everything in one shot
app.get('/api/data', async (_req, res) => {
  try {
    let raw;
    try {
      raw = await fs.readFile(DATA_FILE, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') return res.json(defaultDoc());
      throw err;
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (parseErr) {
      console.error('data.json is not valid JSON; serving defaults:', parseErr);
      return res.json(defaultDoc());
    }

    const { doc, migrated } = migrateIfNeeded(parsed);

    if (migrated) {
      // Back up the old file (non-destructive) and write the migrated doc.
      try {
        await fs.rename(DATA_FILE, LEGACY_BACKUP);
      } catch (backupErr) {
        // If rename fails (perms, EXDEV, etc.) fall through and overwrite.
        console.warn('Could not back up legacy data.json:', backupErr.message);
      }
      await fs.writeFile(DATA_FILE, JSON.stringify(doc, null, 2));
      console.log('Migrated data.json to multi-project format.');
    }

    res.json(doc);
  } catch (err) {
    console.error('Read error:', err);
    res.status(500).json({ error: 'Could not read data file.' });
  }
});

// API: write everything
app.post('/api/data', async (req, res) => {
  try {
    const safe = sanitizeIncoming(req.body || {});
    await fs.writeFile(DATA_FILE, JSON.stringify(safe, null, 2));
    res.json({ ok: true });
  } catch (err) {
    console.error('Write error:', err);
    res.status(500).json({ error: 'Could not write data file.' });
  }
});

// Static files
app.use(express.static(__dirname));

app.listen(PORT, () => {
  console.log(`Time App running on http://localhost:${PORT}`);
});
