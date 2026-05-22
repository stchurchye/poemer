#!/usr/bin/env node
/**
 * 发 OTA 前递增 app.json 的 version（设置页展示用）。
 * runtimeVersion 保持固定，避免已安装 APK 与线上更新不兼容。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const appJsonPath = join(root, 'app.json');

const raw = readFileSync(appJsonPath, 'utf8');
const config = JSON.parse(raw);
const current = config.expo?.version ?? '1.0.0';
const parts = current.split('.').map((n) => parseInt(n, 10) || 0);
while (parts.length < 3) parts.push(0);
parts[2] += 1;
const next = parts.join('.');

config.expo.version = next;
writeFileSync(appJsonPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
console.log(`app.json version: ${current} → ${next}`);
