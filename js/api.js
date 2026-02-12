// AI Provider API abstraction layer

const AI = (() => {
  // System prompt for structured JSON responses
  const GAME_SYSTEM_PROMPT = `You are an AI narrator for a text-based RPG. You MUST respond with valid JSON only — no markdown, no code fences, no explanation outside the JSON.

Every response must follow this exact schema:
{
  "story": "string — narrative text describing what happens next",
  "event": null or {
    "type": "stat_check" | "combat" | "item_found" | "npc_encounter" | "story_end",
    "stat": "STR" | "DEX" | "INT" | "CHA" | "WIL",
    "difficulty": number between 1-20,
    "severity": "basic" | "important",
    "success_hint": "string — what happens on success",
    "fail_hint": "string — what happens on failure"
  },
  "item_gained": null or "string — name of item gained",
  "item_lost": null or "string — name of item lost",
  "new_npc": null or {
    "name": "string",
    "role": "string — their role in the story",
    "personality": "string — brief personality description",
    "appearance": "string — brief visual description",
    "relationship": 0
  },
  "npc_updates": null or [{ "name": "string", "change": number, "reason": "string" }],
  "hp_change": 0,
  "xp_gained": 0,
  "game_end": false
}

Rules:
- "story" is always required and must be a vivid, engaging narrative (2-4 paragraphs)
- Only include an "event" when the player's action involves risk, challenge, or significant interaction
- stat_check: when the action requires a skill check
- combat: when engaging in battle
- item_found: when discovering an item
- npc_encounter: when meeting someone important
- story_end: when the story reaches a natural conclusion
- difficulty ranges: Easy 8, Medium 12, Hard 16, Near Impossible 20
- "severity": "basic" = story consequence only, "important" = HP loss on failure
- hp_change: negative for damage, positive for healing. Only apply AFTER dice results, not preemptively
- xp_gained: 5-15 for minor events, 20-50 for major events
- game_end: true only when the story reaches a definitive ending (victory or defeat)
- Do NOT decide dice outcomes — just set up the check. The game engine handles rolls.
- Keep NPCs consistent with established profiles`;

  const WORLD_GEN_SYSTEM_PROMPT = `You are a world builder for a text-based RPG. Generate a unique, compelling world based on the player's preferences. Respond with valid JSON only — no markdown, no code fences.

Response schema:
{
  "name": "string — world/setting name",
  "genre": "string — the genre",
  "tone": "string — the tone",
  "details": "string — 2-3 paragraph world description",
  "goal": "string — the player's main objective",
  "startingScenario": "string — opening scene description (2-3 paragraphs)"
}`;

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
    });

    // Current action
    messages.push({ role: 'user', content: playerAction });

    return messages;
  }

  // Build the world context header for game system prompt
  function buildWorldContext() {
    const world = GameState.getWorld();
    const char = GameState.getCharacter();
    const game = GameState.getGame();

    let context = GAME_SYSTEM_PROMPT;
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

  return {
    sendPrompt, validateGameResponse, validateWorldResponse,
    buildGameMessages, buildWorldContext,
    GAME_SYSTEM_PROMPT, WORLD_GEN_SYSTEM_PROMPT,
  };
})();
