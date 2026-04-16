export const STORAGE_KEYS = {
  apiBaseUrl: 'saleside_api_base_url',
  accessToken: 'access_token',
  currentUser: 'saleside_current_user',
  companyConfig: 'saleside_company_config',
  copilotConversationId: 'saleside_copilot_conversation_id',
  copilotMessages: 'saleside_copilot_messages',
};

export const DEFAULT_BACKEND_BASE_URL = 'https://saleside-back-20-production.up.railway.app';

export const COPILOT_WELCOME_MESSAGE = {
  role: 'assistant',
  content: 'I am your SaleSide Co-Pilot. Ask me about setup, pricing, objections, positioning, or your product pitch strategy.',
};

export const DEFAULT_PROMPTS = [
  'Give me a sharper pitch for our value proposition.',
  'How should I handle pricing objections for our current setup?',
  'What setup fields are missing and what should I add first?',
  'Create a discovery call script for our target audience.',
];