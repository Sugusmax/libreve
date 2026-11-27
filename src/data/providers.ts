export type ProviderId =
  | 'gemini'
  | 'openai'
  | 'anthropic'
  | 'groq'
  | 'mistral'
  | 'deepseek'
  | 'openrouter';

export type ProviderKind = 'gemini' | 'openai-compatible' | 'anthropic';

export type AiProvider = {
  id: ProviderId;
  label: string;
  shortLabel: string;
  kind: ProviderKind;
  helpUrl: string;
  linkLabel: string;
  steps: string[];
  model: string;
  fallbackModels?: string[];
  /** Marca el proveedor recomendado para este usuario. */
  preferred?: boolean;
  // Solo para los proveedores compatibles con la API de OpenAI.
  endpoint?: string;
};

// Todos los proveedores se llaman directamente desde la app: no hay backend.
// Cada clave se guarda por separado en el dispositivo.
export const providers: AiProvider[] = [
  {
    id: 'gemini',
    label: 'Google Gemini',
    shortLabel: 'Gemini',
    kind: 'gemini',
    helpUrl: 'https://aistudio.google.com/app/apikey',
    linkLabel: 'Abrir Google AI Studio',
    steps: [
      'Abre Google AI Studio con el botón de abajo e inicia sesión con tu Google.',
      'Toca «Create API key». Si te pregunta, elige «Create API key in new project».',
      'Copia la clave y vuelve aquí para pegarla con un toque.',
    ],
    model: 'gemini-3.8-flash',
    fallbackModels: [
      'gemini-4-hydrogen',
      'gemini-3.6-flash',
      'gemini-3.1-flash-lite',
      'gemini-3.5-flash-lite',
    ],
  },
  {
    id: 'openai',
    label: 'OpenAI (ChatGPT)',
    shortLabel: 'OpenAI',
    kind: 'openai-compatible',
    helpUrl: 'https://platform.openai.com/api-keys',
    linkLabel: 'Abrir OpenAI API Keys',
    steps: [
      'Abre OpenAI API Keys e inicia sesión con tu cuenta.',
      'Toca «Create new secret key», dale un nombre y cópiala.',
      'Pégala aquí. Necesitas crédito disponible en tu cuenta.',
    ],
    model: 'gpt-6-luna',
    fallbackModels: ['gpt-6.1-terra', 'gpt-6.2-sol'],
    endpoint: 'https://api.openai.com/v1',
  },
  {
    id: 'anthropic',
    label: 'Anthropic Claude',
    shortLabel: 'Claude',
    kind: 'anthropic',
    helpUrl: 'https://console.anthropic.com/settings/keys',
    linkLabel: 'Abrir Anthropic Console',
    steps: [
      'Abre la Anthropic Console y entra en tu cuenta.',
      'Ve a API keys → «Create Key» y copia la clave (empieza por sk-ant-).',
      'Pégala aquí. Tu cuenta debe tener crédito o plan activo.',
    ],
    model: 'claude-haiku-5-5',
    fallbackModels: ['claude-sonnet-5-5'],
  },
  {
    id: 'groq',
    label: 'Groq',
    shortLabel: 'Groq',
    kind: 'openai-compatible',
    preferred: true,
    helpUrl: 'https://console.groq.com/keys',
    linkLabel: 'Abrir Groq Console',
    steps: [
      'Abre Groq Console y entra con tu cuenta.',
      'Ve a API Keys → «Create API Key» y cópiala (empieza por gsk_).',
      'Pégala aquí y listo; no hace falta tarjeta para el plan gratuito.',
    ],
    model: 'openai/gpt-oss-120b',
    fallbackModels: ['openai/gpt-oss-20b'],
    endpoint: 'https://api.groq.com/openai/v1',
  },
  {
    id: 'mistral',
    label: 'Mistral AI',
    shortLabel: 'Mistral',
    kind: 'openai-compatible',
    helpUrl: 'https://console.mistral.ai/api-keys',
    linkLabel: 'Abrir Mistral Console',
    steps: [
      'Abre Mistral Console y entra en tu cuenta.',
      'Ve a API keys → «Create new key» y cópiala.',
      'Pégala aquí. Revisa el plan y el saldo de tu cuenta.',
    ],
    model: 'mistral-medium-latest',
    fallbackModels: ['mistral-large-latest'],
    endpoint: 'https://api.mistral.ai/v1',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    shortLabel: 'DeepSeek',
    kind: 'openai-compatible',
    helpUrl: 'https://platform.deepseek.com/api_keys',
    linkLabel: 'Abrir DeepSeek Platform',
    steps: [
      'Abre DeepSeek Platform y crea una cuenta si no la tienes.',
      'Ve a API keys → «Create API Key» y cópiala (empieza por sk-).',
      'Pégala aquí. Necesitas saldo en la cuenta.',
    ],
    model: 'deepseek-chat',
    endpoint: 'https://api.deepseek.com/v1',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    shortLabel: 'OpenRouter',
    kind: 'openai-compatible',
    helpUrl: 'https://openrouter.ai/keys',
    linkLabel: 'Abrir OpenRouter Keys',
    steps: [
      'Abre OpenRouter y entra con Google o GitHub.',
      'Ve a Keys → «Create Key» y cópiala (empieza por sk-or-).',
      'Pégala aquí: una clave sirve para muchos modelos distintos.',
    ],
    model: 'meta-llama/llama-3.3-70b-instruct',
    fallbackModels: ['openai/gpt-4o-mini'],
    endpoint: 'https://openrouter.ai/api/v1',
  },
];

export function getProvider(id: ProviderId): AiProvider {
  return providers.find((provider) => provider.id === id) ?? providers[0];
}

export function isProviderId(value: unknown): value is ProviderId {
  return (
    typeof value === 'string' && providers.some((provider) => provider.id === value)
  );
}
