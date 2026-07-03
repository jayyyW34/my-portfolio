const STORAGE_KEY = 'habitTrackerData';
const THEME_KEY = 'habitTrackerTheme';

const taskForm = document.getElementById('taskForm');
const taskInput = document.getElementById('taskInput');
const tasksList = document.getElementById('tasksList');
const tasksEmpty = document.getElementById('tasksEmpty');
const tasksCount = document.getElementById('tasksCount');
const progressPercent = document.getElementById('progressPercent');
const progressBarFill = document.getElementById('progressBarFill');
const progressMeta = document.getElementById('progressMeta');
const progressCard = document.querySelector('.progress-card');
const dateDisplay = document.getElementById('dateDisplay');
const themeToggle = document.getElementById('themeToggle');
const categoryFilters = document.getElementById('categoryFilters');
const taskCategory = document.getElementById('taskCategory');
const clearCompletedBtn = document.getElementById('clearCompletedBtn');

const CHECK_ICON = `<svg viewBox="0 0 24 24" fill="none"><polyline points="4 12 9 17 20 6"/></svg>`;

const CATEGORIES = {
  health: { label: '🥦 Health' },
  chores: { label: '🧹 Chores' },
  spirituality: { label: '🙏 Spirituality' },
  hobbies: { label: '🎨 Hobbies' },
  finance: { label: '💸 Finance' },
};

const LEGACY_CATEGORY_MAP = {
  coding: 'hobbies',
  'personal-growth': 'spirituality',
  creative: 'hobbies',
  health: 'health',
  chores: 'chores',
};

const DEFAULT_CATEGORY = 'health';
let activeFilter = 'all';

function getTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
  themeToggle.setAttribute(
    'aria-label',
    theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'
  );
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const theme = saved === 'light' || saved === 'dark' ? saved : 'dark';
  setTheme(theme);
}

themeToggle.addEventListener('click', () => {
  setTheme(getTheme() === 'dark' ? 'light' : 'dark');
});

initTheme();

let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function playTone({ frequency, start, duration, type = 'sine', volume = 0.2, detune = 0 }) {
  const ctx = getAudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, start);
  osc.detune.setValueAtTime(detune, start);

  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

function playCompleteSound() {
  const ctx = getAudioContext();
  const now = ctx.currentTime;

  playTone({ frequency: 740, start: now, duration: 0.1, volume: 0.18 });
  playTone({ frequency: 988, start: now + 0.045, duration: 0.14, volume: 0.14, type: 'triangle' });
}

function playCelebrationSound() {
  const ctx = getAudioContext();
  const now = ctx.currentTime;
  const melody = [
    { frequency: 523.25, start: 0, duration: 0.18, volume: 0.16 },
    { frequency: 659.25, start: 0.07, duration: 0.18, volume: 0.17 },
    { frequency: 783.99, start: 0.14, duration: 0.22, volume: 0.18, type: 'triangle' },
    { frequency: 1046.5, start: 0.24, duration: 0.35, volume: 0.2, type: 'triangle' },
  ];

  melody.forEach((note) => {
    playTone({
      frequency: note.frequency,
      start: now + note.start,
      duration: note.duration,
      volume: note.volume,
      type: note.type || 'sine',
    });
  });

  playTone({ frequency: 1567.98, start: now + 0.38, duration: 0.45, volume: 0.07 });
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function normalizeTask(task, completedIds) {
  if (LEGACY_CATEGORY_MAP[task.category]) {
    task.category = LEGACY_CATEGORY_MAP[task.category];
  }
  if (!task.category || !CATEGORIES[task.category]) {
    task.category = DEFAULT_CATEGORY;
  }
  if (typeof task.completed !== 'boolean') {
    task.completed = completedIds ? completedIds.includes(task.id) : false;
  }
  return task;
}

function migrateStoredData(parsed) {
  delete parsed.habits;
  delete parsed.streak;
  delete parsed.lastStreakDate;

  if (!parsed.tasks || typeof parsed.tasks !== 'object') {
    parsed.tasks = {};
  }

  if (parsed.lastCelebrationDate === undefined) {
    parsed.lastCelebrationDate = null;
  }

  const history = parsed.history || {};

  Object.entries(parsed.tasks).forEach(([date, dayTasks]) => {
    if (!Array.isArray(dayTasks)) {
      parsed.tasks[date] = [];
      return;
    }

    const completedIds = history[date]?.tasks || [];
    parsed.tasks[date] = dayTasks.map((task) => normalizeTask(task, completedIds));
  });

  delete parsed.history;
  return parsed;
}

function loadTasksFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return migrateStoredData(JSON.parse(raw));
    }
  } catch {
    /* fall through to empty state */
  }

  return {
    tasks: {},
    lastCelebrationDate: null,
  };
}

function saveTasksToStorage() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      tasks: data.tasks,
      lastCelebrationDate: data.lastCelebrationDate,
    })
  );
}

let data = loadTasksFromStorage();

function ensureTodayTasks() {
  const today = todayKey();
  if (!data.tasks[today]) {
    data.tasks[today] = [];
  }
}

function getTodayTasks() {
  ensureTodayTasks();
  return data.tasks[todayKey()];
}

function getTaskProgress() {
  const tasks = getTodayTasks();
  const total = tasks.length;
  const done = tasks.filter((task) => task.completed).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const perfect = total > 0 && done === total;

  return { tasks, total, done, pct, perfect };
}

function checkAllTasksComplete() {
  const { perfect } = getTaskProgress();
  const today = todayKey();
  let earnedCelebration = false;

  if (perfect) {
    if (data.lastCelebrationDate !== today) {
      data.lastCelebrationDate = today;
      earnedCelebration = true;
    }
  } else if (data.lastCelebrationDate === today) {
    data.lastCelebrationDate = null;
  }

  saveTasksToStorage();
  return earnedCelebration;
}

function showCompleteCelebration() {
  const overlay = document.createElement('div');
  overlay.className = 'complete-celebration';
  overlay.innerHTML = `
    <div class="complete-celebration__burst"></div>
    <div class="complete-celebration__confetti" aria-hidden="true"></div>
    <div class="complete-celebration__content">
      <span class="complete-celebration__emoji" aria-hidden="true">🎉</span>
      <h2 class="complete-celebration__title">100%!</h2>
      <p class="complete-celebration__subtitle">All tasks complete</p>
    </div>
  `;

  const confettiContainer = overlay.querySelector('.complete-celebration__confetti');
  for (let i = 0; i < 48; i++) {
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    piece.style.setProperty('--x', `${Math.random() * 100}%`);
    piece.style.setProperty('--delay', `${Math.random() * 0.35}s`);
    piece.style.setProperty('--size', `${6 + Math.random() * 8}px`);
    piece.style.setProperty('--hue', `${Math.floor(Math.random() * 360)}`);
    confettiContainer.appendChild(piece);
  }

  document.body.appendChild(overlay);
  playCelebrationSound();

  overlay.addEventListener('animationend', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  setTimeout(() => overlay.remove(), 3200);
}

function formatDate() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function matchesFilter(category) {
  return activeFilter === 'all' || category === activeFilter;
}

function createItemElement(task) {
  const safeCategory = CATEGORIES[task.category] ? task.category : DEFAULT_CATEGORY;
  const li = document.createElement('li');
  li.className = 'item' + (task.completed ? ' completed' : '');
  li.dataset.id = task.id;
  li.dataset.category = safeCategory;

  li.innerHTML = `
    <button class="checkbox" aria-label="Toggle complete">${CHECK_ICON}</button>
    <span class="category-badge category-badge--${safeCategory}">${CATEGORIES[safeCategory].label}</span>
    <span class="item-text"></span>
    <button class="delete-btn" aria-label="Delete">&times;</button>
  `;

  li.querySelector('.item-text').textContent = task.text;
  li.querySelector('.checkbox').addEventListener('click', () => toggleItem(task.id));
  li.querySelector('.delete-btn').addEventListener('click', () => deleteItem(task.id));

  return li;
}

function toggleItem(id) {
  const task = getTodayTasks().find((t) => t.id === id);
  if (!task) return;

  const completing = !task.completed;
  task.completed = completing;

  saveTasksToStorage();
  const earnedCelebration = checkAllTasksComplete();
  render();

  if (completing) {
    if (earnedCelebration) {
      showCompleteCelebration();
    } else {
      playCompleteSound();
    }
  }
}

function deleteItem(id) {
  const tasks = getTodayTasks();
  const idx = tasks.findIndex((t) => t.id === id);
  if (idx !== -1) tasks.splice(idx, 1);

  saveTasksToStorage();
  checkAllTasksComplete();
  render();
}

function clearCompletedTasks() {
  const tasks = getTodayTasks();
  const remaining = tasks.filter((task) => !task.completed);
  data.tasks[todayKey()] = remaining;

  saveTasksToStorage();
  checkAllTasksComplete();
  render();
}

function addTask(text, category) {
  getTodayTasks().push({
    id: generateId(),
    text: text.trim(),
    category: CATEGORIES[category] ? category : DEFAULT_CATEGORY,
    completed: false,
  });

  saveTasksToStorage();
  render();
}

function renderFilterButtons() {
  if (activeFilter !== 'all' && !CATEGORIES[activeFilter]) {
    activeFilter = 'all';
  }

  const buttons = [
    { key: 'all', label: 'All' },
    ...Object.entries(CATEGORIES).map(([key, { label }]) => ({ key, label })),
  ];

  categoryFilters.innerHTML = buttons
    .map(({ key, label }) => {
      const isAll = key === 'all';
      const active = activeFilter === key ? ' filter-btn--active' : '';
      const cls = isAll ? 'filter-btn--all' : `filter-btn--${key}`;
      return `<button type="button" class="filter-btn ${cls}${active}" data-filter="${key}">${label}</button>`;
    })
    .join('');

  categoryFilters.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.filter;
      render();
    });
  });
}

function renderLists() {
  const tasks = getTodayTasks();
  const filteredTasks = tasks.filter((t) => matchesFilter(t.category));

  tasksList.innerHTML = '';
  filteredTasks.forEach((task) => {
    tasksList.appendChild(createItemElement(task));
  });

  const tasksHasItems = filteredTasks.length > 0;
  tasksEmpty.classList.toggle('hidden', tasksHasItems);

  if (!tasksHasItems && tasks.length > 0 && activeFilter !== 'all') {
    tasksEmpty.textContent = `No tasks in ${CATEGORIES[activeFilter].label}.`;
    tasksEmpty.classList.remove('hidden');
  } else {
    tasksEmpty.textContent = 'No tasks yet. What will you accomplish today?';
  }

  tasksCount.textContent =
    activeFilter === 'all'
      ? String(tasks.length)
      : `${filteredTasks.length}/${tasks.length}`;

  const completedCount = tasks.filter((t) => t.completed).length;
  clearCompletedBtn.hidden = completedCount === 0;
  clearCompletedBtn.disabled = completedCount === 0;
}

function renderProgress() {
  const { total, done, pct } = getTaskProgress();

  progressPercent.textContent = pct + '%';
  progressBarFill.style.width = pct + '%';
  progressMeta.textContent = `${done} of ${total} task${total === 1 ? '' : 's'} completed`;
  progressCard.classList.toggle('complete', pct === 100 && total > 0);
}

function render() {
  dateDisplay.textContent = formatDate();
  renderFilterButtons();
  renderLists();
  renderProgress();
}

taskForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = taskInput.value.trim();
  if (!text) return;
  addTask(text, taskCategory.value);
  taskInput.value = '';
  taskInput.focus();
});

clearCompletedBtn.addEventListener('click', clearCompletedTasks);

ensureTodayTasks();
render();
