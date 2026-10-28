import fs from 'fs';
import path from 'path';
import os from 'os';

// Local cache directory in OS temporary space
const CACHE_DIR = path.join(os.tmpdir(), 'qr_order_image_cache');

// Ensure cache directory exists synchronously on boot
try {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
} catch (err) {
  console.warn('[ImageCache] Failed to initialize cache directory:', err);
}

// In-memory lookup index: id -> mimeType (enables 0ms lookup without disk stat if already indexed)
const memoryIndex = new Map<string, string>();

// Safe ID validator to prevent path traversal
const SAFE_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

export function isValidImageId(id: string): boolean {
  return typeof id === 'string' && SAFE_ID_REGEX.test(id);
}

/**
 * Returns cached image file path and mimeType if exists on disk, otherwise null.
 */
export function getCachedImagePath(id: string): { filePath: string; mimeType: string } | null {
  if (!isValidImageId(id)) return null;

  const filePath = path.join(CACHE_DIR, `${id}.bin`);
  const metaPath = path.join(CACHE_DIR, `${id}.meta`);

  // 1. Check in-memory index
  if (memoryIndex.has(id)) {
    const mimeType = memoryIndex.get(id)!;
    if (fs.existsSync(filePath)) {
      return { filePath, mimeType };
    }
    // File was deleted from disk, remove from memory
    memoryIndex.delete(id);
  }

  // 2. Check disk in case server was restarted
  try {
    if (fs.existsSync(filePath) && fs.existsSync(metaPath)) {
      const mimeType = fs.readFileSync(metaPath, 'utf8').trim();
      if (mimeType) {
        memoryIndex.set(id, mimeType);
        return { filePath, mimeType };
      }
    }
  } catch {
    // Disk read failed, fallback to DB
  }

  return null;
}

/**
 * Saves image buffer and mimeType atomically to local disk cache.
 */
export async function saveImageToCache(id: string, mimeType: string, buffer: Buffer): Promise<string> {
  if (!isValidImageId(id)) {
    throw new Error('Invalid image id for caching');
  }

  const filePath = path.join(CACHE_DIR, `${id}.bin`);
  const metaPath = path.join(CACHE_DIR, `${id}.meta`);
  const tmpFile = path.join(CACHE_DIR, `${id}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}.tmp`);

  try {
    await fs.promises.writeFile(tmpFile, buffer);
    await fs.promises.rename(tmpFile, filePath);
    await fs.promises.writeFile(metaPath, mimeType, 'utf8');
    memoryIndex.set(id, mimeType);
  } catch (err) {
    console.warn(`[ImageCache] Error caching image ${id}:`, err);
    try {
      if (fs.existsSync(tmpFile)) await fs.promises.unlink(tmpFile);
    } catch {}
  }

  return filePath;
}

/**
 * Clears the cache completely (useful for tests).
 */
export function clearImageCache(): void {
  memoryIndex.clear();
  try {
    if (fs.existsSync(CACHE_DIR)) {
      const files = fs.readdirSync(CACHE_DIR);
      for (const file of files) {
        try {
          fs.unlinkSync(path.join(CACHE_DIR, file));
        } catch {}
      }
    }
  } catch (err) {
    console.warn('[ImageCache] Error clearing cache directory:', err);
  }
}

/**
 * Returns cache statistics.
 */
export function getImageCacheStats(): { count: number; cacheDir: string } {
  return {
    count: memoryIndex.size,
    cacheDir: CACHE_DIR
  };
}
