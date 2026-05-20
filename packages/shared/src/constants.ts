/** 诗人 API 默认端口（避开 3000/3001/3100 等常见开发端口） */
export const SHIREN_API_PORT = 3921;

/** 云端识图固定说明（用户不再填写，前后端统一） */
export const OCR_RECOGNITION_PURPOSE =
  '手写中文文章字迹较为潦草，不要试图修改里面的问题，不要自己增加内容。';

/** App 请求头：问答/改稿回复语言（mandarin | cantonese） */
export const REPLY_DIALECT_HEADER = 'X-Reply-Dialect';
