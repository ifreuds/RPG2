// Supabase configuration
const SUPABASE_URL = 'https://plgfzdotjanxcgmewqoo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsZ2Z6ZG90amFueGNnbWV3cW9vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3OTc5MjAsImV4cCI6MjA4NjM3MzkyMH0.QmiJKvjcCgE8zUcQ5Qxx-Nx8UOgzZLTl87BU202YQo8';

// Game defaults
const DEFAULT_AUTO_SAVE_INTERVAL = 5;
const DEFAULT_STARTING_HP = 100;
const DEFAULT_STAT_POINTS = 10;
const MAX_STAT_VALUE = 5;
const MAX_KEY_NPCS = 10;
const SPECIAL_ABILITY_BONUS = 5;
const RECENT_TURNS_TO_KEEP = 5;

// AI Provider endpoints
const AI_PROVIDERS = {
  openai: {
    name: 'OpenAI (ChatGPT)',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o-mini'
  },
  mistral: {
    name: 'Mistral',
    endpoint: 'https://api.mistral.ai/v1/chat/completions',
    defaultModel: 'mistral-small-latest'
  },
  grok: {
    name: 'Grok',
    endpoint: 'https://api.x.ai/v1/chat/completions',
    defaultModel: 'grok-4-1-fast'
  }
};
