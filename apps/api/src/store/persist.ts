import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type {
  ChatMessage,
  ChatSession,
  Document,
  Revision,
  WritingAssistantMessage,
} from '@shiren/shared';

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');

export interface PersistedStore {
  documents: Document[];
  revisions: Revision[];
  chatSessions: ChatSession[];
  chatMessages: Record<string, ChatMessage[]>;
  writingAssistantMessages: Record<string, WritingAssistantMessage[]>;
}

export function loadPersistedStore(): PersistedStore | null {
  try {
    if (!fs.existsSync(DATA_FILE)) return null;
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw) as PersistedStore;
  } catch (e) {
    console.warn('[诗人-api] 读取本地数据失败，将使用空库', e);
    return null;
  }
}

export function savePersistedStore(data: PersistedStore): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.warn('[诗人-api] 保存本地数据失败', e);
  }
}
