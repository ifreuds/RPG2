// Core game loop, event handling, dice logic, save triggering

const GameEngine = (() => {
  let isProcessing = false;

  async function init() {
    debugLog('GAME_EVT', 'Game engine initialized');
  }

  // Start a new game — send world + character to AI for opening scene
  async function startNewGame() {
    debugLog('GAME_EVT', 'Starting new game...');
    const world = GameState.getWorld();
    const char = GameState.getCharacter();

    const systemPrompt = AI.buildWorldContext();
    const messages = [
      {
        role: 'user',
        content: `Begin the adventure. The setting is: ${world.startingScenario}. My character "${char.name}" enters the scene. Describe the opening scene vividly and set up the first moment of the adventure. Include an initial event if appropriate.`,
      },
    ];

    try {
      showGameplayLoading(true);
      const raw = await AI.sendPrompt(messages, systemPrompt);
      const { data } = AI.validateGameResponse(raw);
      await processAIResponse(data, null);
      showGameplayLoading(false);
    } catch (err) {
      debugLog('ERROR', `Failed to start game: ${err.message}`, err.stack);
      showGameplayLoading(false);
      UI.showToast('Failed to start game. Check your API key.', 'error');
    }
  }

  // Resume a loaded game
  async function resumeGame() {
    debugLog('GAME_EVT', 'Resuming game from save...');
    const game = GameState.getGame();

    // Display recent turns in the story area
    const storyContainer = document.getElementById('story-container');
    if (storyContainer) {
      storyContainer.innerHTML = '';
      for (const turn of game.recentTurns) {
        if (turn.playerAction) {
          UI.addPlayerAction(storyContainer, turn.playerAction);
        }
        if (turn.aiResponse && turn.aiResponse.story) {
          const entry = document.createElement('div');
          entry.className = 'story-entry';
          const narration = document.createElement('div');
          narration.className = 'story-narration';
          narration.innerHTML = `<p>${Utils.escapeHtml(turn.aiResponse.story)}</p>`;
          entry.appendChild(narration);
          storyContainer.appendChild(entry);
        }
      }
    }
    UI.updateHUD();
  }

  // Handle player action
  async function handlePlayerAction(actionText) {
    if (isProcessing || !actionText.trim()) return;
    isProcessing = true;

    const storyContainer = document.getElementById('story-container');
    if (!storyContainer) {
      isProcessing = false;
      return;
    }

    // Display player action
    UI.addPlayerAction(storyContainer, actionText);

    // Build messages with context
    const systemPrompt = AI.buildWorldContext();
    const messages = AI.buildGameMessages(actionText);

    try {
      showGameplayLoading(true);
      const raw = await AI.sendPrompt(messages, systemPrompt);
      const { data } = AI.validateGameResponse(raw);
      showGameplayLoading(false);

      await processAIResponse(data, actionText);

    } catch (err) {
      debugLog('ERROR', `Action failed: ${err.message}`, err.stack);
      showGameplayLoading(false);
      UI.showToast('AI request failed. Please try again.', 'error');
    }

    isProcessing = false;
  }

  // Process a validated AI response
  async function processAIResponse(data, playerAction) {
    const storyContainer = document.getElementById('story-container');
    if (!storyContainer) return;

    // Display story narration with typewriter effect
    if (data.story) {
      await UI.addStoryNarration(storyContainer, data.story);
    }

    // Handle items
    if (data.item_gained) {
      const game = GameState.getGame();
      game.items.push(data.item_gained);
      UI.showToast(`Item found: ${data.item_gained}`, 'success');
      debugLog('GAME_EVT', `Item gained: ${data.item_gained}`);
    }
    if (data.item_lost) {
      const game = GameState.getGame();
      const idx = game.items.indexOf(data.item_lost);
      if (idx !== -1) game.items.splice(idx, 1);
      UI.showToast(`Item lost: ${data.item_lost}`, 'info');
      debugLog('GAME_EVT', `Item lost: ${data.item_lost}`);
    }

    // Handle new NPC
    if (data.new_npc) {
      addNPC(data.new_npc);
    }

    // Handle NPC relationship updates
    if (data.npc_updates) {
      updateNPCs(data.npc_updates);
    }

    // Handle event (dice check)
    if (data.event) {
      await handleEvent(data.event, storyContainer);
    }

    // Apply XP (immediate, not dependent on dice)
    if (data.xp_gained && data.xp_gained > 0) {
      applyXP(data.xp_gained);
    }

    // Apply HP change (if no event, direct HP changes from AI)
    if (data.hp_change && data.hp_change !== 0 && !data.event) {
      applyHP(data.hp_change);
    }

    // Store the turn
    GameState.addStoryEntry({
      playerAction,
      aiResponse: data,
      timestamp: new Date().toISOString(),
    });

    // Increment turn
    const turnCount = GameState.incrementTurn();
    debugLog('GAME_EVT', `Turn ${turnCount} complete`);

    // Check game end
    if (data.game_end) {
      endGame(GameState.getCharacter().hp > 0 ? 'victory' : 'defeat');
      return;
    }

    // Check if HP reached 0
    if (GameState.getCharacter().hp <= 0) {
      endGame('defeat');
      return;
    }

    // Auto-save check
    if (GameState.shouldAutoSave()) {
      await autoSave();
    }

    UI.updateHUD();
  }

  // Handle a game event (stat check, combat, etc.)
  async function handleEvent(event, storyContainer) {
    debugLog('GAME_EVT', `Event: ${event.type}`, event);
    UI.addEventCard(storyContainer, event);

    if (event.type === 'stat_check' || event.type === 'combat') {
      // Show dice roll button and wait for player to click it
      await waitForDiceRoll(event);
    } else if (event.type === 'item_found') {
      // Item already handled above
    } else if (event.type === 'npc_encounter') {
      // NPC already handled above
    } else if (event.type === 'story_end') {
      // Will be handled by game_end flag
    }
  }

  function waitForDiceRoll(event) {
    return new Promise((resolve) => {
      const diceBtn = document.getElementById('dice-roll-btn');
      const inputField = document.getElementById('gameplay-input-field');
      const sendBtn = document.getElementById('gameplay-send-btn');

      if (!diceBtn) { resolve(); return; }

      // Show dice button, hide input
      diceBtn.classList.add('visible');
      diceBtn.textContent = `Roll d20 (${event.stat})`;
      if (inputField) inputField.style.display = 'none';
      if (sendBtn) sendBtn.style.display = 'none';

      const handleClick = async () => {
        diceBtn.removeEventListener('click', handleClick);
        diceBtn.classList.remove('visible');
        if (inputField) inputField.style.display = '';
        if (sendBtn) sendBtn.style.display = '';

        // Check if this stat matches special ability
        const char = GameState.getCharacter();
        const useSpecial = char.specialAbility.stat === event.stat && char.specialAbility.name;

        const result = await Dice.roll(event.stat, event.difficulty, useSpecial);

        // Apply consequences
        if (!result.passed && event.severity === 'important') {
          // HP loss on important failure — AI provided hints
          const hpLoss = Math.max(-5, -(Math.floor(event.difficulty / 3) + 2));
          applyHP(hpLoss);
        }

        // XP for attempting events
        const xpForEvent = result.passed ? 15 : 5;
        applyXP(xpForEvent);

        resolve(result);
      };

      diceBtn.addEventListener('click', handleClick);
    });
  }

  function addNPC(npcData) {
    const game = GameState.getGame();
    if (game.keyNpcs.length >= MAX_KEY_NPCS) {
      debugLog('GAME_EVT', 'Max NPCs reached, ignoring new NPC', npcData);
      return;
    }
    // Check if NPC already exists
    const existing = game.keyNpcs.find(n => n.name.toLowerCase() === npcData.name.toLowerCase());
    if (existing) {
      debugLog('GAME_EVT', `NPC ${npcData.name} already exists, skipping`);
      return;
    }
    game.keyNpcs.push({
      name: npcData.name,
      role: npcData.role || '',
      personality: npcData.personality || '',
      appearance: npcData.appearance || '',
      relationship: npcData.relationship || 0,
    });
    debugLog('GAME_EVT', `New NPC: ${npcData.name} (${npcData.role})`, npcData);
    UI.showToast(`Met: ${npcData.name}`, 'info');
  }

  function updateNPCs(updates) {
    const game = GameState.getGame();
    updates.forEach(update => {
      const npc = game.keyNpcs.find(n => n.name.toLowerCase() === update.name.toLowerCase());
      if (npc) {
        npc.relationship = Math.max(-100, Math.min(100, npc.relationship + (update.change || 0)));
        debugLog('GAME_EVT', `NPC ${npc.name} relationship: ${npc.relationship} (${update.reason})`);
      }
    });
  }

  function applyHP(change) {
    const char = GameState.getCharacter();
    const oldHp = char.hp;
    char.hp = Math.max(0, Math.min(char.maxHp, char.hp + change));
    debugLog('GAME_EVT', `HP: ${oldHp} → ${char.hp} (${change > 0 ? '+' : ''}${change})`);
    UI.updateHUD();
    UI.flashHP(change < 0 ? 'damage' : 'heal');
  }

  function applyXP(amount) {
    const char = GameState.getCharacter();
    char.xp += amount;
    debugLog('GAME_EVT', `XP gained: +${amount} (total: ${char.xp}/${char.xpToNext})`);

    // Level up check
    while (char.xp >= char.xpToNext) {
      char.xp -= char.xpToNext;
      char.level++;
      char.xpToNext = Math.floor(char.xpToNext * 1.5);
      char.maxHp += 10;
      char.hp = Math.min(char.hp + 10, char.maxHp);
      debugLog('GAME_EVT', `Level up! Now level ${char.level}. Max HP: ${char.maxHp}`);
      UI.showToast(`Level Up! Now level ${char.level}`, 'success');
    }

    UI.updateHUD();
  }

  async function autoSave() {
    const player = GameState.getPlayer();
    const game = GameState.getGame();
    if (!player.id || !game.saveSlotId) return;

    try {
      const saveState = GameState.buildSaveState();
      await DB.updateSaveSlot(game.saveSlotId, saveState, game.status);
      GameState.markSaved();
      UI.showToast('Game Saved', 'success', 2000);
      debugLog('SAVE', `Auto-saved at turn ${game.turnCount}`);
    } catch (err) {
      debugLog('ERROR', `Auto-save failed: ${err.message}`, err.stack);
      UI.showToast('Auto-save failed', 'error');
    }
  }

  async function manualSave() {
    const player = GameState.getPlayer();
    const game = GameState.getGame();
    if (!player.id) {
      UI.showToast('No player logged in', 'error');
      return;
    }

    try {
      const saveState = GameState.buildSaveState();
      if (game.saveSlotId) {
        await DB.updateSaveSlot(game.saveSlotId, saveState, game.status);
      } else {
        // Create new save slot
        const slots = await DB.getSaveSlots(player.id);
        const nextSlot = slots.length > 0 ? Math.max(...slots.map(s => s.slot_number)) + 1 : 1;
        const saved = await DB.createSaveSlot(player.id, nextSlot, saveState);
        game.saveSlotId = saved.id;
        game.slotNumber = saved.slot_number;
      }
      GameState.markSaved();
      UI.showToast('Game Saved', 'success');
      debugLog('SAVE', `Manual save at turn ${game.turnCount}`);
    } catch (err) {
      debugLog('ERROR', `Manual save failed: ${err.message}`, err.stack);
      UI.showToast('Save failed', 'error');
    }
  }

  function endGame(outcome) {
    const game = GameState.getGame();
    game.status = outcome === 'victory' ? 'completed' : 'failed';
    debugLog('GAME_EVT', `Game ended: ${outcome}`);

    // Save final state
    manualSave();

    // Show epilogue
    showEpilogue(outcome);
  }

  function showEpilogue(outcome) {
    const char = GameState.getCharacter();
    const game = GameState.getGame();

    const titleEl = document.getElementById('epilogue-title');
    const borderEl = document.getElementById('epilogue-border');
    const storyEl = document.getElementById('epilogue-story');

    if (titleEl) {
      titleEl.textContent = outcome === 'victory' ? 'VICTORY' : 'FALLEN';
      titleEl.className = `epilogue-title ${outcome}`;
    }
    if (borderEl) {
      borderEl.className = `epilogue-border ${outcome}`;
    }

    // Build summary
    const summaryHtml = `
      <div class="summary-row"><span class="summary-label">Turns Played</span><span class="summary-value">${game.turnCount}</span></div>
      <div class="summary-row"><span class="summary-label">Final Level</span><span class="summary-value">${char.level}</span></div>
      <div class="summary-row"><span class="summary-label">Final HP</span><span class="summary-value">${char.hp}/${char.maxHp}</span></div>
      <div class="summary-row"><span class="summary-label">NPCs Met</span><span class="summary-value">${game.keyNpcs.length}</span></div>
      <div class="summary-row"><span class="summary-label">Items Collected</span><span class="summary-value">${game.items.length}</span></div>
    `;
    const summaryContainer = document.getElementById('epilogue-summary');
    if (summaryContainer) summaryContainer.innerHTML = summaryHtml;

    // Get last story entry for epilogue text
    const lastTurn = game.recentTurns[game.recentTurns.length - 1];
    if (storyEl && lastTurn && lastTurn.aiResponse) {
      storyEl.textContent = lastTurn.aiResponse.story || '';
    }

    UI.showScreen('screen-epilogue');
  }

  function showGameplayLoading(show) {
    const loadingEl = document.getElementById('gameplay-loading');
    const inputField = document.getElementById('gameplay-input-field');
    const sendBtn = document.getElementById('gameplay-send-btn');

    if (loadingEl) loadingEl.classList.toggle('visible', show);
    if (inputField) inputField.disabled = show;
    if (sendBtn) sendBtn.disabled = show;

    if (show) {
      UI.startRotatingLoadingText('gameplay-loading');
    } else {
      UI.stopRotatingLoadingText();
    }
  }

  function getIsProcessing() {
    return isProcessing;
  }

  return {
    init, startNewGame, resumeGame, handlePlayerAction,
    manualSave, endGame, getIsProcessing,
  };
})();
