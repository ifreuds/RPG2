// Debug Console — built first to help debug everything else

const DebugConsole = (() => {
  const logs = [];
  let isOpen = false;
  let autoScroll = true;
  let filterText = '';
  let activeCategories = new Set();
  let errorCount = 0;

  const CATEGORIES = ['API_REQ', 'API_RES', 'API_ERR', 'VALIDATE', 'GAME_EVT', 'SAVE', 'LOAD', 'STATE', 'ERROR'];

  function init() {
    createDOM();
    installGlobalErrorHandlers();
    bindEvents();
    debugLog('STATE', 'Debug console initialized');
  }

  function createDOM() {
    // Toggle button
    const toggle = document.createElement('button');
    toggle.className = 'console-toggle';
    toggle.id = 'console-toggle';
    toggle.innerHTML = `>_<span class="error-badge" id="console-error-badge">0</span>`;
    toggle.title = 'Toggle Debug Console (`)';
    document.body.appendChild(toggle);

    // Console panel
    const panel = document.createElement('div');
    panel.className = 'console-panel';
    panel.id = 'console-panel';
    panel.innerHTML = `
      <div class="console-header">
        <span class="console-title">Debug Console</span>
        <div class="console-actions">
          <button id="console-copy-all">Copy All</button>
          <button id="console-copy-error">Copy Last Error</button>
          <button id="console-clear">Clear</button>
        </div>
      </div>
      <div class="console-filter-bar">
        <input type="text" class="console-filter-input" id="console-filter-input" placeholder="Filter logs...">
        ${CATEGORIES.map(cat => `<span class="console-filter-tag active" data-category="${cat}">${cat}</span>`).join('')}
      </div>
      <div class="console-log" id="console-log">
        <div class="console-empty">No logs yet. Events will appear here.</div>
      </div>
    `;
    document.body.appendChild(panel);
  }

  function bindEvents() {
    // Toggle console
    document.getElementById('console-toggle').addEventListener('click', toggleConsole);

    // Keyboard shortcut: backtick
    document.addEventListener('keydown', (e) => {
      if (e.key === '`' && !e.ctrlKey && !e.metaKey) {
        const tag = e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault();
        toggleConsole();
      }
    });

    // Copy all
    document.getElementById('console-copy-all').addEventListener('click', () => {
      const text = logs.map(l => `[${l.time}] [${l.category}] ${l.message}${l.data ? '\n' + JSON.stringify(l.data, null, 2) : ''}`).join('\n');
      navigator.clipboard.writeText(text).then(() => {
        window.debugLog('STATE', 'Console log copied to clipboard');
      });
    });

    // Copy last error
    document.getElementById('console-copy-error').addEventListener('click', () => {
      const lastError = [...logs].reverse().find(l => l.category === 'ERROR' || l.category === 'API_ERR');
      if (lastError) {
        const text = `[${lastError.time}] [${lastError.category}] ${lastError.message}${lastError.data ? '\n' + JSON.stringify(lastError.data, null, 2) : ''}`;
        navigator.clipboard.writeText(text);
      }
    });

    // Clear
    document.getElementById('console-clear').addEventListener('click', () => {
      logs.length = 0;
      errorCount = 0;
      updateErrorBadge();
      renderLogs();
    });

    // Filter input
    document.getElementById('console-filter-input').addEventListener('input', (e) => {
      filterText = e.target.value.toLowerCase();
      renderLogs();
    });

    // Category filter tags
    document.querySelectorAll('.console-filter-tag').forEach(tag => {
      tag.addEventListener('click', () => {
        tag.classList.toggle('active');
        const cat = tag.dataset.category;
        if (tag.classList.contains('active')) {
          activeCategories.delete(cat);
        } else {
          activeCategories.add(cat);
        }
        renderLogs();
      });
    });

    // Auto-scroll detection
    const logEl = document.getElementById('console-log');
    logEl.addEventListener('scroll', () => {
      const { scrollTop, scrollHeight, clientHeight } = logEl;
      autoScroll = (scrollHeight - scrollTop - clientHeight) < 30;
    });
  }

  function toggleConsole() {
    isOpen = !isOpen;
    document.getElementById('console-panel').classList.toggle('open', isOpen);
  }

  function installGlobalErrorHandlers() {
    window.onerror = (msg, source, line, col, error) => {
      debugLog('ERROR', `${msg} (${source}:${line}:${col})`, error?.stack);
      return false;
    };

    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      const msg = reason instanceof Error ? reason.message : String(reason);
      debugLog('ERROR', `Unhandled promise rejection: ${msg}`, reason?.stack);
    });
  }

  function debugLog(category, message, data = null) {
    const now = new Date();
    const time = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) +
      '.' + String(now.getMilliseconds()).padStart(3, '0');

    const entry = { time, category, message, data };
    logs.push(entry);

    if (category === 'ERROR' || category === 'API_ERR') {
      errorCount++;
      updateErrorBadge();
    }

    appendLogEntry(entry);
  }

  function updateErrorBadge() {
    const badge = document.getElementById('console-error-badge');
    if (!badge) return;
    badge.textContent = errorCount;
    badge.classList.toggle('visible', errorCount > 0);
  }

  function shouldShowEntry(entry) {
    // Category filter: if category is in activeCategories (disabled set), hide it
    if (activeCategories.has(entry.category)) return false;
    // Text filter
    if (filterText && !entry.message.toLowerCase().includes(filterText) && !entry.category.toLowerCase().includes(filterText)) {
      return false;
    }
    return true;
  }

  function appendLogEntry(entry) {
    const logEl = document.getElementById('console-log');
    if (!logEl) return;

    // Remove empty state
    const empty = logEl.querySelector('.console-empty');
    if (empty) empty.remove();

    if (!shouldShowEntry(entry)) return;

    const el = document.createElement('div');
    el.className = 'console-entry';
    el.innerHTML = `
      <span class="console-entry-time">${entry.time}</span>
      <span class="console-entry-tag ${entry.category}">${entry.category}</span>
      <span class="console-entry-msg">${escapeHtml(entry.message)}</span>
      ${entry.data ? `<div class="console-entry-detail">${escapeHtml(typeof entry.data === 'string' ? entry.data : JSON.stringify(entry.data, null, 2))}</div>` : ''}
    `;

    if (entry.data) {
      el.addEventListener('click', () => el.classList.toggle('expanded'));
    }

    logEl.appendChild(el);

    if (autoScroll) {
      logEl.scrollTop = logEl.scrollHeight;
    }
  }

  function renderLogs() {
    const logEl = document.getElementById('console-log');
    if (!logEl) return;
    logEl.innerHTML = '';

    const filtered = logs.filter(shouldShowEntry);
    if (filtered.length === 0) {
      logEl.innerHTML = '<div class="console-empty">No matching logs.</div>';
      return;
    }

    filtered.forEach(entry => {
      const el = document.createElement('div');
      el.className = 'console-entry';
      el.innerHTML = `
        <span class="console-entry-time">${entry.time}</span>
        <span class="console-entry-tag ${entry.category}">${entry.category}</span>
        <span class="console-entry-msg">${escapeHtml(entry.message)}</span>
        ${entry.data ? `<div class="console-entry-detail">${escapeHtml(typeof entry.data === 'string' ? entry.data : JSON.stringify(entry.data, null, 2))}</div>` : ''}
      `;
      if (entry.data) {
        el.addEventListener('click', () => el.classList.toggle('expanded'));
      }
      logEl.appendChild(el);
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  return { init, debugLog, toggleConsole };
})();

// Global function accessible from any file
window.debugLog = (category, message, data) => DebugConsole.debugLog(category, message, data);
