// Supabase client and data functions

const DB = (() => {
  let supabase = null;

  function init() {
    if (typeof window.supabase === 'undefined' || !window.supabase.createClient) {
      debugLog('ERROR', 'Supabase JS library not loaded. Check CDN link.');
      return;
    }
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    debugLog('STATE', 'Supabase client initialized');
  }

  function getClient() {
    return supabase;
  }

  // ---- Players ----

  async function getPlayerByUsername(username) {
    debugLog('API_REQ', `Fetching player: ${username}`);
    const { data, error } = await supabase
      .from('players')
      .select('*')
      .eq('username', username)
      .maybeSingle();

    if (error) {
      debugLog('API_ERR', `Failed to fetch player: ${error.message}`, error);
      throw error;
    }
    debugLog('API_RES', data ? `Player found: ${data.username}` : 'Player not found', data);
    return data;
  }

  async function createPlayer(username, aiProvider, apiKey) {
    debugLog('API_REQ', `Creating player: ${username}`);
    const { data, error } = await supabase
      .from('players')
      .insert({ username, ai_provider: aiProvider, api_key: apiKey })
      .select()
      .single();

    if (error) {
      debugLog('API_ERR', `Failed to create player: ${error.message}`, error);
      throw error;
    }
    debugLog('API_RES', `Player created: ${data.username}`, data);
    return data;
  }

  async function updatePlayer(playerId, updates) {
    const dbUpdates = {};
    if (updates.aiProvider !== undefined) dbUpdates.ai_provider = updates.aiProvider;
    if (updates.apiKey !== undefined) dbUpdates.api_key = updates.apiKey;

    debugLog('API_REQ', `Updating player: ${playerId}`, dbUpdates);
    const { data, error } = await supabase
      .from('players')
      .update(dbUpdates)
      .eq('id', playerId)
      .select()
      .single();

    if (error) {
      debugLog('API_ERR', `Failed to update player: ${error.message}`, error);
      throw error;
    }
    debugLog('API_RES', 'Player updated', data);
    return data;
  }

  // ---- Save Slots ----

  async function getSaveSlots(playerId) {
    debugLog('API_REQ', `Fetching save slots for player: ${playerId}`);
    const { data, error } = await supabase
      .from('save_slots')
      .select('*')
      .eq('player_id', playerId)
      .order('slot_number', { ascending: true });

    if (error) {
      debugLog('API_ERR', `Failed to fetch save slots: ${error.message}`, error);
      throw error;
    }
    debugLog('API_RES', `Found ${data.length} save slot(s)`, data);
    return data;
  }

  async function createSaveSlot(playerId, slotNumber, gameState) {
    debugLog('SAVE', `Creating save slot ${slotNumber}`);
    const { data, error } = await supabase
      .from('save_slots')
      .insert({
        player_id: playerId,
        slot_number: slotNumber,
        game_state: gameState,
        status: 'active',
      })
      .select()
      .single();

    if (error) {
      debugLog('API_ERR', `Failed to create save slot: ${error.message}`, error);
      throw error;
    }
    debugLog('SAVE', `Save slot ${slotNumber} created`, data);
    return data;
  }

  async function updateSaveSlot(slotId, gameState, status = 'active') {
    debugLog('SAVE', `Updating save slot: ${slotId}`);
    const { data, error } = await supabase
      .from('save_slots')
      .update({ game_state: gameState, status })
      .eq('id', slotId)
      .select()
      .single();

    if (error) {
      debugLog('API_ERR', `Failed to update save slot: ${error.message}`, error);
      throw error;
    }
    debugLog('SAVE', 'Save slot updated', data);
    return data;
  }

  async function deleteSaveSlot(slotId) {
    debugLog('API_REQ', `Deleting save slot: ${slotId}`);
    const { error } = await supabase
      .from('save_slots')
      .delete()
      .eq('id', slotId);

    if (error) {
      debugLog('API_ERR', `Failed to delete save slot: ${error.message}`, error);
      throw error;
    }
    debugLog('API_RES', 'Save slot deleted');
  }

  return {
    init, getClient,
    getPlayerByUsername, createPlayer, updatePlayer,
    getSaveSlots, createSaveSlot, updateSaveSlot, deleteSaveSlot,
  };
})();
