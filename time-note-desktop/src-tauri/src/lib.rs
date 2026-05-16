// Time App — Tauri backend
//
// File layout in the OS app data directory:
//
//   <app_data>/
//   ├── app.json              global settings + active project + project list
//   └── projects/
//       ├── default.json      one file per project
//       ├── work.json
//       └── ...
//
// Each project file contains entries (with hours and optional note per day).
// app.json contains theme, week start, project ordering, and which project
// is currently active.
//
// On first launch after upgrading from the single-data.json version, the
// existing data.json is automatically migrated into projects/default.json
// and entries' raw numeric values are rewritten as { hours, note } objects.

use std::fs;
use std::path::{Path, PathBuf};

use serde_json::{json, Map, Value};
use tauri::Manager;

const APP_FILE: &str = "app.json";
const PROJECTS_DIR: &str = "projects";
const LEGACY_FILE: &str = "data.json";
const DEFAULT_PROJECT_ID: &str = "default";
const DEFAULT_PROJECT_NAME: &str = "Default";

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

fn default_app() -> Value {
    json!({
        "settings": {
            "theme": "dark",
            "weekStart": "sunday",
            "dailyGoal": 0,
            "showYearTotal": false
        },
        "projects": [
            { "id": DEFAULT_PROJECT_ID, "name": DEFAULT_PROJECT_NAME }
        ],
        "activeProjectId": DEFAULT_PROJECT_ID
    })
}

fn default_project() -> Value {
    json!({ "entries": {} })
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

fn app_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("could not resolve app data dir: {e}"))?;
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| format!("could not create app data dir: {e}"))?;
    }
    Ok(dir)
}

fn projects_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app_dir(app)?.join(PROJECTS_DIR);
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| format!("could not create projects dir: {e}"))?;
    }
    Ok(dir)
}

fn app_file_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app_dir(app)?.join(APP_FILE))
}

fn project_file_path(app: &tauri::AppHandle, id: &str) -> Result<PathBuf, String> {
    if !is_valid_id(id) {
        return Err(format!("invalid project id: {id}"));
    }
    Ok(projects_dir(app)?.join(format!("{id}.json")))
}

// Restrict project ids so they can't escape the projects/ directory or
// produce filenames the OS won't like.
fn is_valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

// ---------------------------------------------------------------------------
// File IO
// ---------------------------------------------------------------------------

fn read_json(path: &Path) -> Result<Option<Value>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(path).map_err(|e| format!("read failed: {e}"))?;
    Ok(serde_json::from_str(&raw).ok())
}

fn write_json(path: &Path, value: &Value) -> Result<(), String> {
    let pretty = serde_json::to_string_pretty(value)
        .map_err(|e| format!("serialize failed: {e}"))?;
    fs::write(path, pretty).map_err(|e| format!("write failed: {e}"))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Migration: old data.json -> projects/default.json
// ---------------------------------------------------------------------------
//
// The old format stored entries as { "YYYY-MM-DD": <number> }. We now store
// entries as { "YYYY-MM-DD": { "hours": <number>, "note": "<string>" } }.
// Either field can be missing/empty; a day with only a note is valid.
//
// This runs once on first launch after the upgrade. The legacy file is
// renamed to data.legacy.json so the migration is non-destructive.

fn migrate_if_needed(app: &tauri::AppHandle) -> Result<(), String> {
    let dir = app_dir(app)?;
    let legacy = dir.join(LEGACY_FILE);
    let app_file = dir.join(APP_FILE);

    // If app.json already exists we're already on the new format.
    if app_file.exists() {
        return Ok(());
    }

    // No legacy file either => fresh install. Write defaults and return.
    if !legacy.exists() {
        write_json(&app_file, &default_app())?;
        let default_path = projects_dir(app)?.join(format!("{DEFAULT_PROJECT_ID}.json"));
        if !default_path.exists() {
            write_json(&default_path, &default_project())?;
        }
        return Ok(());
    }

    // Migrate.
    let legacy_value = read_json(&legacy)?.unwrap_or_else(default_app);

    // Pull settings out of the legacy file and into app.json.
    let mut app_value = default_app();
    if let Some(settings) = legacy_value.get("settings") {
        app_value["settings"] = settings.clone();
    }

    // Convert entries: number -> { hours: number }.
    let mut new_entries = Map::new();
    if let Some(entries) = legacy_value.get("entries").and_then(|v| v.as_object()) {
        for (date_key, raw_value) in entries {
            if let Some(n) = raw_value.as_f64() {
                new_entries.insert(date_key.clone(), json!({ "hours": n }));
            } else if raw_value.is_object() {
                // Already in the new shape (defensive).
                new_entries.insert(date_key.clone(), raw_value.clone());
            }
        }
    }
    let project_value = json!({ "entries": Value::Object(new_entries) });

    // Write the new files.
    write_json(&app_file, &app_value)?;
    write_json(
        &projects_dir(app)?.join(format!("{DEFAULT_PROJECT_ID}.json")),
        &project_value,
    )?;

    // Rename the legacy file (non-destructive).
    let backup = dir.join("data.legacy.json");
    let _ = fs::rename(&legacy, &backup);

    Ok(())
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Load app-level state: settings, project list, and the currently active
/// project's entries. Returned as a single object so the frontend gets
/// everything it needs in one round trip on startup.
#[tauri::command]
fn load_app(app: tauri::AppHandle) -> Result<Value, String> {
    migrate_if_needed(&app)?;

    let app_value = read_json(&app_file_path(&app)?)?.unwrap_or_else(default_app);
    let active_id = app_value
        .get("activeProjectId")
        .and_then(|v| v.as_str())
        .unwrap_or(DEFAULT_PROJECT_ID)
        .to_string();

    let project_value = read_json(&project_file_path(&app, &active_id)?)?
        .unwrap_or_else(default_project);

    Ok(json!({
        "app": app_value,
        "activeProject": {
            "id": active_id,
            "data": project_value
        }
    }))
}

/// Save the app-level state (settings, project list, active project pointer).
#[tauri::command]
fn save_app(app: tauri::AppHandle, app_data: Value) -> Result<(), String> {
    write_json(&app_file_path(&app)?, &app_data)
}

/// Load a single project's entries by id.
#[tauri::command]
fn load_project(app: tauri::AppHandle, id: String) -> Result<Value, String> {
    let path = project_file_path(&app, &id)?;
    Ok(read_json(&path)?.unwrap_or_else(default_project))
}

/// Save a single project's entries by id.
#[tauri::command]
fn save_project(app: tauri::AppHandle, id: String, project_data: Value) -> Result<(), String> {
    let path = project_file_path(&app, &id)?;
    write_json(&path, &project_data)
}

/// Create a new project file. Refuses to overwrite an existing one.
#[tauri::command]
fn create_project(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let path = project_file_path(&app, &id)?;
    if path.exists() {
        return Err(format!("project {id} already exists"));
    }
    write_json(&path, &default_project())
}

/// Delete a project's data file. The frontend is responsible for keeping
/// app.json in sync (removing it from the project list).
#[tauri::command]
fn delete_project(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let path = project_file_path(&app, &id)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("delete failed: {e}"))?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            load_app,
            save_app,
            load_project,
            save_project,
            create_project,
            delete_project,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
