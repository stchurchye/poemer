const ASR_PROMPT_MANDARIN = '请将这段语音转写成简体中文。只输出说话内容，不要解释、不要标点以外的说明。若听不清，只回复：（未听清）';
const ASR_PROMPT_CANTONESE = `请将这段粤语口语转写成文字。
要求：
- 使用粤语口语常用字（广府话），保留口语用词，例如「系」「唔」「嘅」「喺」「嘢」「佢」「冇」「啲」「呢」「嗰」等；
- 不要改成普通话书面语，不要把粤语词替换成国语说法；
- 只输出说话内容，不要解释、不要标点以外的说明；
- 若听不清，只回复：（未听清）`;
export function asrPromptForDialect(dialect) {
    return dialect === 'cantonese' ? ASR_PROMPT_CANTONESE : ASR_PROMPT_MANDARIN;
}
//# sourceMappingURL=asr.js.map