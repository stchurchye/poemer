import assert from 'node:assert/strict';
import test from 'node:test';
import { assembleChatContext, contextUsageForDisplay, getChatWorkingWindowTokens, getWritingWorkingWindowTokens, COMPACT_SUMMARY_MAX_TOKENS, } from './contextBudget.js';
test('软工作窗口默认值合理（远小于物理窗口，让压缩真正生效）', () => {
    assert.equal(getChatWorkingWindowTokens(), 24_000);
    assert.equal(getWritingWorkingWindowTokens(), 48_000);
    // 摘要预算已从 10 万降到可真正起压缩作用的量级
    assert.ok(COMPACT_SUMMARY_MAX_TOKENS <= 5_000);
});
test('小窗口下，超出预算的早期历史被标记为待压缩', () => {
    const longTurn = (i) => '中'.repeat(2000) + `#${i}`;
    const history = Array.from({ length: 20 }, (_, i) => ({
        role: (i % 2 === 0 ? 'user' : 'assistant'),
        content: longTurn(i),
    }));
    const assembled = assembleChatContext({
        systemPrompt: '系统',
        summary: null,
        history,
        pendingUser: '你好',
        limitTokens: 4_000, // 故意设小，模拟达到阈值
    });
    assert.equal(assembled.needsCompact, true);
    assert.ok(assembled.messagesToCompact.length > 0);
    // 最新的待发送消息一定在最后
    assert.equal(assembled.messages[assembled.messages.length - 1]?.content, '你好');
});
test('短对话不触发压缩', () => {
    const assembled = assembleChatContext({
        systemPrompt: '系统提示',
        summary: null,
        history: [
            { role: 'user', content: '今天天气怎么样' },
            { role: 'assistant', content: '挺好的' },
        ],
        pendingUser: '那明天呢',
        limitTokens: getChatWorkingWindowTokens(),
    });
    assert.equal(assembled.needsCompact, false);
    assert.equal(assembled.messagesToCompact.length, 0);
});
function baseUsage(over = {}) {
    return {
        usedTokens: 0,
        limitTokens: 24_000,
        ratio: 0,
        breakdown: {
            system: 1_000,
            summary: 0,
            history: 2_000,
            document: 0,
            pendingUser: 500,
            outputReserve: 8_000,
        },
        compacted: false,
        droppedVerbatimTurns: 0,
        ...over,
    };
}
test('contextUsageForDisplay 圆环始终用估算、不被真实用量改写，但 actualPromptTokens 字段透传', () => {
    const display = contextUsageForDisplay(baseUsage({ actualPromptTokens: 6_000 }));
    // 估算 1000+2000+8000 = 11000（不含 pendingUser 500，也不用真实值算圆环）
    assert.equal(display.usedTokens, 11_000);
    assert.equal(display.breakdown.pendingUser, 0);
    // 字段保留，供详情弹窗「实际用量」行展示
    assert.equal(display.actualPromptTokens, 6_000);
});
test('contextUsageForDisplay 无真实用量时也是估算（不含待发送）', () => {
    const display = contextUsageForDisplay(baseUsage());
    // 1000 + 0 + 2000 + 0 + 8000 = 11000（不含 pendingUser 500）
    assert.equal(display.usedTokens, 11_000);
});
//# sourceMappingURL=contextBudget.test.js.map