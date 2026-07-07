# 上下文 / compact 重设计方案

> 状态:**待仓主过目**(2026-07-08 生成) · 目标风格:**尽量保原文**
> 来源:对现状的多视角深读审计(engine/shared/mobile/docs)+ 三视角批判(写作/问答/工程)+ 三架构师方案合成。
> 关键 bug 均已核对源码,非猜测。实现按 [[bowwow-dev-process]]:TDD(先写失败测试)+ 逐片段 code-review + 只修真问题,每票可独立 review/合并。

## 0. 背景与目标

「诗人」是给妈妈(非技术长辈)用的中文写作 + 问问题 App,本地优先。上下文/compact 现按「300k 大缓冲、别溢出就行」来调,但真实用法是(a)天天聊的长会话 +(b)多章长文,两者都需要**有界、聚焦、可靠**的记忆。仓主定的风格是**尽量保原文**——因此本方案不是激进滑窗压缩,而是:

- 用**真实/准确的 token 计量** + **按模型真实窗口**(gemini flash-lite 可 ~1M,不自设 300k)尽量多留逐字原文;
- 压缩**尽量晚触发**,但真发生时必须**可靠、原子、无损关键信息**;
- 写作侧引入 **story-bible 设定卡**(人物/称呼/时间线/风格)作为「保住关键原文事实」的常驻安全网,而不是压掉老章节;
- **绝不静默丢失**:尾章、被排除消息、锚点找不到、两轮后仍溢出,一律兜底或明确告知。

## 1. 设计原则(铁律)

1. **绝不静默丢失是最高铁律**:尾章、被排除消息、锚点找不到、两轮后仍溢出,四类边界一律走摘要兜底或显式 UI 告知。
2. **保原文优先**:先按模型真实窗口扩窗,再谈压缩;逐字历史尽量多留,阈值改为接近真实上限才触发。
3. **压缩产物原子提交**:推进锚点 + 落库摘要,必须与「本轮用户原话 + 回复入库」同一事务边界——回复成功后才 commit,失败即整体回滚,原话客户端可重发。
4. **锚点前每条 context-eligible 消息都必须已进摘要**(不变式):被排除的消息要么纳入摘要、要么锚点不得跨越它。
5. **completion max_tokens 与摘要字数上限是两个独立量**:前者受模型真实输出上限约束(几千级),后者仅用于裁剪结果文本。
6. **每票小而独立**:先写复现 bug 的失败测试(多为纯函数级),再最小实现;tier0 只做最小根因修复不改语义,语义级根治留给 redesign。
7. **story-bible 是妈妈能看懂、能手动订正的长期记忆**,常驻安全网,永远置于摘要之上、不参与压缩。
8. **usage 圆环必须与真正发送给模型的那份 messages 同源**,否则压缩告知不可信。

## 2. Tier 0 — 止血票(11 张,全部无相互依赖,可并行)

> 每张只碰一个根因、带一个失败测试。全部已确认 bug 可追溯:A1→T0-A1 … C3→T0-C3。

| 票 | 修 | 目标 | 主要文件 | 估 |
|----|----|------|----------|----|
| **T0-A1** | A1 数据丢失 | 压缩产物改为**回复成功后原子提交**:弱网/超时回复失败时本轮原话不丢、锚点不推进、旧轮不被有损折叠 | `contextPipeline.ts:156`、`localApi.ts`、`apps/api/.../chat.ts` | M |
| **T0-A2** | A2 数据丢失 | 被 `contextSelection` 排除的消息与锚点解耦,**绝不静默蒸发**(锚点停在被排除消息前,保留逐字) | `contextPipeline.ts:117-156` | S |
| **T0-A3** | A3 数据丢失 | 写作长文超 16000 字的**尾章不整章丢弃**,降级为「标题占位」并收集被折叠文本供上层摘要 | `writingAssistantContext.ts:83-88` | M |
| **T0-B1** | B1 压缩不可靠 | 压缩 completion 用**真实输出上限**(新增 `getCompactCompletionMaxTokens()`≈4k~8k),与摘要字数上限解耦;去掉「不超过 16 万汉字」不现实提示 | `contextCompact.ts:33,51`、`prompts/contextCompact.ts` | S |
| **T0-B2** | B2 压缩不可靠 | 去掉 `omitCount===0` 立即 break,**预防式压缩生效**:接近阈值即压最老一小批,消除「突然失忆」 | `contextPipeline.ts:144`、`contextBudget.ts` | S |
| **T0-B3** | B3 压缩不可靠 | 锚点找不到时**不再回退发全部历史**,改保守回退(空/按 createdAt 截取)+ 打日志 | `contextPipeline.ts:71,88` | S |
| **T0-B4** | B4 计量 | 计量**按模型真实窗口**查表 + 中文系数调保守;删除 RN 下失效的 `process.env` 覆盖 | `contextBudget.ts:44,53` | M |
| **T0-C1** | C1 改稿 | 改稿 retry **走预算截断**:原文/上一版/历次意见纳入预算,用户本轮意见与初次要求不可截 | `writingExecute.ts:129` | M |
| **T0-C2** | C2 改稿 | 改稿截断**优先保留 instruction**:分段带优先级,指令 pinned 不可截 | `contextPipeline.ts:537-546`、`contextBudget.ts` | S |
| **T0-C3** | C3 展示≠实际 | 写作意图圆环用量**与实发上下文同源**:usage 来自真正发给模型的那份 messages | `localApi.ts:596,647`、`writingEngine.ts` | M |

**止血优先级**:先做 **T0-A1**(原话不可逆丢失,最伤妈妈)与 **T0-B1**(压缩直接被上游拒,「压缩不可靠」头号原因),这两张是核心。其余 9 张可随后并行。

## 3. Redesign — 重设计票(9 张,四条基本独立的分支)

> 承接并把 tier0 的「最小修复」升级为「结构上不再可能」。四条分支:计量线 / 事务线 / 锚点线 / 设定卡线,只在收口处汇合。

**计量线**
- **R-ModelProfile**（依赖 T0-B1/B4，M，high）:`ModelProfile{ id, contextWindowTokens, maxCompletionTokens }`,窗口/上限按模型精确取值;压缩(flash-lite)与答复(gpt-5.4)各用自己 profile。收敛 tier0 的常量与查表入口。
- **R-TokenCounter**（依赖 T0-B4,M,medium）:可注入 `TokenCounter` 抽象,默认系数近似(中文误差 <15%),接口留给后续接真 tokenizer。

**事务线**
- **R-PlanCommit**（依赖 T0-A1,L,high）:把「决定压什么」做成无副作用纯函数 `planChatContext() → { messages, pendingCommit }`,提交由调用方成功后执行;A1 类丢失结构上不可能。是下面两票的基座。
- **R-BoundedSummary**（依赖 T0-B1、R-PlanCommit,M,high）:真要压时**分段压**,每段明确 token 上限,任一段失败则整体不提交锚点;合并摘要**有界**且保人名/时间/称呼。
- **R-BgCompact**（依赖 T0-A1、T0-B2、R-PlanCommit,M,medium）:**后台空闲预压缩**,答复成功后异步压、压好才 commit,当前这句永不被压缩卡住;接近硬上限仍同步兜底;发生时非侵入告知。

**锚点线**
- **R-Anchor**（依赖 T0-A2、T0-B3,L,high）:锚点从 `messageId` 改为**稳健序号**(已折进摘要的条数),消灭「findIndex 找不到就全量重发」整类回退。涉及 store schema 迁移。

**设定卡线**
- **R-StoreAdapter**（无依赖,S,medium）:`ContextStoreAdapter` 加法式扩展 `storyBible` 读写,不动防抖/落盘。数据层前置。
- **R-StoryBibleModel**（依赖 R-StoreAdapter,M,medium）:`Document.storyBible` 一等公民字段,组装时常驻注入写作侧、置于摘要之上、**不参与压缩**;空值兼容现状。
- **R-StoryBibleUI**（依赖 R-StoryBibleModel,M,low）:妈妈能在写作页**看到并手动订正**设定卡(谁是谁/怎么称呼/时间线),长辈可读、非技术术语。

**收口**
- **R-NoSilentLoss**（依赖 T0-A3、R-BoundedSummary、R-StoryBibleModel,M,high）:尾章/被排除/两轮后溢出**一律兜底或明确告知**,计数(`droppedVerbatimTurns`/`truncatedNoticeCount`)准确传到 HeaderContextMeter。收敛 T0-A3 的占位为真正的分章摘要兜底。

## 4. Cleanup — 清理票(3 张)

- **C-Preview**（依赖 R-PlanCommit,S,medium):修预览块 `messageId` 对齐(fitted 从尾装 vs `historyMessageIds` 从头对齐 → 勾错排除);摘要识别从 `startsWith(SUMMARY_PREFIX)` 前缀改结构化标记。`contextPreview.ts:166,146,163`。
- **C-Dedup**（无依赖,S,medium):`pendingUser` 双扣只计一次(`contextBudget.ts:309-327`)；手动 `compactChatSession` 不重压已摘要内容(`contextPipeline.ts:250-258`)；`fitHistoryFromEnd` 不拆散 user/assistant 对。
- **C-DeadCode**（无依赖,S,low):删 `generateChatReply`/`generateWritingChatReplyLocal`/`generateRevisionSnapshotLocal` 死代码 + `contextSelectionWithServerMarks` 空壳(删前确认是否真 no-op)。

## 5. 排序与并行

1. **第一波(并行止血)**:11 张 tier0 彼此独立,可各自 TDD/review/合并。先 **T0-A1 + T0-B1**,再铺开其余 9 张。
2. **第二波(redesign,四线并行)**:计量线(ModelProfile/TokenCounter)、事务线(PlanCommit→BoundedSummary→BgCompact)、锚点线(Anchor)、设定卡线(StoreAdapter→Model→UI),在 R-NoSilentLoss / R-BgCompact 处汇合。
3. **第三波(cleanup)**:C-Preview 依赖 R-PlanCommit 排后;C-Dedup/C-DeadCode 无依赖但排最后以免干扰主链路 review。

## 6. 需仓主拍板的开放问题

1. **各模型真实数值**:gpt-5.4 与 gemini-flash-lite 的真实 `contextWindowTokens` / `maxCompletionTokens` 分别多少?flash-lite 是否确为 ~1M 窗口?(填 ModelProfile 表)
2. **是否引入真 tokenizer**:RN 无原生 tokenizer,选「系数近似」(零体积、误差稍大)还是「打包轻量 BPE」(体积成本)?默认先系数近似。
3. **story-bible 是否要独立 UI**?若要,设定卡如何生成——手动录入 vs LLM 自动抽取?
4. **被排除消息的锚点策略**(T0-A2):默认「锚点停在被排除消息前、保留逐字」(最保原文),是否同意?还是要「强制纳入摘要」?
5. **锚点序号化迁移**(R-Anchor):单 JSON store + API db 的 schema 迁移——一次性换算 vs 双读兼容?
6. **压缩 completion 上限具体值**(T0-B1 兜底常量):ModelProfile 到位前先用 4096 还是 8192?
7. **静默丢失兜底的 UI 告知文案**(R-NoSilentLoss):对长辈友好、不制造焦虑的措辞;尾章纲要走 LLM(成本)还是本地首句截取?
8. **`contextSelectionWithServerMarks` 是否真为 no-op**(C-DeadCode):删除前需确认,否则会改变排除行为。
