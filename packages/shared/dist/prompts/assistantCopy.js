/** 写作小助手首条欢迎语 */
export function assistantWelcomeLine(dialect) {
    return dialect === 'cantonese'
        ? '您好，我係写作小助手。您喺下面讲讲想点改，我先帮您确认意思，啱咗再改落篇文章度。'
        : '您好，我是写作小助手。您可以在下面说说想怎么改，我先帮您确认意思，对了再改到文章里。';
}
export function assistantRejectConfirmLine(dialect) {
    return dialect === 'cantonese'
        ? '好嘅，您再讲具体啲，我重新听您讲。'
        : '好的，您再说具体一点，我重新听您讲。';
}
export function assistantWorkingLine(dialect) {
    return dialect === 'cantonese'
        ? '好嘅，我而家按您讲嘅去改，请稍等。'
        : '好的，我这就按照您说的去改，请稍候。';
}
export function assistantRevisionReadyLine(dialect) {
    return dialect === 'cantonese'
        ? '改稿建议准备好喇，请您撳下面睇一睇。'
        : '改稿建议已经准备好了，请您点下面看一看。';
}
export function writingDoneComment(action, dialect) {
    if (dialect === 'cantonese') {
        return action === '续写'
            ? '帮您续写咗一段，您睇下啱唔啱心水。'
            : '帮您润色咗一下，意思冇变，读起来顺啲。';
    }
    return action === '续写'
        ? '帮您续写了一段，您看看喜不喜欢。'
        : '帮您润色了一下，意思没变，读起来更顺了。';
}
export function writingRetryDoneComment(dialect) {
    return dialect === 'cantonese'
        ? '已按您新意见又改咗一版，请您再睇睇。'
        : '已按您的新意见又改了一版，请您再看看。';
}
//# sourceMappingURL=assistantCopy.js.map