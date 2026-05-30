/**
 * 问问题联网回复后处理：去掉模型附带的参考文献、行内链接与裸 URL。
 */
export function stripChatReplyCitations(text) {
    let s = text.trim();
    if (!s)
        return s;
    s = stripInlineWebCitations(s);
    const trailingSection = /(?:\r?\n){2,}(?:#{1,3}\s*)?(?:参考来源|参考文献|参考资料|引用来源|资料来源|引用文献|资料链接|参考链接|Sources?|References?|Citations?|Bibliography)\s*[：:]\s*(?:\r?\n)[\s\S]*$/iu;
    s = s.replace(trailingSection, '');
    const trailingUrlList = /(?:\r?\n){2,}(?:(?:[-*•]\s*)?(?:\[[^\]]*\]\(https?:\/\/\S+\)|https?:\/\/\S+)\s*(?:\r?\n)?){2,}[\s\S]*$/iu;
    s = s.replace(trailingUrlList, '');
    s = s.replace(/\s*【\d+】/g, '');
    s = s.replace(/\[\d+\](?!\()/g, '');
    return cleanupOrphanPunctuation(s.trim());
}
/** 去掉正文里混入的 Markdown 链接、裸 URL、协议相对路径 */
function stripInlineWebCitations(s) {
    let out = s;
    // ([站点名](https://...)) 或 [站点名](https://...)
    out = out.replace(/\(\s*\[[^\]]*]\(\s*https?:\/\/[^)\s]+?\s*\)\s*\)/gi, '');
    out = out.replace(/\[[^\]]*]\(\s*https?:\/\/[^)\s]+?\s*\)/gi, '');
    // 裸 URL（含末尾多余的 ） ）
    out = out.replace(/https?:\/\/[^\s)\]】，。！？；、]*(?:\)+)?/gi, '');
    // 协议相对路径 //domain/path（常见于 GPT 联网引用残留）
    out = out.replace(/(?:^|[\s(（【「『])\/\/[^\s)\]】，。！？；、]*(?:\)+)?/gim, '');
    return out;
}
function cleanupOrphanPunctuation(s) {
    return s
        .replace(/\(\s*\)/g, '')
        .replace(/([，。！？；、：])\s*\)+/g, '$1')
        .replace(/\(\s*([，。！？；、：])/g, '$1')
        .replace(/\s{2,}/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}
//# sourceMappingURL=stripChatReplyCitations.js.map