export const errorMessages = {
    NET_OFFLINE: {
        message: '现在连不上网，不是您的问题。打开无线网或流量后我们再试',
        hint: '文稿已保存在手机里，不会丢',
        retryable: true,
    },
    NET_TIMEOUT: {
        message: '等得有点久了，网络可能不太稳',
        hint: '您写的内容都还在，不会丢',
        retryable: true,
    },
    AI_BUSY: {
        message: '小助手这会儿有点忙，请喝口水，一分钟后再试',
        hint: '请稍等一会儿再试',
        retryable: true,
    },
    AI_REFUSED: {
        message: '这段话小助手不太好下笔，我们换种说法试试，不着急',
        hint: '您可以改一改说法再试',
        retryable: true,
    },
    ASR_EMPTY: {
        message: '不好意思没听清，请您再靠近手机说一次',
        hint: '不着急，慢慢说就好',
        retryable: true,
    },
    OCR_FAIL: {
        message: '字迹不太好认，请拍清楚一点或光线亮一些',
        hint: '也可以换个角度再拍一张',
        retryable: true,
    },
    FEISHU_AUTH: {
        message: '还没连上飞书，请让家人帮您设置一下',
        hint: '在「设置」里可以设置',
        retryable: false,
    },
    SERVER_ERROR: {
        message: '出了点小问题，请稍后再试',
        hint: '文稿还在，不会丢',
        retryable: true,
    },
    NOT_FOUND: {
        message: '呢篇文開唔到',
        hint: '若果之前喺寫作頁收埋咗，去「設定」最底「已隱藏嘅文章」可以搵返；唔係收埋，就可能刪咗或者服務重開過',
        retryable: false,
    },
    ASSISTANT_INTENT_NOT_FOUND: {
        message: '搵唔到要確認嗰句說話',
        hint: '可能你已經撳過確認，或者小助手記錄同伺服器對唔上。請關閉小助手再開一次，重新講你想點改',
        retryable: true,
    },
    BLOCK_NOT_FOUND: {
        message: '呢章正文對唔上伺服器',
        hint: '請返回寫作頁等一等再試；若仍唔得，關掉 App 再開，或者確認手機連緊同一台電腦嘅 API',
        retryable: true,
    },
    REVISION_NOT_FOUND: {
        message: '这份改稿建议找不到了',
        hint: '可能服务刚重启过，请回到写作页让小助手再改一版',
        retryable: false,
    },
    REVISION_EXPIRED: {
        message: '这份建议已经处理过了',
        hint: '若要再改，请在小助手里重新说一次',
        retryable: false,
    },
    VALIDATION: {
        message: '请再检查一下输入',
        hint: '有不清楚的地方可以问小助手',
        retryable: true,
    },
    API_KEY_MISSING: {
        message: '还没设置小助手的密钥',
        hint: '请到「设置」里填入 DeepSeek 密钥，或让家人帮您设置',
        retryable: false,
    },
    ZENMUX_KEY_MISSING: {
        message: '还没设置识图的 ZenMux 密钥',
        hint: '请到「设置」里填入 ZenMux 密钥（用于照片识字）',
        retryable: false,
    },
    DASHSCOPE_KEY_MISSING: {
        message: '还没设置百炼密钥',
        hint: '请到「设置」里填入阿里云百炼 API Key（朗读与按住说话听写）',
        retryable: false,
    },
};
//# sourceMappingURL=messages.js.map