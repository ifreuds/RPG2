// App entry point — screen router, initialization, event binding

const App = (() => {
  // Cleanup registry for event listeners per screen
  const cleanupFns = {};

  function init() {
    // 1. Debug console (first)
    DebugConsole.init();
    debugLog('STATE', 'App initializing...');

    // 2. Supabase
    DB.init();

    // 3. Game engine
    GameEngine.init();

    // 4. Create toast container
    const toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);

    // 5. Bind screens
    bindWelcomeScreen();
    bindMainMenuScreen();
    bindWorldCreationScreen();
    bindCharacterCreationScreen();
    bindGameplayScreen();
    bindEpilogueScreen();

    // 6. Show welcome
    UI.showScreen('screen-welcome');
    debugLog('STATE', 'App initialized. Welcome screen shown.');
  }

  // ========== WELCOME SCREEN ==========
  function bindWelcomeScreen() {
    const form = document.getElementById('welcome-form');
    const btn = document.getElementById('welcome-enter-btn');
    const errorEl = document.getElementById('welcome-error');

    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('welcome-username').value.trim();
      const provider = document.getElementById('welcome-provider').value;
      const apiKey = document.getElementById('welcome-apikey').value.trim();

      if (!username) {
        showWelcomeError('Please enter a username.');
        return;
      }
      if (!apiKey) {
        showWelcomeError('Please enter your API key.');
        return;
      }

      UI.setLoading(btn, true);
      hideWelcomeError();

      try {
        // Check if player exists
        let player = await DB.getPlayerByUsername(username);
        if (player) {
          // Update provider/key if changed
          if (player.ai_provider !== provider || player.api_key !== apiKey) {
            player = await DB.updatePlayer(player.id, { aiProvider: provider, apiKey });
          }
        } else {
          player = await DB.createPlayer(username, provider, apiKey);
        }

        GameState.setPlayer({
          id: player.id,
          username: player.username,
          aiProvider: player.ai_provider,
          apiKey: player.api_key,
        });

        debugLog('STATE', `Player logged in: ${player.username}`);
        UI.setLoading(btn, false);
        goToMainMenu();
      } catch (err) {
        UI.setLoading(btn, false);
        showWelcomeError('Connection failed. Check your internet and try again.');
        debugLog('ERROR', `Welcome error: ${err.message}`, err.stack);
      }
    });

    // API key toggle
    const toggleBtn = document.getElementById('welcome-apikey-toggle');
    const apiKeyInput = document.getElementById('welcome-apikey');
    if (toggleBtn && apiKeyInput) {
      toggleBtn.addEventListener('click', () => {
        const isPassword = apiKeyInput.type === 'password';
        apiKeyInput.type = isPassword ? 'text' : 'password';
        toggleBtn.textContent = isPassword ? '\u25CF' : '\u25CB';
      });
    }
  }

  function showWelcomeError(msg) {
    const el = document.getElementById('welcome-error');
    if (el) { el.textContent = msg; el.classList.add('visible'); }
  }

  function hideWelcomeError() {
    const el = document.getElementById('welcome-error');
    if (el) el.classList.remove('visible');
  }

  // ========== MAIN MENU SCREEN ==========
  function goToMainMenu() {
    const player = GameState.getPlayer();
    const welcomeText = document.getElementById('menu-welcome-text');
    if (welcomeText) welcomeText.textContent = `Welcome back, ${player.username}`;
    UI.showScreen('screen-menu');
  }

  function bindMainMenuScreen() {
    // New Game
    document.getElementById('menu-new-game')?.addEventListener('click', () => {
      GameState.resetGame();
      UI.showScreen('screen-world-create');
    });

    // Load Game
    document.getElementById('menu-load-game')?.addEventListener('click', async () => {
      await showLoadGameModal();
    });

    // Settings
    document.getElementById('menu-settings')?.addEventListener('click', () => {
      openSettingsModal();
    });
  }

  async function showLoadGameModal() {
    const player = GameState.getPlayer();
    const listEl = document.getElementById('save-slot-list');
    if (!listEl) return;

    listEl.innerHTML = '<div class="loading-container"><span class="loading-ring medium"></span></div>';
    UI.openModal('load-game-modal');

    try {
      const slots = await DB.getSaveSlots(player.id);
      if (slots.length === 0) {
        listEl.innerHTML = '<div class="save-slot-empty">No saved games found. Start a new adventure!</div>';
        return;
      }

      listEl.innerHTML = '';
      slots.forEach(slot => {
        const gs = slot.game_state || {};
        const worldName = gs.world?.name || gs.world?.genre || 'Unknown World';
        const charName = gs.character?.name || 'Unknown';
        const div = document.createElement('div');
        div.className = 'save-slot';
        div.innerHTML = `
          <div class="save-slot-info">
            <div class="save-slot-name">${Utils.escapeHtml(charName)} — ${Utils.escapeHtml(worldName)}</div>
            <div class="save-slot-meta">Slot ${slot.slot_number} · Turn ${gs.turnCount || 0} · ${Utils.timeAgo(slot.updated_at)}</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            <span class="badge badge-${slot.status}">${slot.status}</span>
            <button class="btn btn-primary" data-slot-id="${slot.id}" ${slot.status !== 'active' ? 'disabled' : ''}>Continue</button>
            <button class="btn btn-outline btn-delete-save" data-slot-id="${slot.id}" title="Delete">\u2718</button>
          </div>
        `;
        listEl.appendChild(div);

        // Continue button
        div.querySelector('.btn-primary')?.addEventListener('click', async () => {
          GameState.loadFromSave(slot);
          UI.closeModal('load-game-modal');
          UI.showScreen('screen-gameplay');
          UI.updateHUD();
          await GameEngine.resumeGame();
        });

        // Delete button
        div.querySelector('.btn-delete-save')?.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (confirm('Delete this save?')) {
            try {
              await DB.deleteSaveSlot(slot.id);
              div.remove();
              UI.showToast('Save deleted', 'info');
            } catch (err) {
              debugLog('ERROR', `Delete save failed: ${err.message}`);
              UI.showToast('Failed to delete', 'error');
            }
          }
        });
      });
    } catch (err) {
      listEl.innerHTML = '<div class="save-slot-empty">Failed to load saves. Try again.</div>';
      debugLog('ERROR', `Load saves failed: ${err.message}`, err.stack);
    }
  }

  function openSettingsModal() {
    const player = GameState.getPlayer();
    const settings = GameState.get().settings;

    const providerEl = document.getElementById('settings-provider');
    const apiKeyEl = document.getElementById('settings-apikey');
    const autoSaveEl = document.getElementById('settings-autosave');
    const autoSaveValEl = document.getElementById('settings-autosave-val');

    if (providerEl) providerEl.value = player.aiProvider;
    if (apiKeyEl) apiKeyEl.value = player.apiKey;
    if (autoSaveEl) autoSaveEl.value = settings.autoSaveInterval;
    if (autoSaveValEl) autoSaveValEl.textContent = settings.autoSaveInterval;

    UI.openModal('settings-modal');
  }

  // ========== WORLD CREATION SCREEN ==========
  function bindWorldCreationScreen() {
    const generateBtn = document.getElementById('world-generate-btn');
    const acceptBtn = document.getElementById('world-accept-btn');
    const regenBtn = document.getElementById('world-regen-btn');

    // "Let AI Decide" toggles
    document.querySelectorAll('.ai-decide-toggle').forEach(toggle => {
      toggle.addEventListener('change', (e) => {
        const field = document.getElementById(e.target.dataset.field);
        if (field) {
          field.classList.toggle('ai-decided', e.target.checked);
          if (e.target.checked) {
            field.value = '';
            field.placeholder = 'AI will decide...';
          } else {
            field.placeholder = field.dataset.placeholder || '';
          }
        }
      });
    });

    generateBtn?.addEventListener('click', async () => {
      await generateWorld();
    });

    acceptBtn?.addEventListener('click', () => {
      // World already stored in state by generateWorld
      UI.showScreen('screen-char-create');
    });

    regenBtn?.addEventListener('click', async () => {
      await generateWorld();
    });
  }

  async function generateWorld() {
    const genre = document.getElementById('world-genre')?.value.trim();
    const tone = document.getElementById('world-tone')?.value.trim();
    const details = document.getElementById('world-details')?.value.trim();
    const goal = document.getElementById('world-goal')?.value.trim();
    const scenario = document.getElementById('world-scenario')?.value.trim();

    const genBtn = document.getElementById('world-generate-btn');
    UI.setLoading(genBtn, true);

    const userMsg = `Create a world with these preferences:
Genre: ${genre || 'You decide — surprise me'}
Tone: ${tone || 'You decide — surprise me'}
World Details: ${details || 'You decide — create something unique'}
Main Goal: ${goal || 'You decide — give the player a compelling objective'}
Starting Scenario: ${scenario || 'You decide — craft an intriguing opening'}`;

    try {
      const raw = await AI.sendPrompt(
        [{ role: 'user', content: userMsg }],
        AI.WORLD_GEN_SYSTEM_PROMPT
      );
      const result = AI.validateWorldResponse(raw);

      if (!result.valid || !result.data) {
        throw new Error('Invalid world response from AI');
      }

      // Store in state
      const world = GameState.getWorld();
      Object.assign(world, result.data);

      // Show preview
      showWorldPreview(result.data);
      UI.setLoading(genBtn, false);
    } catch (err) {
      UI.setLoading(genBtn, false);
      debugLog('ERROR', `World generation failed: ${err.message}`, err.stack);
      UI.showToast('World generation failed. Check API key and try again.', 'error');
    }
  }

  function showWorldPreview(worldData) {
    const preview = document.getElementById('world-preview');
    if (!preview) return;

    document.getElementById('preview-name').textContent = worldData.name || '';
    document.getElementById('preview-genre').textContent = worldData.genre || '';
    document.getElementById('preview-tone').textContent = worldData.tone || '';
    document.getElementById('preview-details').textContent = worldData.details || '';
    document.getElementById('preview-goal').textContent = worldData.goal || '';
    document.getElementById('preview-scenario').textContent = worldData.startingScenario || '';

    preview.classList.add('visible');
    preview.scrollIntoView({ behavior: 'smooth' });
  }

  // ========== CHARACTER CREATION SCREEN ==========
  function bindCharacterCreationScreen() {
    let pointsRemaining = DEFAULT_STAT_POINTS;
    const stats = { STR: 0, DEX: 0, INT: 0, CHA: 0, WIL: 0 };

    function updateStatDisplay() {
      document.getElementById('stat-points-remaining').textContent = `Points Remaining: ${pointsRemaining}`;

      Object.keys(stats).forEach(stat => {
        const valEl = document.getElementById(`stat-val-${stat}`);
        if (valEl) valEl.textContent = stats[stat];

        const minusBtn = document.getElementById(`stat-minus-${stat}`);
        const plusBtn = document.getElementById(`stat-plus-${stat}`);
        if (minusBtn) minusBtn.disabled = stats[stat] <= 0;
        if (plusBtn) plusBtn.disabled = stats[stat] >= MAX_STAT_VALUE || pointsRemaining <= 0;
      });

      // Enable/disable begin button
      const beginBtn = document.getElementById('char-begin-btn');
      const nameInput = document.getElementById('char-name');
      if (beginBtn) {
        beginBtn.disabled = pointsRemaining > 0 || !(nameInput && nameInput.value.trim());
      }
    }

    // Stat buttons
    Object.keys(stats).forEach(stat => {
      document.getElementById(`stat-minus-${stat}`)?.addEventListener('click', () => {
        if (stats[stat] > 0) {
          stats[stat]--;
          pointsRemaining++;
          updateStatDisplay();
        }
      });

      document.getElementById(`stat-plus-${stat}`)?.addEventListener('click', () => {
        if (stats[stat] < MAX_STAT_VALUE && pointsRemaining > 0) {
          stats[stat]++;
          pointsRemaining--;
          updateStatDisplay();
        }
      });
    });

    // Name input validation
    document.getElementById('char-name')?.addEventListener('input', updateStatDisplay);

    // Gender toggle
    document.querySelectorAll('.gender-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.gender-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });

    // Begin Adventure button
    document.getElementById('char-begin-btn')?.addEventListener('click', async () => {
      const name = document.getElementById('char-name').value.trim();
      const gender = document.querySelector('.gender-btn.selected')?.dataset.gender || 'unspecified';
      const abilityName = document.getElementById('ability-name')?.value.trim() || 'None';
      const abilityStat = document.getElementById('ability-stat')?.value || 'STR';
      const abilityDesc = document.getElementById('ability-desc')?.value.trim() || '';

      // Store character in state
      const char = GameState.getCharacter();
      char.name = name;
      char.gender = gender;
      Object.assign(char.stats, stats);
      char.specialAbility = { name: abilityName, stat: abilityStat, description: abilityDesc };

      debugLog('STATE', 'Character created', char);

      // Create save slot
      const player = GameState.getPlayer();
      const game = GameState.getGame();
      try {
        const slots = await DB.getSaveSlots(player.id);
        const nextSlot = slots.length > 0 ? Math.max(...slots.map(s => s.slot_number)) + 1 : 1;
        const saveState = GameState.buildSaveState();
        const saved = await DB.createSaveSlot(player.id, nextSlot, saveState);
        game.saveSlotId = saved.id;
        game.slotNumber = saved.slot_number;
      } catch (err) {
        debugLog('ERROR', `Failed to create save slot: ${err.message}`);
      }

      // Transition to gameplay
      UI.showScreen('screen-gameplay');
      UI.updateHUD();
      await GameEngine.startNewGame();
    });

    updateStatDisplay();
  }

  // ========== GAMEPLAY SCREEN ==========
  function bindGameplayScreen() {
    const input = document.getElementById('gameplay-input-field');
    const sendBtn = document.getElementById('gameplay-send-btn');

    // Send action
    const sendAction = () => {
      const text = input.value.trim();
      if (!text || GameEngine.getIsProcessing()) return;
      input.value = '';
      GameEngine.handlePlayerAction(text);
    };

    sendBtn?.addEventListener('click', sendAction);

    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendAction();
      }
    });

    // HUD menu button
    document.getElementById('hud-menu-btn')?.addEventListener('click', UI.openDrawer);
    document.getElementById('side-drawer-backdrop')?.addEventListener('click', UI.closeDrawer);

    // Drawer items
    document.getElementById('drawer-save')?.addEventListener('click', () => {
      UI.closeDrawer();
      GameEngine.manualSave();
    });

    document.getElementById('drawer-settings')?.addEventListener('click', () => {
      UI.closeDrawer();
      openSettingsModal();
    });

    document.getElementById('drawer-quit')?.addEventListener('click', () => {
      UI.closeDrawer();
      if (confirm('Return to main menu? Unsaved progress will be lost.')) {
        goToMainMenu();
      }
    });
  }

  // ========== EPILOGUE SCREEN ==========
  function bindEpilogueScreen() {
    document.getElementById('epilogue-menu-btn')?.addEventListener('click', () => {
      goToMainMenu();
    });

    document.getElementById('epilogue-save-log')?.addEventListener('click', () => {
      exportStoryLog();
    });
  }

  function exportStoryLog() {
    const game = GameState.getGame();
    const char = GameState.getCharacter();
    const world = GameState.getWorld();

    let log = `=== AI Narrative Engine — Story Log ===\n`;
    log += `World: ${world.name} (${world.genre})\n`;
    log += `Character: ${char.name}\n`;
    log += `Turns: ${game.turnCount} | Level: ${char.level} | Status: ${game.status}\n`;
    log += `${'='.repeat(40)}\n\n`;

    game.storyHistory.forEach((turn, i) => {
      if (turn.playerAction) {
        log += `> ${turn.playerAction}\n\n`;
      }
      if (turn.aiResponse && turn.aiResponse.story) {
        log += `${turn.aiResponse.story}\n\n`;
      }
      log += `---\n\n`;
    });

    const blob = new Blob([log], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `story-${char.name}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);

    UI.showToast('Story log exported', 'success');
  }

  // ========== SETTINGS MODAL SAVE ==========
  function bindSettingsModal() {
    document.getElementById('settings-save-btn')?.addEventListener('click', async () => {
      const provider = document.getElementById('settings-provider')?.value;
      const apiKey = document.getElementById('settings-apikey')?.value.trim();
      const autoSave = parseInt(document.getElementById('settings-autosave')?.value || '5');

      const player = GameState.getPlayer();
      player.aiProvider = provider;
      player.apiKey = apiKey;
      GameState.setSettings({ autoSaveInterval: autoSave });

      try {
        await DB.updatePlayer(player.id, { aiProvider: provider, apiKey });
        UI.showToast('Settings saved', 'success');
      } catch (err) {
        debugLog('ERROR', `Settings save failed: ${err.message}`);
        UI.showToast('Failed to save settings', 'error');
      }

      UI.closeModal('settings-modal');
    });

    // Auto-save slider value display
    document.getElementById('settings-autosave')?.addEventListener('input', (e) => {
      const val = document.getElementById('settings-autosave-val');
      if (val) val.textContent = e.target.value;
    });
  }

  // ========== MODAL CLOSE BINDINGS ==========
  function bindModalCloses() {
    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', () => {
        const modal = btn.closest('.modal-backdrop');
        if (modal) modal.classList.remove('active');
      });
    });

    // Close modal on backdrop click
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) backdrop.classList.remove('active');
      });
    });
  }

  // Run on DOMContentLoaded
  document.addEventListener('DOMContentLoaded', () => {
    init();
    bindSettingsModal();
    bindModalCloses();
  });

  return { init, goToMainMenu };
})();
