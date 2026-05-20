/** 产品操作引导意图（写作小助手 / 问问题 共用） */
export const ASSISTANT_GUIDE_KEYS = [
    'settings_font',
    'settings_voice',
    'settings_dialect',
    'writing_new_doc',
    'writing_switch_doc',
    'writing_share',
    'writing_rename',
    'writing_history',
    'chat_switch_topic',
];
export function isAssistantGuideKey(value) {
    return (typeof value === 'string' &&
        ASSISTANT_GUIDE_KEYS.includes(value));
}
const GUIDE_RULES_MANDARIN = `
【第三类：mode = guide（产品操作引导，非问答也非改稿）】
当用户明显是在说要**使用 App 的某个功能/设置**，而不是在请教写作或要求改字时，判为 guide，并填 guide 字段（见下表）。必须根据整句语义判断，禁止只靠关键词表匹配。

| guide 值 | 用户可能的意思（含口语变体） |
|----------|------------------------------|
| settings_font | 改字体、字体改大点/小点、调字体、字体大点/小点、字大一点/小一点、字号、字体大小、看不清字 |
| settings_voice | 换声音、换个人声、朗读声音、人声不好听 |
| settings_dialect | 换普通话、换粤语、讲粤语、说普通话、换语言 |
| writing_new_doc | 写新文章、新建文章、开新篇、另起一篇 |
| writing_switch_doc | 改别的文章、换一篇文稿、打开另一篇 |
| writing_share | 保存图片、存相册、发小红书、发朋友圈、复制文字发微信 |
| writing_rename | 改题目、改文章名、改标题、改一下标题、换个名字、文章叫什么、文稿名称、改篇名 |
| writing_history | 回到以前版本、恢复旧版、历史版本、以前的稿子 |
| chat_switch_topic | 换话题、聊别的、新话题、换个问题聊（仅问问题场景） |

【易错 · 改题目 writing_rename】
- 「我想改一下标题」「改下题目」「改文章名」→ 一律 guide=writing_rename，即使用户**还没说**新题目叫什么。
- **禁止** mode=chat 追问「想改成什么新标题」；改名由 App 弹窗完成，你只负责识别意图。
- 默认「标题/题目」指**整篇文章**名称（写作页顶部「改题目」），**不是**某一章「第一章」后面的章节说明。只有用户明确说「章节名」「第几章的主题」「把第一章改成…」且要带具体章节时，才用 chat 简短说明：长按章节条可改章节说明（仍不是 revise 改正文）。

guide 时：只输出 JSON，**不要**在 JSON 前写长段正文教用户怎么操作；displayText 留空或不超过一句（如「好的」）。界面会弹窗带她去对应功能。

guide 输出示例（单行 JSON，displayText 务必留空）：
{"mode":"guide","guide":"settings_font","ready":true,"referenceScope":"document","displayText":""}
{"mode":"guide","guide":"writing_rename","ready":true,"referenceScope":"document","displayText":""}

【优先级】
- 改字号/字体大点/换声音/换语言/新建文章/分享/改题目/改标题/历史版本/换话题等 → **必须** mode=guide 并填 guide，**禁止**用 chat 回复「请去设置…」或追问新名称。
- 不要用 revise 改「标题文字」；改文章名不是改章节正文。
- 若她其实在问「怎么写更好」而不是要去设置页，才用 chat。`;
const GUIDE_RULES_CANTONESE = `
【第三类：mode = guide（产品操作引导，非问答也非改稿）】
当用户明显系要讲**用 App 某个功能/设置**，而唔系请教写作或要求改字时，判为 guide，并填 guide 字段。必须根据成句话语义判断，禁止只靠关键词表匹配。

| guide 值 | 用户可能的意思（粤语口语举例） |
|----------|--------------------------------|
| settings_font | 改字体、调字体、字体大啲/细啲、字大啲、细啲、大点、细点、字号、睇唔清字 |
| settings_voice | 换把声、换个声、人声、朗读声 |
| settings_dialect | 讲粤语、讲普通话、转粤语、转普通话、换语言 |
| writing_new_doc | 写新篇、开新文章、另起一篇 |
| writing_switch_doc | 改第二篇、换篇文章、开另一篇 |
| writing_share | 存相、保存图片、发小红书、发朋友圈、复制文字 |
| writing_rename | 改题目、改个名、改标题、改下标题、改文章名、改篇名 |
| writing_history | 返旧版、以前嘅版本、历史版本 |
| chat_switch_topic | 换话题、倾第二样、聊其他（问问题场景） |

【易错 · 改题目 writing_rename】
- 「我想改下标题」「改题目」→ 一律 guide=writing_rename，就算佢**未讲**新题目系咩。
- **唔好** mode=chat 追问「想改成咩标题」；改名由 App 弹窗搞掂。
- 默认「标题/题目」系**成篇文**个名（写作页顶部「改题目」），唔系「第一章」后面嗰截章节说明。只有佢讲明「章节名」「第一章改成…」先至用 chat 提长按章节条改说明。

guide 时：只输出 JSON，唔好喺 JSON 前写长文教佢点操作；displayText 留空或极短。界面会弹窗带佢去对应功能。

示例：
{"mode":"guide","guide":"settings_font","ready":true,"referenceScope":"document","displayText":""}
{"mode":"guide","guide":"writing_rename","ready":true,"referenceScope":"document","displayText":""}

【优先级】改字号/改标题/改题目/换声/换语言/新建文章等 → 必须 mode=guide 填 guide；唔好用 chat 追问新名；唔好用 revise。`;
export function assistantGuideRulesForDialect(dialect) {
    return dialect === 'cantonese' ? GUIDE_RULES_CANTONESE : GUIDE_RULES_MANDARIN;
}
//# sourceMappingURL=assistantGuideRegistry.js.map