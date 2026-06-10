#!/usr/bin/env node
/**
 * 问问题 / 写作小助手 / 语音 链路诊断（与 App 内 verify* 及 localApi 逻辑一致）
 *
 * 用法：
 *   DEEPSEEK_API_KEY=sk-... ZENMUX_API_KEY=... node scripts/diagnose-llm-paths.mjs
 *
 * 仅测 DeepSeek：DEEPSEEK_API_KEY=sk-... node scripts/diagnose-llm-paths.mjs
 */

import {
  DEEPSEEK_BASE_URL,
  DEEPSEEK_MODEL_PRO,
  ZENMUX_BASE_URL,
  ZENMUX_MODEL_CHAT,
  ZENMUX_MODEL_FLASH_LITE,
  verifyZenMuxKey,
} from '../packages/shared/dist/index.js';
import {
  analyzeChatIntentLocal,
  analyzeWritingIntentLocal,
  completeChatMessages,
} from '../packages/engine/dist/index.js';

const deepseekKey = process.env.DEEPSEEK_API_KEY?.trim() ?? '';
const zenmuxKey = process.env.ZENMUX_API_KEY?.trim() ?? '';

function section(title) {
  console.log('\n' + '='.repeat(60));
  console.log(title);
  console.log('='.repeat(60));
}

function ok(label, detail) {
  console.log(`✓ ${label}${detail ? `: ${detail}` : ''}`);
}

function fail(label, detail) {
  console.log(`✗ ${label}${detail ? `: ${detail}` : ''}`);
}

async function deepSeekProbe(apiKey, body) {
  const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  const msg = json?.choices?.[0]?.message ?? {};
  const text = msg.content;
  return {
    httpOk: res.ok,
    status: res.status,
    hasContent: typeof text === 'string' && text.length > 0,
    text: typeof text === 'string' ? text.slice(0, 80) : undefined,
    errorMessage: json?.error?.message,
    rawKeys: Object.keys(msg),
    reasoningContent:
      typeof msg.reasoning_content === 'string'
        ? msg.reasoning_content.slice(0, 80)
        : undefined,
    finishReason: json?.choices?.[0]?.finish_reason,
  };
}

/** 与 App verifyDeepSeekKeyDirect 完全一致 */
async function verifyDeepSeekKeyDirect(apiKey) {
  return deepSeekProbe(apiKey, {
    model: DEEPSEEK_MODEL_PRO,
    messages: [{ role: 'user', content: '回复：好' }],
    max_tokens: 8,
  });
}

function createDeepSeekModelClient(apiKey) {
  return {
    async complete(input) {
      const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: DEEPSEEK_MODEL_PRO,
          messages: input.messages,
          temperature: input.temperature ?? 0.3,
          max_tokens: input.maxTokens,
        }),
      });
      const json = await res.json();
      const text = json?.choices?.[0]?.message?.content;
      if (!res.ok || typeof text !== 'string') {
        const err = new Error(json?.error?.message ?? 'AI 模型暂时没响应');
        err.code = 'MODEL_BAD_RESPONSE';
        err.status = res.status;
        err.rawMessageKeys = Object.keys(json?.choices?.[0]?.message ?? {});
        throw err;
      }
      return { text };
    },
  };
}

function createZenMuxModelClient(apiKey, options = {}) {
  const model = options.model ?? ZENMUX_MODEL_FLASH_LITE;
  return {
    async complete(input) {
      const body = {
        model,
        messages: input.messages,
        stream: false,
        max_tokens: input.maxTokens ?? 4096,
        temperature: input.temperature ?? 0.2,
      };
      if (options.webSearch) {
        body.web_search_options = {
          search_context_size: 'medium',
          user_location: {
            type: 'approximate',
            city: 'Zhongshan',
            region: 'Guangdong',
            country: 'CN',
            timezone: 'Asia/Shanghai',
          },
        };
      }
      const res = await fetch(`${ZENMUX_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        const err = new Error(json?.error?.message ?? `ZenMux ${res.status}`);
        err.code = 'MODEL_BAD_RESPONSE';
        err.status = res.status;
        throw err;
      }
      const text = json?.choices?.[0]?.message?.content?.trim();
      if (!text) {
        const err = new Error('ZenMux 没有返回内容');
        err.code = 'MODEL_BAD_RESPONSE';
        throw err;
      }
      return { text };
    },
  };
}

async function ping(name, url) {
  try {
    const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(8000) });
    return { reachable: true, status: res.status };
  } catch (e) {
    return { reachable: false, error: String(e.message ?? e) };
  }
}

async function main() {
  console.log('诗人 App · LLM 链路诊断');
  console.log(`DeepSeek 密钥: ${deepseekKey ? '已提供 (' + deepseekKey.slice(0, 8) + '...)' : '未设置'}`);
  console.log(`ZenMux 密钥:   ${zenmuxKey ? '已提供 (' + zenmuxKey.slice(0, 8) + '...)' : '未设置'}`);

  section('0. 网络可达性');
  for (const [name, url] of [
    ['DeepSeek API', `${DEEPSEEK_BASE_URL}/chat/completions`],
    ['ZenMux API', `${ZENMUX_BASE_URL}/chat/completions`],
  ]) {
    const r = await ping(name, url);
    if (r.reachable) ok(name, `HTTP ${r.status}`);
    else fail(name, r.error);
  }

  section('1. DeepSeek 密钥验证（设置页「测试一下」同等）');
  if (!deepseekKey) {
    fail('DeepSeek', '未设置 DEEPSEEK_API_KEY，请在 App「我的→API密钥」测试或 export 后重跑本脚本');
  } else {
    try {
      const r = await verifyDeepSeekKeyDirect(deepseekKey);
      if (r.httpOk && r.hasContent) {
        ok('DeepSeek verify (App 同款 max_tokens=8)', `status=${r.status} reply="${r.text}"`);
      } else if (r.httpOk && !r.hasContent) {
        fail(
          'DeepSeek verify (App 同款)',
          `HTTP 200 但 content 为空 finish=${r.finishReason ?? '?'}`,
        );
        if (r.rawKeys.length) console.log('  message 字段:', r.rawKeys.join(', '));
        if (r.reasoningContent) {
          console.log(
            '  reasoning_content 片段:',
            r.reasoningContent,
            '→ V4 默认 thinking 可能吃光 token，非欠费',
          );
        }
        const disabled = await deepSeekProbe(deepseekKey, {
          model: DEEPSEEK_MODEL_PRO,
          messages: [{ role: 'user', content: '回复：好' }],
          max_tokens: 32,
          // 裸 HTTP 直发要用顶层字段；extra_body 是 OpenAI SDK 的封装，DeepSeek 不识别会被忽略。
          // 与 App localModelClient 现在的关闭方式保持一致。
          thinking: { type: 'disabled' },
        });
        if (disabled.hasContent) {
          ok('DeepSeek 对照 (thinking=disabled, max_tokens=32)', disabled.text);
          console.log('  → 建议后续修复：意图/verify 请求关闭 thinking 或增大 max_tokens');
        } else if (disabled.errorMessage) {
          fail('DeepSeek 对照 (thinking=disabled)', disabled.errorMessage);
        }
      } else {
        fail('DeepSeek verify', `status=${r.status} error=${r.errorMessage ?? '无 content'}`);
      }
    } catch (e) {
      fail('DeepSeek verify', e.message);
    }
  }

  section('2. ZenMux 密钥验证（设置页「测试一下」同等）');
  if (!zenmuxKey) {
    fail('ZenMux', '未设置 ZENMUX_API_KEY');
  } else {
    try {
      await verifyZenMuxKey(zenmuxKey);
      ok('ZenMux verify (flash-lite)');
    } catch (e) {
      fail('ZenMux verify', e.message);
    }
    try {
      const chatClient = createZenMuxModelClient(zenmuxKey, { model: ZENMUX_MODEL_CHAT, webSearch: true });
      const { text } = await chatClient.complete({
        messages: [
          { role: 'system', content: '你是小助手，简短回答。' },
          { role: 'user', content: '用一句话说你好' },
        ],
        maxTokens: 64,
        temperature: 0.2,
      });
      ok('ZenMux chat (gpt-5.4 问问题回答)', text.slice(0, 100));
    } catch (e) {
      fail('ZenMux chat (gpt-5.4)', `${e.message}${e.status ? ` (${e.status})` : ''}`);
    }
  }

  section('3. 问问题 · 文字链路（DeepSeek 意图 → ZenMux 回答）');
  if (!deepseekKey || !zenmuxKey) {
    fail('问问题链路', '需要同时配置 DEEPSEEK_API_KEY 与 ZENMUX_API_KEY');
  } else {
    const userText = '今天天气怎么样';
    try {
      const intent = await analyzeChatIntentLocal(createDeepSeekModelClient(deepseekKey), {
        content: userText,
        source: 'text',
        history: [],
      });
      ok('问问题·意图理解 (DeepSeek)', `ready=${intent.ready} display="${(intent.displayText ?? '').slice(0, 60)}"`);
      if (intent.guide) {
        console.log('  → 触发产品引导:', intent.guide, '（可点「我系要问问题」跳过意图直接问 ZenMux）');
      }
    } catch (e) {
      fail('问问题·意图理解 (DeepSeek)', `${e.message}${e.code ? ` [${e.code}]` : ''}`);
      if (e.rawMessageKeys) console.log('  message 字段:', e.rawMessageKeys.join(', '));
    }

    try {
      const reply = await completeChatMessages(
        createZenMuxModelClient(zenmuxKey, { model: ZENMUX_MODEL_CHAT, webSearch: true }),
        [
          { role: 'system', content: '你是小助手。' },
          { role: 'user', content: userText },
        ],
        { maxTokens: 256, temperature: 0.2 },
      );
      ok('问问题·正文回答 (ZenMux GPT-5.4)', reply.slice(0, 120));
    } catch (e) {
      fail('问问题·正文回答 (ZenMux)', `${e.message}${e.status ? ` (${e.status})` : ''}`);
    }
  }

  section('4. 问问题 · 语音链路（仅 LLM 段；听写需真机/百炼）');
  if (!deepseekKey || !zenmuxKey) {
    fail('语音 LLM 段', '需要密钥；听写本身不在此脚本范围');
  } else {
    const voiceText = '帮我查一下明天会不会下雨';
    try {
      const intent = await analyzeChatIntentLocal(createDeepSeekModelClient(deepseekKey), {
        content: voiceText,
        source: 'voice',
        history: [],
      });
      ok('语音·意图理解 (DeepSeek)', `ready=${intent.ready} transcript path ok`);
    } catch (e) {
      fail('语音·意图理解 (DeepSeek)', e.message);
    }
    console.log('  听写 (STT): 需在真机按住说话或配置百炼 DashScope 云端 ASR，本脚本不覆盖');
  }

  section('5. 写作小助手 · 闲聊 + 改稿意图');
  if (!deepseekKey) {
    fail('写作小助手', '未设置 DEEPSEEK_API_KEY');
  } else {
    const ds = createDeepSeekModelClient(deepseekKey);
    try {
      const chatIntent = await analyzeWritingIntentLocal(ds, {
        content: '这段怎么写开头比较好',
        chapterTitle: '第一章',
        chapterContent: '春天来了，花儿开了。',
        history: [],
      });
      ok('写作·闲聊意图 (DeepSeek)', `mode=${chatIntent.mode} ready=${chatIntent.ready}`);
    } catch (e) {
      fail('写作·闲聊意图 (DeepSeek)', e.message);
    }

    try {
      const reviseIntent = await analyzeWritingIntentLocal(ds, {
        content: '帮我把这一段润色一下',
        chapterTitle: '第一章',
        chapterContent: '春天来了，花儿开了。',
        history: [],
      });
      ok('写作·改稿意图 (DeepSeek)', `mode=${reviseIntent.mode} action=${reviseIntent.action} ready=${reviseIntent.ready}`);
    } catch (e) {
      fail('写作·改稿意图 (DeepSeek)', e.message);
    }

    if (zenmuxKey) {
      try {
        const reply = await completeChatMessages(createZenMuxModelClient(zenmuxKey), [
          { role: 'system', content: '你是写作小助手。' },
          { role: 'user', content: '这段怎么写开头：春天来了，花儿开了。' },
        ]);
        ok('写作·侧栏闲聊回答 (ZenMux flash-lite)', reply.slice(0, 100));
      } catch (e) {
        fail('写作·侧栏闲聊回答 (ZenMux)', e.message);
      }
    }
  }

  section('6. 欠费/配额信号对照');
  console.log('若上方出现以下关键词，优先查平台余额：');
  console.log('  402 / insufficient balance / quota / 余额 / billing / credit');
  console.log('  401 / invalid api key / unauthorized');
  console.log('  200 但 content 空、有 reasoning_content → 响应格式问题（非欠费）');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
