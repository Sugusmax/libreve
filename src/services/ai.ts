import {
  getProvider,
  type AiProvider,
  type ProviderId,
} from '../data/providers';
import { loadActiveProvider, loadApiKey } from './apiKey';
import { fetchCover } from './covers';

export type BookSuggestion = {
  title: string;
  author: string;
  reason: string;
  // Capítulos o partes totales de la obra, estimados por la IA.
  totalChapters?: number;
  coverUrl?: string;
  coverLargeUrl?: string;
  coverLicense?: string;
  coverSource?: string;
};

export type BookChapter = {
  number: number;
  title: string;
  summary: string;
  // Pista mínima para el siguiente capítulo; evita reenviar resúmenes completos.
  continuation?: string;
  // Proveedor y modelo que generaron este capítulo.
  aiUsed?: string;
  // La IA indica que este capítulo cierra la obra.
  isLast?: boolean;
};

type StatusReporter = (message: string) => void;
// `reset` se usa al cambiar de modelo: descarta el texto parcial anterior.
type ChunkReporter = (chunk: string, reset?: boolean) => void;

type ChapterProgress = {
  title: string;
  summary: string;
  isLast?: boolean;
};

type AiResponse = {
  text: string;
  provider: ProviderId;
  model: string;
};

type JsonSchema = {
  type: 'object';
  properties: Record<string, unknown>;
  required: string[];
};

const SYSTEM_PROMPT =
  'Eres un bibliotecario. Recomienda exactamente 6 libros concretos en español. ' +
  'Devuelve solo JSON: ' +
  '{"books":[{"title":"Título","author":"Autor","reason":"máx. 12 palabras","total_chapters":N}]}. ' +
  'El motivo explica brevemente por qué encaja con los intereses. ' +
  'total_chapters es el número de capítulos o partes que tiene el libro; si no es seguro, da una estimación.';

const SUMMARY_SYSTEM_PROMPT =
  'Eres un resumidor de libros. Resume SOLO el siguiente capítulo o parte, en español neutro. ' +
  'Devuelve solo JSON: ' +
  '{"is_last":false,"chapter":N,"title":"Título","summary":"Párrafo 1.\\n\\nPárrafo 2.","continuation":"pista de máx. 12 palabras"}. ' +
  'El campo is_last debe ir primero en el JSON. ' +
  'El summary debe tener entre 6 y 8 párrafos, de 600 a 900 palabras en total, separados por \\n\\n. ' +
  'Aprovecha casi todo el límite de 3000 tokens de salida: no cortes el resumen antes de tiempo. ' +
  'El campo chapter debe ser exactamente el número pedido. No repitas capítulos anteriores. ' +
  'Pon "is_last": true únicamente si este capítulo es el desenlace, el epílogo o el cierre del libro; ' +
  'si la obra continúa, pon false. Cuando "is_last" sea true, deja "continuation" vacío.';

const SIMILAR_SYSTEM_PROMPT =
  'Eres un bibliotecario. Recomienda entre 6 y 8 libros concretos y reales en español, ' +
  'similares al libro indicado. Devuelve solo JSON: ' +
  '{"books":[{"title":"Título","author":"Autor","reason":"máx. 12 palabras","total_chapters":N}]}. ' +
  'total_chapters es el número de capítulos o partes del libro; si no es seguro, estima. ' +
  'No incluyas el libro indicado ni repitas títulos.';

const BOOKS_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    books: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          author: { type: 'string' },
          reason: { type: 'string' },
          total_chapters: { type: 'number' },
        },
        required: ['title', 'author', 'reason', 'total_chapters'],
      },
    },
  },
  required: ['books'],
};

const SUMMARY_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    is_last: { type: 'boolean' },
    chapter: { type: 'number' },
    title: { type: 'string' },
    summary: {
      type: 'string',
      description: '6 a 8 párrafos, 600 a 900 palabras, separados por saltos de línea',
    },
    continuation: { type: 'string' },
  },
  required: ['chapter', 'title', 'summary', 'continuation', 'is_last'],
};

function buildUserPrompt(interests: string[]): string {
  return `Intereses: ${interests.join(', ')}. Devuelve 6 libros con motivo breve.`;
}

function buildSummaryPrompt(
  book: BookSuggestion,
  previous: BookChapter[],
  targetNumber: number,
): string {
  const done = previous
    .map((chapter) => `${chapter.number}:${chapter.title}`)
    .join('; ');
  const hint = previous[previous.length - 1]?.continuation?.trim();

  return [
    `Libro: "${book.title}" — ${book.author}.`,
    `Capítulo a resumir: ${targetNumber}.`,
    done ? `Ya resumidos: ${done}.` : 'Sin capítulos previos.',
    hint ? `Siguiente: ${hint}.` : '',
    book.totalChapters
      ? `El libro tiene ${book.totalChapters} capítulos o partes en total; no los superes.`
      : '',
    'Indica con is_last si este capítulo cierra el libro.',
  ]
    .filter(Boolean)
    .join(' | ');
}

function buildSimilarPrompt(
  book: BookSuggestion,
  alreadyRead: BookSuggestion[],
): string {
  const excluded = alreadyRead.length
    ? ` El usuario ya leyó estos libros, no los repitas: ${alreadyRead
        .map((item) => `"${item.title}" de ${item.author}`)
        .join('; ')}.`
    : '';

  return `Libro: "${book.title}" — ${book.author}.${excluded} Devuelve entre 6 y 8 títulos similares que el usuario todavía no haya leído, con motivo breve.`;
}

type StatusError = Error & { status?: number };

function withStatus(message: string, status?: number): StatusError {
  const error = new Error(message) as StatusError;
  error.status = status;
  return error;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Gemini indica cuándo se reinicia la cuota, por ejemplo "retry in 3h55m45s".
function rateLimitDelayMs(message: string): number {
  const match = /retry in (?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/i.exec(message);

  if (!match) {
    return 0;
  }

  const [, hours = '0', minutes = '0', seconds = '0'] = match;
  return (
    (Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)) * 1000
  );
}

function formatDelay(ms: number): string {
  const minutes = Math.round(ms / 60000);

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

function extractGeminiText(raw: string): string {
  let data: any;

  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('Gemini devolvió una respuesta inesperada.');
  }

  if (typeof data?.output_text === 'string') {
    return data.output_text;
  }

  const steps = Array.isArray(data?.steps) ? data.steps : [];

  return steps
    .flatMap((step: any) =>
      Array.isArray(step?.content)
        ? step.content
            .filter((part: any) => part?.type === 'text' && part?.text)
            .map((part: any) => part.text)
        : [],
    )
    .join('');
}

type StreamEvent = { text?: string; error?: string };
type SseConsumer = (eventName: string, payload: any) => StreamEvent | void;

// Lector SSE común a los tres proveedores. Cada uno decide qué campo del
// evento es texto y cuál es un error.
function createSseParser(consume: SseConsumer, onChunk: ChunkReporter) {
  let buffer = '';
  let full = '';
  let streamError = '';
  let eventName = '';
  let warnedPayload = false;

  const handleLine = (rawLine: string) => {
    const line = rawLine.replace(/\r$/, '');

    if (!line) {
      eventName = '';
      return;
    }

    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim();
      return;
    }

    if (!line.startsWith('data:')) {
      return;
    }

    const payload = line.slice(5).trimStart().trim();

    if (!payload || payload === '[DONE]') {
      return;
    }

    let parsed: any;

    try {
      parsed = JSON.parse(payload);
    } catch {
      if (__DEV__ && !warnedPayload) {
        warnedPayload = true;
        console.warn('[IA] evento SSE no JSON:', payload.slice(0, 200));
      }
      return;
    }

    const result = consume(eventName, parsed);

    if (result?.error) {
      streamError = result.error;
      return;
    }

    if (result?.text) {
      full += result.text;
      onChunk(result.text);
    }

    eventName = '';
  };

  return {
    push(chunk: string) {
      buffer += chunk;

      // Procesamos cada línea en cuanto está completa: algunos proveedores no
      // separan los eventos con una línea en blanco.
      let newlineIndex = buffer.indexOf('\n');

      while (newlineIndex >= 0 && !streamError) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        handleLine(line);
        newlineIndex = buffer.indexOf('\n');
      }
    },
    finish(): string {
      if (buffer.trim() && !streamError) {
        handleLine(buffer);
      }

      if (streamError) {
        throw withStatus(streamError, 500);
      }

      return full;
    },
  };
}

// React Native (whatwg-fetch) no expone `Response.body` como ReadableStream.
// En ese caso leemos el texto completo y lo procesamos como SSE, en vez de
// pasar un cuerpo `data: …` a `response.json()` (que provoca un error de parse).
async function readSseResponse(
  response: Response,
  consume: SseConsumer,
  onChunk: ChunkReporter,
): Promise<string> {
  const parser = createSseParser(consume, onChunk);
  const body = (response as Response & { body?: ReadableStream<Uint8Array> })
    .body;

  if (body && typeof body.getReader === 'function') {
    const reader = body.getReader();
    const decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        parser.push(
          decoder
            ? decoder.decode(value, { stream: true })
            : String.fromCharCode(...Array.from(value)),
        );
      }
    } finally {
      reader.releaseLock();
    }
  } else {
    parser.push(await response.text());
  }

  return parser.finish();
}

async function callGemini(
  apiKey: string,
  prompt: string,
  systemPrompt: string,
  schema: JsonSchema,
  model: string,
  maxOutputTokens: number,
  configMode: 'full' | 'maxOnly' | 'none' = 'full',
  onChunk?: ChunkReporter,
): Promise<string> {
  // Gemini 4 no admite thinking_level minimal: evitamos un pedido fallido.
  const effectiveMode =
    configMode === 'full' && model.startsWith('gemini-4-')
      ? 'maxOnly'
      : configMode;

  // La key va en la URL y el body como text/plain para evitar el preflight CORS en navegador.
  const url = `https://generativelanguage.googleapis.com/v1beta/interactions?key=${encodeURIComponent(apiKey)}`;
  const body: Record<string, unknown> = {
    model,
    system_instruction: systemPrompt,
    input: prompt,
    response_format: {
      type: 'text',
      mime_type: 'application/json',
      schema,
    },
  };

  if (effectiveMode === 'full') {
    body.generation_config = {
      thinking_level: 'minimal',
      max_output_tokens: maxOutputTokens,
    };
  } else if (effectiveMode === 'maxOnly') {
    body.generation_config = { max_output_tokens: maxOutputTokens };
  }

  if (onChunk) {
    body.stream = true;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
      ...(onChunk ? { Accept: 'text/event-stream' } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let data: any;

    try {
      data = JSON.parse(await response.text());
    } catch {
      data = undefined;
    }

    const message =
      data?.error?.message ??
      data?.message ??
      `Error ${response.status} al consultar Gemini.`;

    if (__DEV__) {
      console.warn('[Gemini]', model, response.status, message);
    }

    // Algunos modelos no aceptan `thinking_level`; conservamos el límite de salida.
    if (
      effectiveMode !== 'none' &&
      response.status === 400 &&
      /thinking|generation_config|invalid argument/i.test(message)
    ) {
      return callGemini(
        apiKey,
        prompt,
        systemPrompt,
        schema,
        model,
        maxOutputTokens,
        effectiveMode === 'full' ? 'maxOnly' : 'none',
        onChunk,
      );
    }

    throw withStatus(message, response.status);
  }

  if (onChunk) {
    return readSseResponse(
      response,
      (_eventName, parsed) => {
        if (parsed?.event_type === 'error') {
          return {
            error: parsed?.error?.message ?? 'Error en el stream de Gemini.',
          };
        }

        if (
          parsed?.event_type === 'step.delta' &&
          parsed?.delta?.type === 'text' &&
          typeof parsed.delta.text === 'string'
        ) {
          return { text: parsed.delta.text };
        }
      },
      onChunk,
    );
  }

  return extractGeminiText(await response.text());
}

// OpenAI, Groq, Mistral, DeepSeek y OpenRouter comparten el formato de
// Chat Completions; solo cambia la URL base y el modelo.
async function callOpenAiCompatible(
  provider: AiProvider,
  apiKey: string,
  prompt: string,
  systemPrompt: string,
  model: string,
  maxOutputTokens: number,
  onChunk?: ChunkReporter,
): Promise<string> {
  // Groq recomienda meter las instrucciones en el mensaje de usuario y usar
  // max_completion_tokens; sus modelos gpt-oss además razonan antes de responder.
  const isGroq = provider.id === 'groq';
  const requestBody: Record<string, unknown> = {
    model,
    messages: isGroq
      ? [{ role: 'user', content: `${systemPrompt}\n\n${prompt}` }]
      : [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
    ...(isGroq
      ? {
          max_completion_tokens: Math.max(maxOutputTokens, 1200),
          reasoning_effort: 'low',
        }
      : { max_tokens: maxOutputTokens }),
    stream: Boolean(onChunk),
  };
  const response = await fetch(`${provider.endpoint}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const raw = await response.text();
    let message = `Error ${response.status} al consultar ${provider.label}.`;

    try {
      const parsed = JSON.parse(raw);
      message = parsed?.error?.message ?? parsed?.message ?? message;
    } catch {
      // El cuerpo no era JSON; conservamos el mensaje genérico.
    }

    if (__DEV__) {
      console.warn('[IA]', provider.id, model, response.status, message);
    }

    throw withStatus(message, response.status);
  }

  if (onChunk) {
    const streamed = await readSseResponse(
      response,
      (_eventName, parsed) => {
        const error = parsed?.error?.message ?? parsed?.message;

        if (error && parsed?.choices === undefined) {
          return { error };
        }

        const text = parsed?.choices?.[0]?.delta?.content;
        return typeof text === 'string' ? { text } : undefined;
      },
      onChunk,
    );

    if (!streamed.trim()) {
      throw new Error(
        `${provider.label} devolvió una respuesta vacía. Reintenta o cambia de modelo.`,
      );
    }

    return streamed;
  }

  const raw = await response.text();
  let parsed: any;

  try {
    parsed = JSON.parse(raw);
  } catch {
    if (__DEV__) {
      console.warn('[IA] respuesta no JSON', provider.id, model, raw.slice(0, 400));
    }

    throw new Error(`${provider.label} devolvió una respuesta inesperada.`);
  }

  const text = parsed?.choices?.[0]?.message?.content;

  if (typeof text !== 'string' || !text.trim()) {
    if (__DEV__) {
      console.warn(
        '[IA] respuesta sin texto',
        provider.id,
        model,
        JSON.stringify(parsed).slice(0, 800),
      );
    }

    throw new Error(
      `${provider.label} devolvió una respuesta vacía. Reintenta o cambia de modelo.`,
    );
  }

  return text;
}

async function callAnthropic(
  provider: AiProvider,
  apiKey: string,
  prompt: string,
  systemPrompt: string,
  model: string,
  maxOutputTokens: number,
  onChunk?: ChunkReporter,
): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxOutputTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
      stream: Boolean(onChunk),
    }),
  });

  if (!response.ok) {
    const raw = await response.text();
    let message = `Error ${response.status} al consultar Claude.`;

    try {
      const parsed = JSON.parse(raw);
      message = parsed?.error?.message ?? parsed?.message ?? message;
    } catch {
      // El cuerpo no era JSON; conservamos el mensaje genérico.
    }

    if (__DEV__) {
      console.warn('[IA]', provider.id, model, response.status, message);
    }

    throw withStatus(message, response.status);
  }

  if (onChunk) {
    return readSseResponse(
      response,
      (streamEvent, parsed) => {
        if (streamEvent === 'error' || parsed?.type === 'error') {
          return {
            error:
              parsed?.error?.message ?? parsed?.message ?? 'Error en el stream de Claude.',
          };
        }

        if (
          streamEvent === 'content_block_delta' &&
          parsed?.delta?.type === 'text_delta' &&
          typeof parsed.delta.text === 'string'
        ) {
          return { text: parsed.delta.text };
        }
      },
      onChunk,
    );
  }

  const raw = await response.text();
  let parsed: any;

  try {
    parsed = JSON.parse(raw);
  } catch {
    if (__DEV__) {
      console.warn('[IA] respuesta no JSON', provider.id, model, raw.slice(0, 400));
    }

    throw new Error('Claude devolvió una respuesta inesperada.');
  }

  const text = Array.isArray(parsed?.content)
    ? parsed.content
        .filter(
          (part: any) => part?.type === 'text' && typeof part.text === 'string',
        )
        .map((part: any) => part.text)
        .join('')
    : '';

  if (!text) {
    throw new Error('Claude devolvió una respuesta inesperada.');
  }

  return text;
}

function isFatalProviderError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const status = (error as StatusError).status;
  const message = error.message.toLowerCase();

  return (
    status === 401 ||
    status === 403 ||
    (status === 400 &&
      (message.includes('api key') || message.includes('invalid argument'))) ||
    message.includes('quota') ||
    message.includes('billing') ||
    message.includes('api key not valid')
  );
}

function isProviderOverloaded(error: unknown): boolean {
  if (!(error instanceof Error) || isFatalProviderError(error)) {
    return false;
  }

  const status = (error as StatusError).status;

  if (status === 429 || status === 500 || status === 502 || status === 503) {
    return true;
  }

  const message = error.message.toLowerCase();

  return (
    message.includes('high demand') ||
    message.includes('overloaded') ||
    message.includes('unavailable') ||
    message.includes('capacity') ||
    message.includes('try again later')
  );
}

async function callModel(
  provider: AiProvider,
  apiKey: string,
  prompt: string,
  systemPrompt: string,
  schema: JsonSchema,
  model: string,
  maxOutputTokens: number,
  onChunk?: ChunkReporter,
): Promise<string> {
  if (provider.kind === 'gemini') {
    return callGemini(
      apiKey,
      prompt,
      systemPrompt,
      schema,
      model,
      maxOutputTokens,
      undefined,
      onChunk,
    );
  }

  if (provider.kind === 'anthropic') {
    return callAnthropic(
      provider,
      apiKey,
      prompt,
      systemPrompt,
      model,
      maxOutputTokens,
      onChunk,
    );
  }

  return callOpenAiCompatible(
    provider,
    apiKey,
    prompt,
    systemPrompt,
    model,
    maxOutputTokens,
    onChunk,
  );
}

async function callProviderWithFallback(
  provider: AiProvider,
  apiKey: string,
  prompt: string,
  systemPrompt: string,
  schema: JsonSchema,
  maxOutputTokens: number,
  onStatus?: StatusReporter,
  onChunk?: ChunkReporter,
): Promise<{ text: string; model: string }> {
  const models = [provider.model, ...(provider.fallbackModels ?? [])];
  let lastError: unknown;

  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];

    try {
      const text = await callModel(
        provider,
        apiKey,
        prompt,
        systemPrompt,
        schema,
        model,
        maxOutputTokens,
        onChunk,
      );

      return { text, model };
    } catch (error) {
      // Una key inválida o una cuota agotada no se arregla cambiando de modelo.
      if (
        isFatalProviderError(error) ||
        (index === 0 && !isProviderOverloaded(error))
      ) {
        throw error;
      }

      // Gemini indica el reinicio diario: Gastar los modelos de reserva no lo
      // soluciona y consume las pocas peticiones gratuitas que quedan.
      const delay = rateLimitDelayMs(
        error instanceof Error ? error.message : '',
      );

      if (
        provider.id === 'gemini' &&
        error instanceof Error &&
        (error as StatusError).status === 429 &&
        delay > 10 * 60_000
      ) {
        throw new Error(
          `Límite diario de Gemini alcanzado. Vuelve a intentarlo en ${formatDelay(delay)} o usa otra clave/proyecto.`,
        );
      }

      lastError = error;
      onChunk?.('', true);

      const next = models[index + 1];
      const prefix =
        error instanceof Error && (error as StatusError).status === 429
          ? 'Límite de solicitudes'
          : `${provider.label} está saturado`;

      onStatus?.(
        next
          ? `${prefix}: probando ${next}…`
          : `${prefix}: espera unos minutos antes de reintentar.`,
      );

      if (next) {
        await sleep(600 + index * 400);
      }
    }
  }

  const detail =
    lastError instanceof Error
      ? lastError.message
      : 'Vuelve a intentarlo en unos minutos.';

  throw new Error(`No se pudo generar con ${provider.label}. ${detail}`);
}

async function requestAiResult(
  systemPrompt: string,
  prompt: string,
  schema: JsonSchema,
  maxOutputTokens: number,
  onStatus?: StatusReporter,
  onChunk?: ChunkReporter,
): Promise<AiResponse> {
  const provider = await loadActiveProvider();
  const apiKey = await loadApiKey(provider.id);

  if (!apiKey) {
    throw new Error(`Guarda una clave de ${provider.label} antes de continuar.`);
  }

  const result = await callProviderWithFallback(
    provider,
    apiKey,
    prompt,
    systemPrompt,
    schema,
    maxOutputTokens,
    onStatus,
    onChunk,
  );

  return { ...result, provider: provider.id };
}

async function requestAiText(
  systemPrompt: string,
  prompt: string,
  schema: JsonSchema,
  maxOutputTokens: number,
  onStatus?: StatusReporter,
): Promise<string> {
  const result = await requestAiResult(
    systemPrompt,
    prompt,
    schema,
    maxOutputTokens,
    onStatus,
  );

  return result.text;
}

function extractJsonObject(text: string): string {
  const cleaned = text
    .trim()
    // Algunos modelos de razonamiento devuelven su análisis dentro de <think>.
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');

  return start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
}

function parseJsonObject(text: string): any {
  const extracted = extractJsonObject(text);

  try {
    return JSON.parse(extracted);
  } catch {
    if (__DEV__) {
      console.warn('[IA] JSON no válido:', extracted.slice(0, 800));
    }

    throw new Error('La IA devolvió una respuesta inesperada.');
  }
}

function normalizeTitle(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ');
}

function parseBooks(text: string, limit = 6): BookSuggestion[] {
  const parsed = parseJsonObject(text) as { books?: unknown } | unknown[];
  const rawBooks = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.books)
      ? parsed.books
      : [];

  return rawBooks
    .slice(0, limit)
    .map((item: unknown) => {
      const book = (item ?? {}) as Record<string, unknown>;
      const title = typeof book.title === 'string' ? book.title.trim() : '';
      const author =
        typeof book.author === 'string' && book.author.trim()
          ? book.author.trim()
          : 'Autor desconocido';
      const reason =
        typeof book.reason === 'string' && book.reason.trim()
          ? book.reason.trim()
          : 'Recomendado para tus intereses.';
      const rawTotal = book.total_chapters;
      const totalChapters =
        typeof rawTotal === 'number' && Number.isFinite(rawTotal) && rawTotal > 0
          ? Math.round(rawTotal)
          : undefined;

      return title
        ? {
            title,
            author,
            reason,
            ...(totalChapters ? { totalChapters } : {}),
          }
        : null;
    })
    .filter((book): book is BookSuggestion => Boolean(book));
}

// Extrae un campo de texto de un JSON aún incompleto para mostrar avance real.
function partialJsonString(raw: string, key: string): string {
  const marker = `"${key}":`;
  const markerIndex = raw.indexOf(marker);

  if (markerIndex < 0) {
    return '';
  }

  let cursor = markerIndex + marker.length;

  while (cursor < raw.length && /\s/.test(raw[cursor])) {
    cursor += 1;
  }

  if (raw[cursor] !== '"') {
    return '';
  }

  cursor += 1;
  let escaped = false;
  let end = raw.length;

  for (let index = cursor; index < raw.length; index += 1) {
    const char = raw[index];

    if (escaped) {
      escaped = false;
    } else if (char === '\\') {
      escaped = true;
    } else if (char === '"') {
      end = index;
      break;
    }
  }

  const fragment = raw.slice(cursor, end).replace(/\\+$/, '');

  try {
    return JSON.parse(`"${fragment}"`) as string;
  } catch {
    // Puede terminar en una secuencia de escape a medio escribir.
    const trimmed = fragment.replace(/\\u[0-9a-fA-F]{0,3}$/, '');

    try {
      return JSON.parse(`"${trimmed}"`) as string;
    } catch {
      return '';
    }
  }
}

function partialJsonBoolean(raw: string, key: string): boolean | undefined {
  const marker = `"${key}":`;
  const index = raw.indexOf(marker);

  if (index < 0) {
    return undefined;
  }

  const value = raw.slice(index + marker.length).trimStart();

  if (value.startsWith('true')) {
    return true;
  }

  if (value.startsWith('false')) {
    return false;
  }

  return undefined;
}

function parsePartialChapter(raw: string): ChapterProgress {
  return {
    title: partialJsonString(raw, 'title'),
    summary: partialJsonString(raw, 'summary'),
    ...(() => {
      const isLast = partialJsonBoolean(raw, 'is_last');
      return isLast === undefined ? {} : { isLast };
    })(),
  };
}

function parseChapter(text: string, fallbackNumber: number): BookChapter {
  const parsed = parseJsonObject(text) as Record<string, unknown>;
  const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';

  if (!summary) {
    throw new Error('La IA no devolvió un resumen válido.');
  }

  const number =
    typeof parsed.chapter === 'number' && parsed.chapter > 0
      ? Math.floor(parsed.chapter)
      : fallbackNumber;
  const title =
    typeof parsed.title === 'string' && parsed.title.trim()
      ? parsed.title.trim()
      : `Capítulo ${number}`;
  const continuation =
    typeof parsed.continuation === 'string'
      ? parsed.continuation.trim().replace(/\s+/g, ' ').slice(0, 160)
      : '';
  const isLast = parsed.is_last === true;

  return {
    number,
    title,
    summary,
    ...(continuation ? { continuation } : {}),
    ...(isLast ? { isLast } : {}),
  };
}

export async function fetchSuggestions(
  interests: string[],
  onStatus?: StatusReporter,
): Promise<BookSuggestion[]> {
  const text = await requestAiText(
    SYSTEM_PROMPT,
    buildUserPrompt(interests),
    BOOKS_SCHEMA,
    650,
    onStatus,
  );
  const books = parseBooks(text);

  if (books.length === 0) {
    throw new Error('La IA no devolvió sugerencias válidas.');
  }

  return Promise.all(
    books.map(async (book) => {
      const cover = await fetchCover(book.title, book.author);

      return {
        ...book,
        coverUrl: cover.url,
        coverLargeUrl: cover.largeUrl,
        coverLicense: cover.license,
        coverSource: cover.source,
      };
    }),
  );
}

export async function fetchSimilarBooks(
  book: BookSuggestion,
  onStatus?: StatusReporter,
  alreadyRead: BookSuggestion[] = [],
): Promise<BookSuggestion[]> {
  const text = await requestAiText(
    SIMILAR_SYSTEM_PROMPT,
    buildSimilarPrompt(book, alreadyRead),
    BOOKS_SCHEMA,
    600,
    onStatus,
  );
  const excluded = new Set([
    normalizeTitle(book.title),
    ...alreadyRead.map((item) => normalizeTitle(item.title)),
  ]);
  const seen = new Set<string>();
  const books = parseBooks(text, 10).filter((item) => {
    const title = normalizeTitle(item.title);

    if (!title || excluded.has(title) || seen.has(title)) {
      return false;
    }

    seen.add(title);
    return true;
  });

  if (books.length === 0) {
    throw new Error('La IA no devolvió títulos similares válidos.');
  }

  return Promise.all(
    books.slice(0, 3).map(async (book) => {
      const cover = await fetchCover(book.title, book.author);

      return {
        ...book,
        coverUrl: cover.url,
        coverLargeUrl: cover.largeUrl,
        coverLicense: cover.license,
        coverSource: cover.source,
      };
    }),
  );
}

export async function fetchBookSummary(
  book: BookSuggestion,
  previousChapters: BookChapter[],
  onStatus?: StatusReporter,
  targetNumber?: number,
  onProgress?: (progress: ChapterProgress) => void,
): Promise<BookChapter> {
  const number = targetNumber ?? previousChapters.length + 1;
  let streamedRaw = '';
  const onChunk: ChunkReporter = (chunk, reset) => {
    streamedRaw = reset ? '' : streamedRaw + chunk;
    onProgress?.(parsePartialChapter(streamedRaw));
  };
  const { text, provider, model } = await requestAiResult(
    SUMMARY_SYSTEM_PROMPT,
    buildSummaryPrompt(book, previousChapters, number),
    SUMMARY_SCHEMA,
    3000,
    onStatus,
    onChunk,
  );

  const chapter = parseChapter(text, number);

  return {
    ...chapter,
    ...(targetNumber ? { number: targetNumber } : {}),
    aiUsed: `${getProvider(provider).label} · ${model}`,
  };
}
