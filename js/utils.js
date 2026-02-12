// Utility functions, flavor text, formatters

const Utils = (() => {
  // Flavor text for loading states
  const LOADING_MESSAGES = [
    'The narrator ponders...',
    'Fate is being written...',
    'The world shifts...',
    'Destiny awaits...',
    'The threads of fate weave...',
    'The stars align...',
    'Ancient forces stir...',
    'The story unfolds...',
    'Magic flows through the words...',
    'The chronicles continue...',
  ];

  const WORLD_GEN_MESSAGES = [
    'The world is taking shape...',
    'Realities converge...',
    'A new realm materializes...',
    'The cosmos awakens...',
  ];

  const GAME_START_MESSAGES = [
    'Your story begins...',
    'The adventure awaits...',
    'Fate has chosen you...',
  ];

  function randomFrom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function getLoadingMessage() {
    return randomFrom(LOADING_MESSAGES);
  }

  function getWorldGenMessage() {
    return randomFrom(WORLD_GEN_MESSAGES);
  }

  function getGameStartMessage() {
    return randomFrom(GAME_START_MESSAGES);
  }

  // Dice roll: returns 1-20
  function rollD20() {
    return Math.floor(Math.random() * 20) + 1;
  }

  // Calculate dice check result
  function resolveDiceCheck(roll, statValue, difficulty, useSpecialAbility = false) {
    const bonus = statValue + (useSpecialAbility ? SPECIAL_ABILITY_BONUS : 0);
    const total = roll + bonus;
    const passed = total >= difficulty;
    return { roll, bonus, total, difficulty, passed };
  }

  // Format timestamp
  function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  function timeAgo(dateStr) {
    if (!dateStr) return '';
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diff = now - then;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  // HP percentage color class
  function hpColorClass(hp, maxHp) {
    const pct = (hp / maxHp) * 100;
    if (pct > 50) return 'hp';
    if (pct > 25) return 'hp warning';
    return 'hp danger';
  }

  // Escape HTML
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Stat abbreviation to full name
  const STAT_NAMES = {
    STR: 'Strength',
    DEX: 'Dexterity',
    INT: 'Intelligence',
    CHA: 'Charisma',
    WIL: 'Willpower',
  };

  function statFullName(abbr) {
    return STAT_NAMES[abbr] || abbr;
  }

  // Difficulty label
  function difficultyLabel(val) {
    if (val <= 8) return 'Easy';
    if (val <= 12) return 'Medium';
    if (val <= 16) return 'Hard';
    return 'Near Impossible';
  }

  // Debounce helper
  function debounce(fn, ms) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  }

  return {
    randomFrom, getLoadingMessage, getWorldGenMessage, getGameStartMessage,
    rollD20, resolveDiceCheck,
    formatDate, formatTime, timeAgo,
    hpColorClass, escapeHtml,
    statFullName, difficultyLabel,
    debounce,
    STAT_NAMES,
  };
})();
