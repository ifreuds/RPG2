// Core game loop, event handling, dice logic, save triggering
//
// GAME FLOW:
// 1. Story arrives (open-ended, may include event setup)
// 2. If NO event → player types next action → back to step 1
// 3. If event with dice check → player rolls → result sent to AI → AI narrates outcome → back to step 2
// This ensures dice results AFFECT the story, not just HP mechanically.

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
        content: `Begin the adventure. Setting: ${world.startingScenario}. The player character enters the scene. Set the opening — describe where they are and what's immediately happening, then leave them at a moment where they need to decide what to do. Do NOT include a dice event on the first turn. Do NOT use the character's name until it has been introduced in-story (NPCs don't know who the player is yet). Refer to the player as "you".`,
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
        // Also show dice outcome story if present
        if (turn.diceOutcomeResponse && turn.diceOutcomeResponse.story) {
          const entry = document.createElement('div');
          entry.className = 'story-entry';
          const narration = document.createElement('div');
          narration.className = 'story-narration';
          narration.innerHTML = `<p>${Utils.escapeHtml(turn.diceOutcomeResponse.story)}</p>`;
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

    // Handle items (for non-dice events like item_found)
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

    // Build the turn entry (will be augmented if dice outcome happens)
    const turnEntry = {
      playerAction,
      aiResponse: data,
      diceOutcomeRequest: null,
      diceOutcomeResponse: null,
      timestamp: new Date().toISOString(),
    };

    // Handle event — this is where the flow diverges
    if (data.event && (data.event.type === 'stat_check' || data.event.type === 'combat')) {
      // DICE CHECK FLOW:
      // 1. Show event card
      // 2. Player rolls dice
      // 3. Send result to AI for outcome narration
      // 4. Display outcome story
      const diceOutcome = await handleDiceEvent(data.event, storyContainer);
      if (diceOutcome) {
        turnEntry.diceOutcomeRequest = diceOutcome.request;
        turnEntry.diceOutcomeResponse = diceOutcome.response;
      }
    } else if (data.event) {
      // Non-dice events (item_found, npc_encounter, story_end)
      debugLog('GAME_EVT', `Event: ${data.event.type}`, data.event);
      UI.addEventCard(storyContainer, data.event);
    }

    // Apply XP/HP from the initial response (only for non-dice turns)
    if (!data.event || (data.event.type !== 'stat_check' && data.event.type !== 'combat')) {
      if (data.xp_gained && data.xp_gained > 0) applyXP(data.xp_gained);
      if (data.hp_change && data.hp_change !== 0) applyHP(data.hp_change);
    }

    // Store the turn
    GameState.addStoryEntry(turnEntry);

    // Increment turn
    const turnCount = GameState.incrementTurn();
    debugLog('GAME_EVT', `Turn ${turnCount} complete`);

    // Check game end (from initial response or dice outcome)
    const outcomeData = turnEntry.diceOutcomeResponse;
    if (data.game_end || (outcomeData && outcomeData.game_end)) {
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

  // Calculate HP loss mechanically based on difficulty and severity
  function calculateHPLoss(event) {
    if (event.severity !== 'important') return 0;
    // Scale HP loss with difficulty: DC 8 = -5, DC 12 = -7, DC 16 = -9, DC 20 = -12
    return -(Math.floor(event.difficulty / 3) + 2);
  }

  // Calculate XP gain mechanically based on pass/fail and difficulty
  function calculateXP(passed, difficulty) {
    if (passed) {
      // Scale with difficulty: DC 8 = 10 XP, DC 12 = 15 XP, DC 16 = 20 XP, DC 20 = 25 XP
      return 5 + Math.floor(difficulty / 2) * 2;
    }
    // Flat 5 XP for attempting, regardless of difficulty
    return 5;
  }

  // Handle a dice-based event (stat_check or combat)
  // Returns { request, response } for the dice outcome, or null
  async function handleDiceEvent(event, storyContainer) {
    debugLog('GAME_EVT', `Dice event: ${event.type}`, event);
    UI.addEventCard(storyContainer, event);

    // Wait for player to click the dice roll button
    const diceResult = await waitForDiceRoll(event);
    if (!diceResult) return null;

    // MECHANICAL: Apply HP and XP immediately based on game rules
    let hpLost = 0;
    const xpGained = calculateXP(diceResult.passed, event.difficulty);

    if (!diceResult.passed) {
      hpLost = calculateHPLoss(event);
      if (hpLost < 0) {
        applyHP(hpLost);
      }
    }
    applyXP(xpGained);

    debugLog('GAME_EVT', `Mechanical result: HP ${hpLost}, XP +${xpGained}`);

    // Now send the dice result to the AI for NARRATION ONLY
    try {
      showGameplayLoading(true);

      const systemPrompt = AI.buildDiceOutcomeContext();
      const { messages, outcomeMsg } = AI.buildDiceOutcomeMessages(event, diceResult, hpLost, xpGained);

      const raw = await AI.sendPrompt(messages, systemPrompt);
      const { data: outcomeData } = AI.validateDiceOutcome(raw);

      showGameplayLoading(false);

      // Display the outcome story
      if (outcomeData.story) {
        await UI.addStoryNarration(storyContainer, outcomeData.story);
      }

      // Handle items/NPCs from outcome (story-driven, not mechanical)
      if (outcomeData.item_gained) {
        GameState.getGame().items.push(outcomeData.item_gained);
        UI.showToast(`Item found: ${outcomeData.item_gained}`, 'success');
      }
      if (outcomeData.item_lost) {
        const game = GameState.getGame();
        const idx = game.items.indexOf(outcomeData.item_lost);
        if (idx !== -1) game.items.splice(idx, 1);
      }
      if (outcomeData.new_npc) addNPC(outcomeData.new_npc);
      if (outcomeData.npc_updates) updateNPCs(outcomeData.npc_updates);

      return { request: outcomeMsg, response: outcomeData };

    } catch (err) {
      debugLog('ERROR', `Dice outcome request failed: ${err.message}`, err.stack);
      showGameplayLoading(false);

      // Fallback: HP/XP already applied above, just show basic narration
      const fallbackStory = diceResult.passed
        ? 'You succeed in your attempt.'
        : 'Your attempt fails.';
      await UI.addStoryNarration(storyContainer, fallbackStory);

      return null;
    }
  }

  function waitForDiceRoll(event) {
    return new Promise((resolve) => {
      const diceBtn = document.getElementById('dice-roll-btn');
      const inputField = document.getElementById('gameplay-input-field');
      const sendBtn = document.getElementById('gameplay-send-btn');

      if (!diceBtn) { resolve(null); return; }

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

    manualSave();
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

    const summaryHtml = `
      <div class="summary-row"><span class="summary-label">Turns Played</span><span class="summary-value">${game.turnCount}</span></div>
      <div class="summary-row"><span class="summary-label">Final Level</span><span class="summary-value">${char.level}</span></div>
      <div class="summary-row"><span class="summary-label">Final HP</span><span class="summary-value">${char.hp}/${char.maxHp}</span></div>
      <div class="summary-row"><span class="summary-label">NPCs Met</span><span class="summary-value">${game.keyNpcs.length}</span></div>
      <div class="summary-row"><span class="summary-label">Items Collected</span><span class="summary-value">${game.items.length}</span></div>
    `;
    const summaryContainer = document.getElementById('epilogue-summary');
    if (summaryContainer) summaryContainer.innerHTML = summaryHtml;

    const lastTurn = game.recentTurns[game.recentTurns.length - 1];
    if (storyEl && lastTurn) {
      const lastStory = lastTurn.diceOutcomeResponse?.story || lastTurn.aiResponse?.story || '';
      storyEl.textContent = lastStory;
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
