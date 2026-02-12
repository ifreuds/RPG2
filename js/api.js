// AI Provider API abstraction layer

const AI = (() => {
  // System prompt for structured JSON responses
  const GAME_SYSTEM_PROMPT = `You are an AI narrator for a text-based RPG. You MUST respond with valid JSON only — no markdown, no code fences, no explanation outside the JSON.

Every response must follow this exact schema:
{
  "story": "string — narrative text",
  "event": null or {
    "type": "stat_check" | "combat" | "item_found" | "npc_encounter" | "story_end",
    "stat": "STR" | "DEX" | "INT" | "CHA" | "WIL",
    "difficulty": number between 1-20,
    "severity": "basic" | "important",
    "success_hint": "string — what happens on success",
    "fail_hint": "string — what happens on failure"
  },
  "item_gained": null or "string",
  "item_lost": null or "string",
  "new_npc": null or { "name": "string", "role": "string", "personality": "string", "appearance": "string", "relationship": 0 },
  "npc_updates": null or [{ "name": "string", "change": number, "reason": "string" }],
  "hp_change": 0,
  "xp_gained": 0,
  "game_end": false
}

CRITICAL NARRATION RULES:

READING LEVEL:
- Write at a teen/young-adult novel reading level by default. Use clear, simple vocabulary and medium-length sentences.
- Avoid purple prose, archaic phrasing, and overly literary language unless the narrator style specifically demands it.
- The goal is fun, immersive, and easy to read — not impressive vocabulary.

KNOWLEDGE BOUNDARIES (IMPORTANT):
- You have META knowledge (character sheet, NPC list, world details) for game mechanics only.
- The NARRATOR must NEVER use information the player character hasn't learned in-story yet.
- If the player hasn't exchanged names with an NPC, refer to them by appearance or role ("the hooded woman", "the guard captain", "the stranger") — NOT by name.
- NPCs should also not know the player's name until introduced. Use "you" or descriptive references.
- Names are only used AFTER an in-story introduction or name exchange happens.
- The same applies to facts, locations, and secrets — only reveal what the character has discovered.

STORY LENGTH (ADAPTIVE):
- Match length to the moment's narrative weight. Do NOT stick to a fixed sentence count.
- Casual/minor actions (walking, looking around, small talk): 3-5 sentences.
- Standard turns (exploration, conversation, discovery): 5-8 sentences.
- Significant moments (plot twists, dramatic reveals, first encounters, combat setup): 7-10 sentences.
- Romance, intimacy, and deep emotional scenes: 8-14 sentences with mature, expressive prose.
- Use this as a guide, not a hard rule. If a moment needs more room, take it. If it's simple, keep it short.

OPEN-ENDED ENDINGS:
- ALWAYS end "story" with an unresolved situation, a question, a cliffhanger, or a moment demanding player choice.
- NEVER wrap up a scene neatly. The player must feel compelled to type what they do next.
- Good endings: "The door creaks open, revealing darkness beyond. Something shifts inside." or "She looks at you, waiting for an answer."

EVENTS & PACING:
- Only include "event" when the PLAYER'S ACTION explicitly involves risk, combat, or something requiring a skill check.
- Exploration, dialogue, and travel often need NO event. Let the story breathe between challenges.
- When you DO include an event, the "story" describes ONLY the setup — the moment of tension BEFORE the outcome. Do NOT resolve it. The dice roll determines what happens next.

DO NOT DECIDE DICE OUTCOMES — just set up the check. The game engine handles rolls and will ask you for the outcome separately.

Event rules:
- stat_check: when an action requires a skill check
- combat: when engaging in battle
- item_found: when discovering an item (no dice needed)
- npc_encounter: when meeting someone important (no dice needed)
- story_end: when the story reaches a natural conclusion
- difficulty: Easy 8, Medium 12, Hard 16, Near Impossible 20
- severity: "basic" = story consequence only, "important" = HP loss on failure
- hp_change / xp_gained: set to 0 when an event is present (applied after dice resolution)
- game_end: true ONLY for definitive story endings`;

  // System prompt specifically for narrating dice outcomes
  // HP and XP are handled mechanically by the game engine — the AI only narrates.
  const DICE_OUTCOME_PROMPT = `You are continuing as the RPG narrator. The player just attempted an action that required a dice roll. The game engine has already calculated HP loss and XP gain — your ONLY job is to narrate what happened.

Respond with valid JSON only:
{
  "story": "string — narrate the outcome of the dice roll, then end with a new open-ended situation",
  "item_gained": null or "string",
  "item_lost": null or "string",
  "new_npc": null or { "name": "string", "role": "string", "personality": "string", "appearance": "string", "relationship": 0 },
  "npc_updates": null or [{ "name": "string", "change": number, "reason": "string" }],
  "game_end": false
}

Rules:
- Write at teen/young-adult novel reading level — clear, vivid, easy to follow.
- On SUCCESS: Narrate a favorable outcome. Be satisfying and descriptive (4-7 sentences).
- On FAILURE with "basic" severity: Narrate a setback or complication, no damage taken (3-5 sentences).
- On FAILURE with "important" severity: Narrate taking damage or a serious consequence. Reference the injury/damage. The HP loss amount is provided (4-7 sentences).
- ALWAYS end with a new open-ended situation that demands the player's next action.
- Respect knowledge boundaries — don't reveal names or information the character hasn't learned.
- Do NOT include hp_change or xp_gained in your response — the engine handles those.`;

  const WORLD_GEN_SYSTEM_PROMPT = `You are a world builder for a text-based RPG. Generate a unique, compelling world based on the player's preferences. Respond with valid JSON only — no markdown, no code fences.

Response schema:
{
  "name": "string — world/setting name",
  "genre": "string — the genre",
  "tone": "string — the tone",
  "details": "string — 2-3 paragraph world description",
  "goal": "string — the player's main objective",
  "startingScenario": "string — brief opening scene setup (1 short paragraph, NOT the full opening narration)"
}

Note: Keep "startingScenario" brief — it's a scene SETUP that the narrator will expand on when gameplay starts. Do not write the full opening narration here.

Write all descriptions in clear, accessible language at a teen/young-adult novel reading level. Avoid overly literary or archaic phrasing.`;

  async function sendPrompt(messages, systemPrompt) {
    const player = GameState.getPlayer();
    const provider = AI_PROVIDERS[player.aiProvider];

    if (!provider) {
      throw new Error(`Unknown AI provider: ${player.aiProvider}`);
    }

    if (!player.apiKey) {
      throw new Error('No API key configured');
    }

    const body = buildRequestBody(player.aiProvider, messages, systemPrompt);

    debugLog('API_REQ', `Sending to ${player.aiProvider}`, {
      endpoint: provider.endpoint,
      model: body.model,
      messageCount: messages.length,
    });

    const response = await fetch(provider.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${player.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      debugLog('API_ERR', `${provider.name} error ${response.status}`, errorText);
      throw new Error(`${provider.name} API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const content = extractContent(player.aiProvider, data);

    debugLog('API_RES', `Response from ${player.aiProvider}`, { content: content.substring(0, 200) + '...' });

    return content;
  }

  function buildRequestBody(providerKey, messages, systemPrompt) {
    const provider = AI_PROVIDERS[providerKey];
    const fullMessages = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ];

    return {
      model: provider.defaultModel,
      messages: fullMessages,
      temperature: 0.8,
      max_tokens: 2000,
    };
  }

  function extractContent(providerKey, data) {
    // All three providers use the same OpenAI-compatible format
    if (data.choices && data.choices[0] && data.choices[0].message) {
      return data.choices[0].message.content;
    }
    throw new Error('Unexpected API response format');
  }

  // Validate AI game response JSON
  function validateGameResponse(raw) {
    debugLog('VALIDATE', 'Validating AI response...');

    let parsed;
    // Strip markdown code fences if present
    let cleaned = raw.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }

    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      debugLog('VALIDATE', `JSON parse failed: ${e.message}`, raw);
      return { valid: false, data: { story: raw, event: null }, errors: ['JSON parse failed'] };
    }

    const errors = [];

    // Required: story
    if (!parsed.story || typeof parsed.story !== 'string') {
      errors.push('Missing or invalid "story" field');
      parsed.story = raw;
    }

    // Validate event if present
    if (parsed.event) {
      const validTypes = ['stat_check', 'combat', 'item_found', 'npc_encounter', 'story_end'];
      const validStats = ['STR', 'DEX', 'INT', 'CHA', 'WIL'];

      if (!validTypes.includes(parsed.event.type)) {
        errors.push(`Invalid event type: ${parsed.event.type}`);
        parsed.event = null;
      } else if (parsed.event.type === 'stat_check' || parsed.event.type === 'combat') {
        if (!validStats.includes(parsed.event.stat)) {
          errors.push(`Invalid stat: ${parsed.event.stat}`);
          parsed.event.stat = 'STR'; // fallback
        }
        if (typeof parsed.event.difficulty !== 'number' || parsed.event.difficulty < 1 || parsed.event.difficulty > 20) {
          errors.push(`Invalid difficulty: ${parsed.event.difficulty}`);
          parsed.event.difficulty = Math.min(20, Math.max(1, parsed.event.difficulty || 12));
        }
        if (!['basic', 'important'].includes(parsed.event.severity)) {
          parsed.event.severity = 'basic';
        }
      }
    }

    // Defaults
    if (parsed.hp_change === undefined) parsed.hp_change = 0;
    if (parsed.xp_gained === undefined) parsed.xp_gained = 0;
    if (parsed.game_end === undefined) parsed.game_end = false;

    if (errors.length > 0) {
      debugLog('VALIDATE', `Validation issues: ${errors.join(', ')}`, parsed);
    } else {
      debugLog('VALIDATE', 'Response validated OK');
    }

    return { valid: errors.length === 0, data: parsed, errors };
  }

  // Validate dice outcome response (narration only — no hp_change/xp_gained expected)
  function validateDiceOutcome(raw) {
    debugLog('VALIDATE', 'Validating dice outcome response...');
    let cleaned = raw.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }

    try {
      const parsed = JSON.parse(cleaned);
      if (!parsed.story || typeof parsed.story !== 'string') {
        parsed.story = cleaned;
      }
      if (parsed.game_end === undefined) parsed.game_end = false;
      debugLog('VALIDATE', 'Dice outcome validated OK');
      return { valid: true, data: parsed };
    } catch (e) {
      debugLog('VALIDATE', `Dice outcome JSON parse failed: ${e.message}`, raw);
      return { valid: false, data: { story: raw, game_end: false } };
    }
  }

  // Validate world generation response
  function validateWorldResponse(raw) {
    debugLog('VALIDATE', 'Validating world response...');
    let cleaned = raw.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }

    try {
      const parsed = JSON.parse(cleaned);
      const required = ['name', 'genre', 'tone', 'details', 'goal', 'startingScenario'];
      const missing = required.filter(f => !parsed[f]);
      if (missing.length > 0) {
        debugLog('VALIDATE', `Missing world fields: ${missing.join(', ')}`);
      }
      debugLog('VALIDATE', 'World response validated OK');
      return { valid: true, data: parsed };
    } catch (e) {
      debugLog('VALIDATE', `World JSON parse failed: ${e.message}`, raw);
      return { valid: false, data: null, error: e.message };
    }
  }

  // Build the context messages for a game turn
  function buildGameMessages(playerAction) {
    const game = GameState.getGame();
    const messages = [];

    // If we have a summary from a previous save, include it
    if (game.storySummary) {
      messages.push({
        role: 'system',
        content: `Previously: ${game.storySummary}`,
      });
    }

    // Include recent turns for context
    game.recentTurns.forEach(turn => {
      if (turn.playerAction) {
        messages.push({ role: 'user', content: turn.playerAction });
      }
      if (turn.aiResponse) {
        messages.push({ role: 'assistant', content: JSON.stringify(turn.aiResponse) });
      }
      // Include dice outcome messages if present
      if (turn.diceOutcomeResponse) {
        messages.push({ role: 'user', content: turn.diceOutcomeRequest });
        messages.push({ role: 'assistant', content: JSON.stringify(turn.diceOutcomeResponse) });
      }
    });

    // Current action
    messages.push({ role: 'user', content: playerAction });

    return messages;
  }

  // Build messages for requesting dice outcome narration
  // hpLost and xpGained are the mechanical values already applied by the engine
  function buildDiceOutcomeMessages(event, diceResult, hpLost, xpGained) {
    const game = GameState.getGame();
    const messages = [];

    // Include recent context
    if (game.storySummary) {
      messages.push({ role: 'system', content: `Previously: ${game.storySummary}` });
    }

    // Last few turns for context
    const recent = game.recentTurns.slice(-3);
    recent.forEach(turn => {
      if (turn.playerAction) messages.push({ role: 'user', content: turn.playerAction });
      if (turn.aiResponse) messages.push({ role: 'assistant', content: JSON.stringify(turn.aiResponse) });
      if (turn.diceOutcomeResponse) {
        messages.push({ role: 'user', content: turn.diceOutcomeRequest });
        messages.push({ role: 'assistant', content: JSON.stringify(turn.diceOutcomeResponse) });
      }
    });

    // The dice result message — includes what the engine already applied
    let outcomeMsg = `[DICE RESULT] The player attempted a ${event.type} — ${Utils.statFullName(event.stat)} check (DC ${event.difficulty}, severity: ${event.severity}). They rolled ${diceResult.roll} + ${diceResult.bonus} bonus = ${diceResult.total}. Result: ${diceResult.passed ? 'SUCCESS' : 'FAILURE'}.`;

    if (diceResult.passed) {
      outcomeMsg += ` The player gained ${xpGained} XP.`;
      if (event.success_hint) outcomeMsg += ` Hint: ${event.success_hint}.`;
    } else {
      outcomeMsg += ` The player gained ${xpGained} XP for the attempt.`;
      if (hpLost < 0) outcomeMsg += ` They took ${Math.abs(hpLost)} HP damage (now ${GameState.getCharacter().hp} HP).`;
      if (event.fail_hint) outcomeMsg += ` Hint: ${event.fail_hint}.`;
    }

    outcomeMsg += ' Narrate the outcome. Do NOT include hp_change or xp_gained — the engine already handled those.';

    messages.push({ role: 'user', content: outcomeMsg });

    return { messages, outcomeMsg };
  }

  // Build the world context header for game system prompt
  function buildWorldContext() {
    const world = GameState.getWorld();
    const char = GameState.getCharacter();
    const game = GameState.getGame();

    let context = GAME_SYSTEM_PROMPT;

    // Add narrator style instruction
    if (world.narratorStyle) {
      context += `\n\n--- NARRATOR STYLE ---\nAdopt this narrator persona/style: ${world.narratorStyle}. Let this influence your tone, vocabulary, and narration approach throughout the story.`;
    }

    context += `\n\n--- WORLD ---\nWorld: ${world.name}\nGenre: ${world.genre}\nTone: ${world.tone}\nDetails: ${world.details}\nGoal: ${world.goal}`;
    context += `\n\n--- CHARACTER ---\nName: ${char.name}\nGender: ${char.gender}\nLevel: ${char.level} (XP: ${char.xp}/${char.xpToNext})\nHP: ${char.hp}/${char.maxHp}`;
    context += `\nStats: STR ${char.stats.STR}, DEX ${char.stats.DEX}, INT ${char.stats.INT}, CHA ${char.stats.CHA}, WIL ${char.stats.WIL}`;
    context += `\nSpecial Ability: ${char.specialAbility.name} (+5 ${char.specialAbility.stat}) — ${char.specialAbility.description}`;

    if (game.items.length > 0) {
      context += `\n\n--- ITEMS ---\n${game.items.join(', ')}`;
    }

    if (game.keyNpcs.length > 0) {
      context += '\n\n--- KEY NPCs ---';
      game.keyNpcs.forEach(npc => {
        context += `\n${npc.name} (${npc.role}): ${npc.personality}. Relationship: ${npc.relationship}`;
      });
    }

    return context;
  }

  // Build world context for dice outcome (uses the simpler outcome prompt)
  function buildDiceOutcomeContext() {
    const world = GameState.getWorld();
    const char = GameState.getCharacter();

    let context = DICE_OUTCOME_PROMPT;

    if (world.narratorStyle) {
      context += `\n\nNarrator style: ${world.narratorStyle}`;
    }

    context += `\n\nWorld: ${world.name} (${world.genre}, ${world.tone})`;
    context += `\nCharacter: ${char.name}, HP: ${char.hp}/${char.maxHp}, Level ${char.level}`;

    return context;
  }

  return {
    sendPrompt, validateGameResponse, validateWorldResponse, validateDiceOutcome,
    buildGameMessages, buildDiceOutcomeMessages, buildWorldContext, buildDiceOutcomeContext,
    GAME_SYSTEM_PROMPT, WORLD_GEN_SYSTEM_PROMPT, DICE_OUTCOME_PROMPT,
  };
})();
