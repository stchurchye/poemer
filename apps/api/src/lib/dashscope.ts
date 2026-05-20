import {
  audioMimeFromAsrFormat,
  DASHSCOPE_COMPAT_CHAT_ENDPOINT,
  DASHSCOPE_TTS_ENDPOINT,
  QWEN_ASR_MODEL,
  QWEN_TTS_MAX_CHARS,
  QWEN_TTS_MODEL,
  qwenAsrLanguageForDialect,
  resolveQwenVoiceForDialect,
  type QwenTtsDialect,
  type ReplyDialect,
} from '@shiren/shared';

export class DashScopeError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = 'DashScopeError';
  }
}

export function getDashScopeKeyFromRequest(headerKey?: string | null): string {
  const fromHeader = headerKey?.trim();
  if (fromHeader) return fromHeader;
  const fromEnv = process.env.DASHSCOPE_API_KEY?.trim();
  if (!fromEnv) throw new DashScopeError('DASHSCOPE_KEY_MISSING');
  return fromEnv;
}

export function hasDashScopeKeyConfigured(headerKey?: string | null): boolean {
  return Boolean(headerKey?.trim() || process.env.DASHSCOPE_API_KEY?.trim());
}

type DashScopeTtsResponse = {
  status_code?: number;
  code?: string;
  message?: string;
  output?: {
    finish_reason?: string;
    audio?: { url?: string; data?: string };
  };
};

function parseDialect(raw?: string | null): QwenTtsDialect {
  return raw?.trim().toLowerCase() === 'cantonese' ? 'cantonese' : 'mandarin';
}

function toHttpsUrl(url: string): string {
  return url.replace(/^http:\/\//i, 'https://');
}

async function fetchAudioBase64(url: string): Promise<string> {
  const secure = toHttpsUrl(url);
  const res = await fetch(secure);
  if (!res.ok) {
    throw new DashScopeError(`音频下载失败（${res.status}）`, res.status);
  }
  return Buffer.from(await res.arrayBuffer()).toString('base64');
}

export async function qwen3TtsSynthesize(opts: {
  apiKey: string;
  text: string;
  voice?: string;
  dialect?: QwenTtsDialect | string;
}): Promise<{ audioUrl: string; audioBase64: string }> {
  const text = opts.text.trim();
  if (!text) throw new DashScopeError('朗读内容为空');
  if (text.length > QWEN_TTS_MAX_CHARS) {
    throw new DashScopeError(`单次朗读不超过 ${QWEN_TTS_MAX_CHARS} 字，请分段朗读`);
  }

  const dialect = parseDialect(opts.dialect);
  const voice = resolveQwenVoiceForDialect(dialect, opts.voice);

  const res = await fetch(DASHSCOPE_TTS_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      model: QWEN_TTS_MODEL,
      input: {
        text,
        voice,
        language_type: 'chinese',
      },
    }),
  });

  const json = (await res.json()) as DashScopeTtsResponse;
  const rawUrl = json.output?.audio?.url?.trim();

  if (!res.ok || !rawUrl) {
    const msg =
      json.message ||
      json.code ||
      `Qwen3-TTS 请求失败（${res.status}）`;
    throw new DashScopeError(msg, res.status);
  }

  const audioUrl = toHttpsUrl(rawUrl);
  const audioBase64 = await fetchAudioBase64(audioUrl);
  return { audioUrl, audioBase64 };
}

type DashScopeAsrResponse = {
  choices?: Array<{
    message?: { content?: string };
  }>;
  message?: string;
  code?: string;
};

export async function qwen3AsrTranscribe(opts: {
  apiKey: string;
  audioBase64: string;
  format: string;
  dialect?: ReplyDialect;
}): Promise<string> {
  const raw = opts.audioBase64.replace(/\s/g, '');
  if (!raw) throw new DashScopeError('音频数据为空');

  const mime = audioMimeFromAsrFormat(opts.format);
  const dataUri = `data:${mime};base64,${raw}`;
  const language = qwenAsrLanguageForDialect(opts.dialect);

  const res = await fetch(DASHSCOPE_COMPAT_CHAT_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      model: QWEN_ASR_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'input_audio',
              input_audio: { data: dataUri },
            },
          ],
        },
      ],
      stream: false,
      asr_options: {
        language,
        enable_itn: false,
      },
    }),
  });

  const json = (await res.json()) as DashScopeAsrResponse;
  const text = json.choices?.[0]?.message?.content?.trim() ?? '';

  if (!res.ok || !text) {
    const msg = json.message || json.code || `语音识别失败（${res.status}）`;
    throw new DashScopeError(msg, res.status);
  }

  return text;
}

export async function verifyDashScopeKey(apiKey: string): Promise<void> {
  await qwen3TtsSynthesize({
    apiKey,
    text: '您好，朗读测试。',
    dialect: 'mandarin',
  });
}
