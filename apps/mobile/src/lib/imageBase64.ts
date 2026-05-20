import { readFileBase64 } from './fsLegacy';

export async function assetToBase64(asset: {
  uri: string;
  base64?: string | null;
}): Promise<string | null> {
  if (asset.base64?.trim()) return asset.base64.replace(/\s/g, '');
  try {
    return await readFileBase64(asset.uri);
  } catch {
    return null;
  }
}
