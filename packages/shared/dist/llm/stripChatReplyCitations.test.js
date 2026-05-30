import assert from 'node:assert/strict';
import test from 'node:test';
import { stripChatReplyCitations } from './stripChatReplyCitations.js';
test('stripChatReplyCitations removes trailing 参考文献 block', () => {
    const raw = `中山今天多云，气温约 25 度。

参考文献：
- 中国天气网：https://weather.com.cn/zhongshan
- 气象局：https://example.com`;
    assert.equal(stripChatReplyCitations(raw), '中山今天多云，气温约 25 度。');
});
test('stripChatReplyCitations removes trailing References and footnotes', () => {
    const raw = `It is sunny today[1][2].

References:
1. https://a.com
2. https://b.com`;
    assert.ok(!stripChatReplyCitations(raw).includes('References'));
    assert.ok(!stripChatReplyCitations(raw).includes('[1]'));
});
test('stripChatReplyCitations leaves normal body unchanged', () => {
    const body = '建议你去官网核实一下最新通知。';
    assert.equal(stripChatReplyCitations(body), body);
});
test('stripChatReplyCitations removes inline markdown links and protocol-relative URLs', () => {
    const raw = `//en.weather.com.cn/weather/101280601.shtml))
另外幾個天氣來源都顯示，深圳今日最高溫大概喺**31至33度**之間，不同平台會有少少出入，呢個都正常。([weather.com](https://weather.com/en-TO/weather/tenday/l/Shenzhen?place=1))
姐姐如果您而家準備出門，記得帶水。`;
    const out = stripChatReplyCitations(raw);
    assert.ok(!out.includes('weather.com'));
    assert.ok(!out.includes('//en.weather'));
    assert.ok(!out.includes('(') || !out.includes('http'));
    assert.match(out, /31至33度/);
    assert.match(out, /姐姐如果您而家準備出門/);
});
//# sourceMappingURL=stripChatReplyCitations.test.js.map