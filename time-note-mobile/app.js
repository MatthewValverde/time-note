// =====================================================================
// Time App — main script (web / Node server build)
// =====================================================================
// Storage model: a single document covering all projects, settings, and
// the active project pointer. The whole document is loaded once on startup
// and the whole thing is POSTed back on every save (debounced).
//
// Document shape:
//   {
//     settings:        { theme, weekStart, dailyGoal, showYearTotal },
//     projects:        [ { id, name }, ... ],
//     activeProjectId: "default",
//     projectData:     { [id]: { entries: { "YYYY-MM-DD": { hours, note } } } }
//   }
// =====================================================================

(() => {
  'use strict';

  // ---------- State ----------

  const state = {
    doc: {
      settings: {
        theme: 'dark',
        weekStart: 'sunday',
        dailyGoal: 0,
        showYearTotal: false
      },
      projects: [{ id: 'default', name: 'Default' }],
      activeProjectId: 'default',
      projectData: { default: { entries: {} } }
    },
    view: {
      year: new Date().getFullYear(),
      month: new Date().getMonth()
    },
    selectedDateKey: null
  };

  // ---------- Constants ----------

  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const WEEKDAYS_SUN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const WEEKDAYS_MON = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  // ---------- DOM refs ----------

  const $ = (sel) => document.querySelector(sel);

  const els = {
    monthLabel: $('#monthLabel'),
    weekdayRow: $('#weekdayRow'),
    grid: $('#grid'),
    monthTotal: $('#monthTotal'),
    yearTotal: $('#yearTotal'),
    yearTotalLine: $('#yearTotalLine'),

    prevBtn: $('#prevBtn'),
    nextBtn: $('#nextBtn'),

    projectBtn: $('#projectBtn'),
    projectBtnLabel: $('#projectBtnLabel'),
    projectMenu: $('#projectMenu'),

    settingsBtn: $('#settingsBtn'),
    settingsModal: $('#settingsModal'),
    goalInput: $('#goalInput'),
    yearToggle: $('#yearToggle'),

    entryModal: $('#entryModal'),
    entryModalTitle: $('#entryModalTitle'),
    hoursInput: $('#hoursInput'),
    noteInput: $('#noteInput'),
    saveBtn: $('#saveBtn'),
    clearBtn: $('#clearBtn'),

    addProjectModal: $('#addProjectModal'),
    newProjectName: $('#newProjectName'),
    createProjectBtn: $('#createProjectBtn'),

    manageProjectsModal: $('#manageProjectsModal'),
    manageList: $('#manageList'),

    toast: $('#toast')
  };

  // ---------- Helpers ----------

  const pad = (n) => String(n).padStart(2, '0');
  const dateKey = (year, monthIdx, day) =>
    `${year}-${pad(monthIdx + 1)}-${pad(day)}`;

  const todayKey = () => {
    const d = new Date();
    return dateKey(d.getFullYear(), d.getMonth(), d.getDate());
  };

  const formatHours = (n) => {
    if (n == null || isNaN(n)) return '';
    return Number.isInteger(n) ? String(n) : String(n);
  };

  // Project ids must be alphanumeric (plus - and _) for filename safety
  // even though the server stores everything in one file — keeps the data
  // shape consistent with the desktop version's per-file model in case we
  // ever swap back, and avoids weird characters in JSON keys.
  const slugify = (name) => {
    const base = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
    return base || 'project';
  };

  const ensureUniqueId = (baseId) => {
    const existing = new Set(state.doc.projects.map((p) => p.id));
    if (!existing.has(baseId)) return baseId;
    let n = 2;
    while (existing.has(`${baseId}-${n}`)) n++;
    return `${baseId}-${n}`;
  };

  const projectMeta = (id) => state.doc.projects.find((p) => p.id === id);

  const activeEntries = () => {
    const id = state.doc.activeProjectId;
    if (!state.doc.projectData[id]) {
      state.doc.projectData[id] = { entries: {} };
    }
    return state.doc.projectData[id].entries;
  };

  const sumMonth = (year, monthIdx) => {
    const prefix = `${year}-${pad(monthIdx + 1)}-`;
    const entries = activeEntries();
    let total = 0;
    for (const k in entries) {
      if (k.startsWith(prefix)) total += Number(entries[k].hours) || 0;
    }
    return total;
  };

  const sumYear = (year) => {
    const prefix = `${year}-`;
    const entries = activeEntries();
    let total = 0;
    for (const k in entries) {
      if (k.startsWith(prefix)) total += Number(entries[k].hours) || 0;
    }
    return total;
  };

  // ---------- Persistence ----------

  let saveTimer = null;
  const saveDebounced = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 250);
  };

  async function saveNow() {
    try {
      const res = await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state.doc)
      });
      if (!res.ok) throw new Error('Save failed');
    } catch (err) {
      console.error(err);
      showToast('Save failed');
    }
  }

  async function loadData() {
    try {
      const res = await fetch('/api/data');
      if (!res.ok) throw new Error('Load failed');
      const data = await res.json();

      // Merge with defaults so any missing fields fall back gracefully.
      state.doc.settings = { ...state.doc.settings, ...(data.settings || {}) };
      state.doc.projects = Array.isArray(data.projects) && data.projects.length
        ? data.projects
        : state.doc.projects;
      state.doc.activeProjectId = data.activeProjectId || state.doc.projects[0].id;
      state.doc.projectData = (data.projectData && typeof data.projectData === 'object')
        ? data.projectData
        : { [state.doc.activeProjectId]: { entries: {} } };

      // Make sure every listed project has a projectData slot.
      for (const p of state.doc.projects) {
        if (!state.doc.projectData[p.id]) {
          state.doc.projectData[p.id] = { entries: {} };
        }
      }
    } catch (err) {
      console.error(err);
      showToast('Load failed — using defaults');
    }
  }

  // ---------- Toast ----------

  let toastTimer = null;
  function showToast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.remove('hidden');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.add('hidden'), 1500);
  }

  // ---------- Render ----------

  function applyTheme() {
    document.documentElement.setAttribute('data-theme', state.doc.settings.theme);
    document.querySelector('meta[name="theme-color"]')
      .setAttribute('content', state.doc.settings.theme === 'dark' ? '#0e0e10' : '#faf7f2');
  }

  function renderWeekdayRow() {
    const labels = state.doc.settings.weekStart === 'monday' ? WEEKDAYS_MON : WEEKDAYS_SUN;
    els.weekdayRow.innerHTML = labels
      .map((l) => `<div class="weekday" role="columnheader">${l}</div>`)
      .join('');
  }

  function renderProjectButton() {
    const meta = projectMeta(state.doc.activeProjectId);
    els.projectBtnLabel.textContent = meta ? meta.name : 'Project';
  }

  function renderCalendar() {
    const { year, month } = state.view;
    els.monthLabel.textContent = `${MONTHS[month]} ${year}`;

    const first = new Date(year, month, 1);
    let leading = first.getDay();
    if (state.doc.settings.weekStart === 'monday') {
      leading = (leading + 6) % 7;
    }

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrev = new Date(year, month, 0).getDate();

    const cells = [];
    const today = todayKey();
    const goal = Number(state.doc.settings.dailyGoal) || 0;
    const entries = activeEntries();

    for (let i = leading - 1; i >= 0; i--) {
      const d = daysInPrev - i;
      const prevMonth = month === 0 ? 11 : month - 1;
      const prevYear = month === 0 ? year - 1 : year;
      cells.push({
        outside: true,
        year: prevYear, month: prevMonth, day: d,
        key: dateKey(prevYear, prevMonth, d)
      });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({
        outside: false,
        year, month, day: d,
        key: dateKey(year, month, d)
      });
    }

    while (cells.length < 42) {
      const idx = cells.length;
      const dayOffset = idx - (leading + daysInMonth) + 1;
      const nextMonth = month === 11 ? 0 : month + 1;
      const nextYear = month === 11 ? year + 1 : year;
      cells.push({
        outside: true,
        year: nextYear, month: nextMonth, day: dayOffset,
        key: dateKey(nextYear, nextMonth, dayOffset)
      });
    }

    els.grid.innerHTML = cells.map((c, i) => {
      const entry = entries[c.key];
      const hours = entry && entry.hours;
      const note = entry && entry.note;
      const hasHours = hours != null && hours > 0;
      const hasNote = !!(note && String(note).trim());

      const classes = ['day'];
      if (c.outside) classes.push('outside');
      if (c.key === today) classes.push('today');
      if (hasHours) classes.push('has-entry');
      if (goal > 0 && hasHours && hours >= goal) classes.push('goal-met');
      if (i >= 35) classes.push('last-row');

      const noteMark = hasNote ? `<span class="note-mark">·</span>` : '';
      const hoursHtml = (!c.outside && hasHours)
        ? `<div class="day-hours">${formatHours(hours)}</div>`
        : `<div class="day-hours"></div>`;

      return `
        <div class="${classes.join(' ')}" role="gridcell" data-key="${c.key}" data-outside="${c.outside}">
          <div class="day-num">${c.day}${noteMark}</div>
          ${hoursHtml}
        </div>`;
    }).join('');

    renderTotals();
  }

  function renderTotals() {
    const { year, month } = state.view;
    const monthTotal = sumMonth(year, month);
    els.monthTotal.innerHTML = `${formatHours(monthTotal)}<span class="unit">h</span>`;

    if (state.doc.settings.showYearTotal) {
      els.yearTotalLine.classList.remove('hidden');
      els.yearTotal.innerHTML = `${formatHours(sumYear(year))}<span class="unit">h</span>`;
    } else {
      els.yearTotalLine.classList.add('hidden');
    }
  }

  function renderSettings() {
    document.querySelectorAll('.seg').forEach((btn) => {
      const setting = btn.dataset.setting;
      const value = btn.dataset.value;
      btn.classList.toggle('active', state.doc.settings[setting] === value);
    });
    els.goalInput.value = state.doc.settings.dailyGoal || '';
    els.yearToggle.checked = !!state.doc.settings.showYearTotal;
  }

  // ---------- Project menu ----------

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderProjectMenu() {
    const items = state.doc.projects.map((p) => {
      const isActive = p.id === state.doc.activeProjectId;
      const check = isActive
        ? `<svg class="check" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
        : '';
      return `
        <li>
          <button class="project-menu-item ${isActive ? 'active' : ''}" data-action="select" data-id="${p.id}">
            <span>${escapeHtml(p.name)}</span>
            ${check}
          </button>
        </li>`;
    }).join('');

    els.projectMenu.innerHTML = `
      ${items}
      <li><div class="project-menu-divider"></div></li>
      <li><button class="project-menu-item action" data-action="add">+ Add project…</button></li>
      <li><button class="project-menu-item action" data-action="manage">Manage projects…</button></li>
    `;
  }

  function openProjectMenu() {
    renderProjectMenu();
    els.projectMenu.classList.remove('hidden');
    els.projectBtn.setAttribute('aria-expanded', 'true');
  }

  function closeProjectMenu() {
    els.projectMenu.classList.add('hidden');
    els.projectBtn.setAttribute('aria-expanded', 'false');
  }

  function selectProject(id) {
    if (id === state.doc.activeProjectId) {
      closeProjectMenu();
      return;
    }
    if (!state.doc.projectData[id]) {
      state.doc.projectData[id] = { entries: {} };
    }
    state.doc.activeProjectId = id;
    renderProjectButton();
    renderCalendar();
    closeProjectMenu();
    saveDebounced();
  }

  // ---------- Manage projects ----------

  function renderManageList() {
    const items = state.doc.projects.map((p) => {
      const isOnly = state.doc.projects.length === 1;
      return `
        <li data-id="${p.id}">
          <input class="name" type="text" value="${escapeHtml(p.name)}" data-id="${p.id}" maxlength="40" />
          <button class="icon-btn small danger" data-action="delete" data-id="${p.id}" aria-label="Delete project" ${isOnly ? 'disabled' : ''} title="${isOnly ? 'Cannot delete the only project' : 'Delete project'}">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6M14 11v6"/>
              <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </li>`;
    }).join('');
    els.manageList.innerHTML = items;
  }

  // ---------- Modals ----------

  function openEntryModal(key) {
    state.selectedDateKey = key;
    const [y, m, d] = key.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const fmt = dateObj.toLocaleDateString(undefined, {
      weekday: 'long', month: 'long', day: 'numeric'
    });
    els.entryModalTitle.textContent = fmt;

    const entry = activeEntries()[key] || {};
    els.hoursInput.value = entry.hours != null ? entry.hours : '';
    els.noteInput.value = entry.note || '';

    els.entryModal.classList.remove('hidden');
    setTimeout(() => els.hoursInput.focus(), 50);
  }

  function closeEntryModal() {
    els.entryModal.classList.add('hidden');
    state.selectedDateKey = null;
  }

  function openSettings() {
    renderSettings();
    els.settingsModal.classList.remove('hidden');
  }

  function closeSettings() {
    els.settingsModal.classList.add('hidden');
  }

  function openAddProject() {
    closeProjectMenu();
    els.newProjectName.value = '';
    els.addProjectModal.classList.remove('hidden');
    setTimeout(() => els.newProjectName.focus(), 50);
  }

  function closeAddProject() {
    els.addProjectModal.classList.add('hidden');
  }

  function openManageProjects() {
    closeProjectMenu();
    renderManageList();
    els.manageProjectsModal.classList.remove('hidden');
  }

  function closeManageProjects() {
    els.manageProjectsModal.classList.add('hidden');
  }

  // ---------- Actions ----------

  function saveEntry() {
    const key = state.selectedDateKey;
    if (!key) return;

    const entries = activeEntries();
    const rawHours = els.hoursInput.value.trim();
    const noteText = els.noteInput.value.trim();

    let hours = null;
    if (rawHours !== '') {
      const n = Number(rawHours);
      if (!Number.isFinite(n) || n < 0) return;
      hours = Math.round(n * 100) / 100;
    }

    if (hours == null && noteText === '') {
      delete entries[key];
    } else {
      const entry = {};
      if (hours != null) entry.hours = hours;
      if (noteText !== '') entry.note = noteText;
      entries[key] = entry;
    }

    closeEntryModal();
    renderCalendar();
    saveDebounced();
    showToast('Saved');
  }

  function clearEntry() {
    const key = state.selectedDateKey;
    if (!key) return;
    delete activeEntries()[key];
    closeEntryModal();
    renderCalendar();
    saveDebounced();
    showToast('Cleared');
  }

  function changeMonth(delta) {
    let { year, month } = state.view;
    month += delta;
    if (month < 0) { month = 11; year--; }
    else if (month > 11) { month = 0; year++; }
    state.view = { year, month };
    renderCalendar();
  }

  function createNewProject() {
    const name = els.newProjectName.value.trim();
    if (!name) {
      els.newProjectName.focus();
      return;
    }
    if (state.doc.projects.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      showToast('Name already in use');
      return;
    }

    const id = ensureUniqueId(slugify(name));

    state.doc.projects.push({ id, name });
    state.doc.projectData[id] = { entries: {} };
    state.doc.activeProjectId = id;

    closeAddProject();
    renderProjectButton();
    renderCalendar();
    saveDebounced();
    showToast('Project created');
  }

  function renameProject(id, newName) {
    const trimmed = newName.trim();
    if (!trimmed) return false;
    const dupe = state.doc.projects.some(
      (p) => p.id !== id && p.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (dupe) {
      showToast('Name already in use');
      return false;
    }
    const meta = projectMeta(id);
    if (meta && meta.name !== trimmed) {
      meta.name = trimmed;
      renderProjectButton();
      saveDebounced();
    }
    return true;
  }

  function deleteProject(id) {
    if (state.doc.projects.length <= 1) {
      showToast('Cannot delete only project');
      return;
    }
    const meta = projectMeta(id);
    const confirmed = confirm(`Delete "${meta ? meta.name : id}"? This permanently removes its time data.`);
    if (!confirmed) return;

    state.doc.projects = state.doc.projects.filter((p) => p.id !== id);
    delete state.doc.projectData[id];

    if (state.doc.activeProjectId === id) {
      state.doc.activeProjectId = state.doc.projects[0].id;
      renderProjectButton();
      renderCalendar();
    }

    renderManageList();
    saveDebounced();
    showToast('Project deleted');
  }

  // ---------- Wiring ----------

  function bindEvents() {
    els.prevBtn.addEventListener('click', () => changeMonth(-1));
    els.nextBtn.addEventListener('click', () => changeMonth(1));
    els.settingsBtn.addEventListener('click', openSettings);

    els.grid.addEventListener('click', (e) => {
      const cell = e.target.closest('.day');
      if (!cell) return;
      if (cell.dataset.outside === 'true') return;
      openEntryModal(cell.dataset.key);
    });

    document.querySelectorAll('[data-close="entry"]').forEach((el) =>
      el.addEventListener('click', closeEntryModal));
    document.querySelectorAll('[data-close="settings"]').forEach((el) =>
      el.addEventListener('click', closeSettings));
    document.querySelectorAll('[data-close="addProject"]').forEach((el) =>
      el.addEventListener('click', closeAddProject));
    document.querySelectorAll('[data-close="manageProjects"]').forEach((el) =>
      el.addEventListener('click', closeManageProjects));

    els.saveBtn.addEventListener('click', saveEntry);
    els.clearBtn.addEventListener('click', clearEntry);
    els.hoursInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') saveEntry();
    });

    document.querySelectorAll('.seg').forEach((btn) => {
      btn.addEventListener('click', () => {
        const setting = btn.dataset.setting;
        const value = btn.dataset.value;
        state.doc.settings[setting] = value;
        renderSettings();
        if (setting === 'theme') applyTheme();
        if (setting === 'weekStart') {
          renderWeekdayRow();
          renderCalendar();
        }
        saveDebounced();
      });
    });

    els.goalInput.addEventListener('input', () => {
      const v = Number(els.goalInput.value);
      state.doc.settings.dailyGoal = Number.isFinite(v) && v > 0 ? v : 0;
      renderCalendar();
      saveDebounced();
    });

    els.yearToggle.addEventListener('change', () => {
      state.doc.settings.showYearTotal = els.yearToggle.checked;
      renderTotals();
      saveDebounced();
    });

    // Project switcher
    els.projectBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (els.projectMenu.classList.contains('hidden')) {
        openProjectMenu();
      } else {
        closeProjectMenu();
      }
    });

    els.projectMenu.addEventListener('click', (e) => {
      const item = e.target.closest('.project-menu-item');
      if (!item) return;
      const action = item.dataset.action;
      if (action === 'select') {
        selectProject(item.dataset.id);
      } else if (action === 'add') {
        openAddProject();
      } else if (action === 'manage') {
        openManageProjects();
      }
    });

    document.addEventListener('click', (e) => {
      if (els.projectMenu.classList.contains('hidden')) return;
      if (e.target.closest('.project-switcher')) return;
      closeProjectMenu();
    });

    els.createProjectBtn.addEventListener('click', createNewProject);
    els.newProjectName.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') createNewProject();
    });

    els.manageList.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action="delete"]');
      if (btn && !btn.disabled) deleteProject(btn.dataset.id);
    });
    els.manageList.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.classList.contains('name')) {
        e.target.blur();
      }
    });
    els.manageList.addEventListener('blur', (e) => {
      if (!e.target.classList.contains('name')) return;
      const id = e.target.dataset.id;
      const meta = projectMeta(id);
      const ok = renameProject(id, e.target.value);
      if (!ok && meta) e.target.value = meta.name;
    }, true);

    document.addEventListener('keydown', (e) => {
      const entryOpen = !els.entryModal.classList.contains('hidden');
      const settingsOpen = !els.settingsModal.classList.contains('hidden');
      const addOpen = !els.addProjectModal.classList.contains('hidden');
      const manageOpen = !els.manageProjectsModal.classList.contains('hidden');
      const menuOpen = !els.projectMenu.classList.contains('hidden');
      const anyOpen = entryOpen || settingsOpen || addOpen || manageOpen || menuOpen;

      if (e.key === 'Escape') {
        if (entryOpen) closeEntryModal();
        else if (addOpen) closeAddProject();
        else if (manageOpen) closeManageProjects();
        else if (settingsOpen) closeSettings();
        else if (menuOpen) closeProjectMenu();
        return;
      }

      if (anyOpen) return;
      if (e.key === 'ArrowLeft') changeMonth(-1);
      if (e.key === 'ArrowRight') changeMonth(1);
    });
  }

  // ---------- Init ----------

  async function init() {
    await loadData();
    applyTheme();
    renderWeekdayRow();
    renderProjectButton();
    renderCalendar();
    renderSettings();
    bindEvents();
  }

  init();
})();
