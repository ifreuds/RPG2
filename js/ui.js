// UI helpers — DOM manipulation, toasts, typewriter, screen rendering

const UI = (() => {
  let typewriterTimer = null;
  let typewriterResolve = null;

  // ---- Screen Management ----
  function showScreen(screenId) {
    const prev = document.querySelector('.screen.active');
    const next = document.getElementById(screenId);

    if (!next) {
      debugLog('ERROR', `Screen not found: ${screenId}`);
      return;
    }

    if (prev && prev !== next) {
      prev.classList.remove('active');
    }

    next.classList.add('active');
    GameState.get().currentScreen = screenId;
    debugLog('STATE', `Screen: ${screenId}`);
  }

  // ---- Toast Notifications ----
  function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = { success: '\u2714', error: '\u2718', info: '\u2139' };
    toast.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span>${Utils.escapeHtml(message)}</span>`;

    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // ---- Loading State ----
  function setLoading(buttonEl, isLoading) {
    if (!buttonEl) return;
    if (isLoading) {
      buttonEl.disabled = true;
      buttonEl._originalHTML = buttonEl.innerHTML;
      buttonEl.innerHTML = '<span class="loading-ring"></span>';
    } else {
      buttonEl.disabled = false;
      if (buttonEl._originalHTML) {
        buttonEl.innerHTML = buttonEl._originalHTML;
      }
    }
  }

  function showLoadingArea(containerId, message) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.classList.add('visible');
    const textEl = el.querySelector('.loading-text');
    if (textEl) textEl.textContent = message || Utils.getLoadingMessage();
  }

  function hideLoadingArea(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.classList.remove('visible');
  }

  // Rotating loading text
  let loadingTextTimer = null;
  function startRotatingLoadingText(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const textEl = el.querySelector('.loading-text');
    if (!textEl) return;
    loadingTextTimer = setInterval(() => {
      textEl.textContent = Utils.getLoadingMessage();
    }, 3000);
  }

  function stopRotatingLoadingText() {
    if (loadingTextTimer) {
      clearInterval(loadingTextTimer);
      loadingTextTimer = null;
    }
  }

  // ---- Typewriter Effect ----
  function typewrite(containerEl, text, speed = 50) {
    return new Promise((resolve) => {
      cancelTypewriter();
      typewriterResolve = resolve;

      containerEl.innerHTML = '';
      containerEl.classList.add('typewriter-cursor');

      const words = text.split(' ');
      let i = 0;

      typewriterTimer = setInterval(() => {
        if (i >= words.length) {
          cancelTypewriter();
          resolve();
          return;
        }
        containerEl.innerHTML += (i > 0 ? ' ' : '') + words[i];
        i++;
        // Auto-scroll story area
        const storyArea = containerEl.closest('.story-area');
        if (storyArea) storyArea.scrollTop = storyArea.scrollHeight;
      }, speed);

      // Click to complete instantly
      const clickHandler = () => {
        containerEl.removeEventListener('click', clickHandler);
        cancelTypewriter();
        containerEl.innerHTML = text;
        resolve();
      };
      containerEl.addEventListener('click', clickHandler);
    });
  }

  function cancelTypewriter() {
    if (typewriterTimer) {
      clearInterval(typewriterTimer);
      typewriterTimer = null;
    }
    const cursor = document.querySelector('.typewriter-cursor');
    if (cursor) cursor.classList.remove('typewriter-cursor');
    if (typewriterResolve) {
      typewriterResolve = null;
    }
  }

  // ---- Story Display ----
  function addStoryNarration(containerEl, text) {
    const entry = document.createElement('div');
    entry.className = 'story-entry';
    const narration = document.createElement('div');
    narration.className = 'story-narration';
    const p = document.createElement('p');
    entry.appendChild(narration);
    narration.appendChild(p);
    containerEl.appendChild(entry);
    return typewrite(p, text, GameState.get().settings.typewriterSpeed);
  }

  function addPlayerAction(containerEl, text) {
    const div = document.createElement('div');
    div.className = 'story-player-action';
    div.textContent = text;
    containerEl.appendChild(div);
    // Scroll to bottom
    const storyArea = containerEl.closest('.story-area');
    if (storyArea) storyArea.scrollTop = storyArea.scrollHeight;
  }

  function addEventCard(containerEl, event) {
    const card = document.createElement('div');
    const typeClass = event.type.replace('_', '-');
    card.className = `event-card ${typeClass}`;

    const labels = {
      stat_check: 'Skill Check',
      combat: 'Combat',
      item_found: 'Item Found',
      npc_encounter: 'NPC Encounter',
      story_end: 'Story End',
    };

    card.innerHTML = `
      <div class="event-card-label" style="color: inherit;">${labels[event.type] || event.type}</div>
      <div style="font-family: var(--font-ui); font-size: 13px; color: var(--text-primary);">
        ${event.stat ? `<strong>${Utils.statFullName(event.stat)}</strong> check — ` : ''}
        ${event.difficulty ? `Difficulty: ${event.difficulty} (${Utils.difficultyLabel(event.difficulty)})` : ''}
        ${event.severity === 'important' ? ' <span style="color: var(--accent-red);">[Important]</span>' : ''}
      </div>
    `;

    containerEl.appendChild(card);
    const storyArea = containerEl.closest('.story-area');
    if (storyArea) storyArea.scrollTop = storyArea.scrollHeight;
  }

  // ---- Dice Result Display ----
  function showDiceResult(containerEl, result) {
    const div = document.createElement('div');
    div.className = 'dice-result';
    div.innerHTML = `
      <div class="dice-result-roll">${result.roll}</div>
      <div class="dice-result-bonus">+ ${result.bonus} bonus = ${result.total}</div>
      <div class="dice-result-total">vs difficulty ${result.difficulty}</div>
      <div class="dice-verdict ${result.passed ? 'success' : 'failure'}">
        ${result.passed ? 'SUCCESS' : 'FAILED'}
      </div>
    `;
    containerEl.appendChild(div);
    const storyArea = containerEl.closest('.story-area');
    if (storyArea) storyArea.scrollTop = storyArea.scrollHeight;
  }

  // ---- HUD Update ----
  function updateHUD() {
    const char = GameState.getCharacter();
    const game = GameState.getGame();

    const nameEl = document.getElementById('hud-char-name');
    if (nameEl) nameEl.textContent = char.name;

    // HP
    const hpFill = document.getElementById('hud-hp-fill');
    const hpLabel = document.getElementById('hud-hp-label');
    if (hpFill) {
      const pct = Math.max(0, (char.hp / char.maxHp) * 100);
      hpFill.style.width = pct + '%';
      hpFill.className = `stat-bar-fill ${Utils.hpColorClass(char.hp, char.maxHp)}`;
    }
    if (hpLabel) hpLabel.textContent = `HP ${char.hp}/${char.maxHp}`;

    // Level / XP
    const levelEl = document.getElementById('hud-level');
    if (levelEl) levelEl.textContent = `Lv ${char.level}`;

    const xpFill = document.getElementById('hud-xp-fill');
    if (xpFill) {
      const xpPct = Math.min(100, (char.xp / char.xpToNext) * 100);
      xpFill.style.width = xpPct + '%';
    }
  }

  // ---- HP animation flash ----
  function flashHP(type) {
    const hudHp = document.querySelector('.hud-hp');
    if (!hudHp) return;
    hudHp.style.animation = type === 'damage' ? 'hpFlashRed 600ms ease' : 'hpFlashGreen 600ms ease';
    setTimeout(() => { hudHp.style.animation = ''; }, 600);
  }

  // ---- Modal helpers ----
  function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('active');
  }

  function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
  }

  // ---- Side drawer ----
  function openDrawer() {
    document.getElementById('side-drawer-backdrop')?.classList.add('active');
    document.getElementById('side-drawer')?.classList.add('open');
  }

  function closeDrawer() {
    document.getElementById('side-drawer-backdrop')?.classList.remove('active');
    document.getElementById('side-drawer')?.classList.remove('open');
  }

  return {
    showScreen, showToast, setLoading,
    showLoadingArea, hideLoadingArea, startRotatingLoadingText, stopRotatingLoadingText,
    typewrite, cancelTypewriter,
    addStoryNarration, addPlayerAction, addEventCard, showDiceResult,
    updateHUD, flashHP,
    openModal, closeModal, openDrawer, closeDrawer,
  };
})();
