// Central game state — single source of truth

const GameState = (() => {
  const state = {
    // Current screen
    currentScreen: 'welcome',

    // Player identity (from Supabase)
    player: {
      id: null,
      username: '',
      aiProvider: 'openai',
      apiKey: '',
    },

    // Settings
    settings: {
      autoSaveInterval: DEFAULT_AUTO_SAVE_INTERVAL,
      imageGeneration: false,
      typewriterSpeed: 50, // ms per word
    },

    // Current game session
    game: {
      saveSlotId: null,
      slotNumber: null,
      status: 'active', // active | completed | failed

      // World
      world: {
        name: '',
        genre: '',
        tone: '',
        details: '',
        goal: '',
        startingScenario: '',
        summary: '',
      },

      // Character
      character: {
        name: '',
        gender: '',
        level: 1,
        xp: 0,
        xpToNext: 100,
        hp: DEFAULT_STARTING_HP,
        maxHp: DEFAULT_STARTING_HP,
        stats: { STR: 0, DEX: 0, INT: 0, CHA: 0, WIL: 0 },
        specialAbility: {
          name: '',
          stat: 'STR',
          description: '',
        },
      },

      // NPCs (Tier 1, max 10)
      keyNpcs: [],

      // Items
      items: [],

      // Story
      storyHistory: [],   // Full history in memory (for current session)
      recentTurns: [],     // Last N raw turns (for save/context)
      storySummary: '',    // Compressed summary for context window management
      turnCount: 0,
      lastSaveTurn: 0,

      // AI conversation messages
      aiMessages: [],

      // Current event state
      pendingEvent: null,
    },
  };

  function get() {
    return state;
  }

  function getGame() {
    return state.game;
  }

  function getCharacter() {
    return state.game.character;
  }

  function getWorld() {
    return state.game.world;
  }

  function getPlayer() {
    return state.player;
  }

  function setPlayer(data) {
    Object.assign(state.player, data);
  }

  function setSettings(data) {
    Object.assign(state.settings, data);
  }

  function resetGame() {
    state.game = {
      saveSlotId: null,
      slotNumber: null,
      status: 'active',
      world: { name: '', genre: '', tone: '', details: '', goal: '', startingScenario: '', summary: '' },
      character: {
        name: '', gender: '', level: 1, xp: 0, xpToNext: 100,
        hp: DEFAULT_STARTING_HP, maxHp: DEFAULT_STARTING_HP,
        stats: { STR: 0, DEX: 0, INT: 0, CHA: 0, WIL: 0 },
        specialAbility: { name: '', stat: 'STR', description: '' },
      },
      keyNpcs: [],
      items: [],
      storyHistory: [],
      recentTurns: [],
      storySummary: '',
      turnCount: 0,
      lastSaveTurn: 0,
      aiMessages: [],
      pendingEvent: null,
    };
    debugLog('STATE', 'Game state reset');
  }

  function loadFromSave(saveData) {
    const g = state.game;
    g.saveSlotId = saveData.id;
    g.slotNumber = saveData.slot_number;
    g.status = saveData.status;

    const gs = saveData.game_state;
    if (!gs) return;

    // World
    Object.assign(g.world, gs.world || {});

    // Character
    if (gs.character) {
      Object.assign(g.character, gs.character);
    }

    // NPCs, items
    g.keyNpcs = gs.keyNpcs || [];
    g.items = gs.items || [];

    // Story
    g.recentTurns = gs.recentTurns || [];
    g.storySummary = gs.storySummary || '';
    g.turnCount = gs.turnCount || 0;
    g.lastSaveTurn = gs.turnCount || 0;

    // Rebuild story history from recent turns
    g.storyHistory = [...g.recentTurns];

    // Rebuild AI messages from context
    g.aiMessages = [];

    debugLog('LOAD', `Game loaded: ${g.world.name || g.world.genre} — ${g.character.name}`, gs);
  }

  function buildSaveState() {
    const g = state.game;
    return {
      world: { ...g.world },
      character: { ...g.character, stats: { ...g.character.stats }, specialAbility: { ...g.character.specialAbility } },
      keyNpcs: g.keyNpcs.map(npc => ({ ...npc })),
      items: [...g.items],
      recentTurns: g.recentTurns.slice(-RECENT_TURNS_TO_KEEP),
      storySummary: g.storySummary,
      turnCount: g.turnCount,
    };
  }

  function addStoryEntry(entry) {
    const g = state.game;
    g.storyHistory.push(entry);
    g.recentTurns.push(entry);

    // Keep recent turns trimmed
    if (g.recentTurns.length > RECENT_TURNS_TO_KEEP) {
      g.recentTurns = g.recentTurns.slice(-RECENT_TURNS_TO_KEEP);
    }
  }

  function incrementTurn() {
    state.game.turnCount++;
    return state.game.turnCount;
  }

  function shouldAutoSave() {
    const g = state.game;
    return (g.turnCount - g.lastSaveTurn) >= state.settings.autoSaveInterval;
  }

  function markSaved() {
    state.game.lastSaveTurn = state.game.turnCount;
  }

  return {
    get, getGame, getCharacter, getWorld, getPlayer,
    setPlayer, setSettings, resetGame,
    loadFromSave, buildSaveState,
    addStoryEntry, incrementTurn, shouldAutoSave, markSaved,
  };
})();
