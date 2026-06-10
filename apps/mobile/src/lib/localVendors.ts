import {
  DashScopeError,
  qwen3AsrTranscribe,
  qwen3TtsSynthesize,
  verifyDashScopeKey as verifyDashScopeKeyRemote,
  ZenMuxError,
  zenmuxOcr,
  verifyZenMuxKey as verifyZenMuxKeyRemote,
  ZENMUX_MODEL_CHAT,
  QWEN_ASR_MODEL,
  QWEN_TTS_MODEL,
  OCR_RECOGNITION_PURPOSE,
} from '@shiren/shared';
import { getDashScopeApiKey } from './dashscopeKey';
import { getZenMuxApiKey } from './zenmuxKey';
import { logLlmFailure, logLlmSuccess } from './llmLog';
import { getStoredDialect } from './tts';

function vendorError(
  e: unknown,
  missingCode: string,
  fallbackMessage: string,
): never {
  if (e instanceof DashScopeError) {
    if (e.message === 'DASHSCOPE_KEY_MISSING') {
      const err = new Error('请先在设置里填写朗读与听写密钥') as Error & { code?: string };
      err.code = missingCode;
      throw err;
    }
    const err = new Error(e.message) as Error & { code?: string };
    err.code = 'VENDOR_BAD_RESPONSE';
    throw err;
  }
  if (e instanceof ZenMuxError) {
    if (e.message === 'ZENMUX_KEY_MISSING') {
      const err = new Error('请先在设置里填写 ZenMux 密钥（问问题回答、带图与云端识图）') as Error & {
        code?: string;
      };
      err.code = 'ZENMUX_KEY_MISSING';
      throw err;
    }
    const err = new Error(e.message) as Error & { code?: string };
    err.code = 'VENDOR_BAD_RESPONSE';
    throw err;
  }
  const err = new Error(fallbackMessage) as Error & { code?: string };
  err.code = 'VENDOR_NETWORK';
  throw err;
}

/** 与 vendorError 同款判定：保留已有 code（如 ASR_EMPTY），否则区分厂商报错与网络。 */
function vendorErrorCode(e: unknown): string {
  const code = (e as { code?: string })?.code;
  if (code) return code;
  return e instanceof DashScopeError || e instanceof ZenMuxError
    ? 'VENDOR_BAD_RESPONSE'
    : 'VENDOR_NETWORK';
}

export async function transcribeAudioDirect(body: {
  audioBase64: string;
  format?: string;
  durationSec?: number;
}): Promise<string> {
  const startedAt = Date.now();
  const apiKey = await getDashScopeApiKey();
  if (!apiKey) {
    logLlmFailure({
      label: '百炼·听写',
      provider: 'dashscope',
      model: QWEN_ASR_MODEL,
      startedAt,
      errorCode: 'DASHSCOPE_KEY_MISSING',
      errorMessage: '未设置百炼密钥',
    });
    const err = new Error('请先在设置里填写朗读与听写密钥') as Error & { code?: string };
    err.code = 'DASHSCOPE_KEY_MISSING';
    throw err;
  }
  try {
    const dialect = await getStoredDialect();
    const text = await qwen3AsrTranscribe({
      apiKey,
      audioBase64: body.audioBase64,
      format: body.format ?? 'm4a',
      dialect,
      durationSec: body.durationSec,
    });
    if (!text) {
      const err = new Error('没有听清，请再说一次') as Error & { code?: string };
      err.code = 'ASR_EMPTY';
      throw err;
    }
    logLlmSuccess({
      label: '百炼·听写',
      provider: 'dashscope',
      model: QWEN_ASR_MODEL,
      startedAt,
      contentLen: text.length,
    });
    return text;
  } catch (e) {
    logLlmFailure({
      label: '百炼·听写',
      provider: 'dashscope',
      model: QWEN_ASR_MODEL,
      status: e instanceof DashScopeError ? e.status : undefined,
      startedAt,
      errorCode: vendorErrorCode(e),
      errorMessage: (e as Error)?.message,
    });
    vendorError(e, 'DASHSCOPE_KEY_MISSING', '云端听写暂时连不上，请检查网络');
  }
}

export async function synthesizeSpeechDirect(body: {
  text: string;
  voice?: string;
  dialect?: 'mandarin' | 'cantonese';
}): Promise<{ audioUrl: string; audioBase64: string }> {
  const startedAt = Date.now();
  const apiKey = await getDashScopeApiKey();
  if (!apiKey) {
    logLlmFailure({
      label: '百炼·朗读',
      provider: 'dashscope',
      model: QWEN_TTS_MODEL,
      startedAt,
      errorCode: 'DASHSCOPE_KEY_MISSING',
      errorMessage: '未设置百炼密钥',
    });
    const err = new Error('请先在设置里填写朗读与听写密钥') as Error & { code?: string };
    err.code = 'DASHSCOPE_KEY_MISSING';
    throw err;
  }
  try {
    const dialect = body.dialect ?? (await getStoredDialect());
    const result = await qwen3TtsSynthesize({
      apiKey,
      text: body.text,
      voice: body.voice,
      dialect,
    });
    logLlmSuccess({
      label: '百炼·朗读',
      provider: 'dashscope',
      model: QWEN_TTS_MODEL,
      startedAt,
      // 朗读返回的是音频，记 base64 字节数确认非空（而非输入文本长度）。
      contentLen: result.audioBase64.length,
    });
    return result;
  } catch (e) {
    logLlmFailure({
      label: '百炼·朗读',
      provider: 'dashscope',
      model: QWEN_TTS_MODEL,
      status: e instanceof DashScopeError ? e.status : undefined,
      startedAt,
      errorCode: vendorErrorCode(e),
      errorMessage: (e as Error)?.message,
    });
    vendorError(e, 'DASHSCOPE_KEY_MISSING', '云端朗读暂时连不上，请检查网络');
  }
}

export async function ocrImageDirect(body: {
  imageBase64: string;
  mimeType?: string;
  purpose?: string;
}): Promise<string> {
  const startedAt = Date.now();
  const apiKey = await getZenMuxApiKey();
  if (!apiKey) {
    logLlmFailure({
      label: 'ZenMux·识图',
      provider: 'zenmux',
      startedAt,
      errorCode: 'ZENMUX_KEY_MISSING',
      errorMessage: '未设置 ZenMux 密钥',
    });
    const err = new Error('请先在设置里填写 ZenMux 密钥（问问题回答、带图与云端识图）') as Error & {
      code?: string;
    };
    err.code = 'ZENMUX_KEY_MISSING';
    throw err;
  }
  try {
    const text = await zenmuxOcr({
      apiKey,
      imageBase64: body.imageBase64,
      mimeType: body.mimeType,
      purpose: body.purpose ?? OCR_RECOGNITION_PURPOSE,
    });
    logLlmSuccess({
      label: 'ZenMux·识图',
      provider: 'zenmux',
      startedAt,
      contentLen: text.length,
    });
    return text;
  } catch (e) {
    logLlmFailure({
      label: 'ZenMux·识图',
      provider: 'zenmux',
      status: e instanceof ZenMuxError ? e.status : undefined,
      startedAt,
      errorCode: vendorErrorCode(e),
      errorMessage: (e as Error)?.message,
    });
    vendorError(e, 'ZENMUX_KEY_MISSING', '云端识图暂时连不上，请检查网络');
  }
}

export async function getDashScopeStatusLocal() {
  const key = await getDashScopeApiKey();
  return {
    configured: Boolean(key),
    source: 'local',
    model: `${QWEN_TTS_MODEL} / ${QWEN_ASR_MODEL}`,
    displayName: 'Qwen3-TTS / Qwen3-ASR',
  };
}

export async function verifyDashScopeKeyLocal(apiKey?: string) {
  const key = apiKey?.trim() || (await getDashScopeApiKey());
  if (!key) return { valid: false, message: '请先填入密钥' };
  const startedAt = Date.now();
  try {
    await verifyDashScopeKeyRemote(key);
    logLlmSuccess({
      label: '百炼·密钥测试',
      provider: 'dashscope',
      model: QWEN_TTS_MODEL,
      startedAt,
    });
    return { valid: true, message: '密钥可用，朗读与听写已准备好' };
  } catch (e) {
    logLlmFailure({
      label: '百炼·密钥测试',
      provider: 'dashscope',
      model: QWEN_TTS_MODEL,
      status: e instanceof DashScopeError ? e.status : undefined,
      startedAt,
      errorCode: 'VERIFY_FAIL',
      errorMessage: (e as Error)?.message,
    });
    const msg = e instanceof DashScopeError ? e.message : '密钥不可用';
    return { valid: false, message: msg };
  }
}

export async function getZenMuxStatusLocal() {
  const key = await getZenMuxApiKey();
  return {
    configured: Boolean(key),
    source: 'local',
    model: ZENMUX_MODEL_CHAT,
    displayName: 'ZenMux · GPT-5.4（问问题）',
  };
}

export async function verifyZenMuxKeyLocal(apiKey?: string) {
  const key = apiKey?.trim() || (await getZenMuxApiKey());
  if (!key) return { valid: false, message: '请先填入密钥' };
  const startedAt = Date.now();
  try {
    await verifyZenMuxKeyRemote(key);
    logLlmSuccess({
      label: 'ZenMux·密钥测试',
      provider: 'zenmux',
      model: ZENMUX_MODEL_CHAT,
      startedAt,
    });
    return { valid: true, message: '密钥可用，问问题与识图已就绪' };
  } catch (e) {
    logLlmFailure({
      label: 'ZenMux·密钥测试',
      provider: 'zenmux',
      model: ZENMUX_MODEL_CHAT,
      status: e instanceof ZenMuxError ? e.status : undefined,
      startedAt,
      errorCode: 'VERIFY_FAIL',
      errorMessage: (e as Error)?.message,
    });
    const msg = e instanceof ZenMuxError ? e.message : '密钥不可用';
    return { valid: false, message: msg };
  }
}
