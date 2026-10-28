import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'http';
import { AddressInfo } from 'net';
import { app } from '../app.js';
import { query } from '../db/pool.js';
import {
  isValidImageId,
  getCachedImagePath,
  saveImageToCache,
  clearImageCache,
  getImageCacheStats
} from '../utils/image-cache.js';

describe('Public Image Local Disk Cache & Security', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeEach(async () => {
    clearImageCache();
    await new Promise<void>((resolve) => {
      server = http.createServer(app).listen(0, () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    clearImageCache();
    await new Promise<void>((resolve) => {
      if (server) {
        server.close(() => resolve());
      } else {
        resolve();
      }
    });
  });

  describe('Path traversal prevention & ID validation', () => {
    it('allows valid alphanumeric IDs, hyphens, and underscores', () => {
      expect(isValidImageId('img-1234_abc')).toBe(true);
      expect(isValidImageId('b43df35d-0d67-4bb4-a8aa-d5bb5538eec7')).toBe(true);
    });

    it('rejects path traversal and unsafe characters', () => {
      expect(isValidImageId('../etc/passwd')).toBe(false);
      expect(isValidImageId('../../secret.txt')).toBe(false);
      expect(isValidImageId('foo/bar')).toBe(false);
      expect(isValidImageId('foo\\bar')).toBe(false);
      expect(isValidImageId('image.png;rm -rf')).toBe(false);
      expect(isValidImageId('')).toBe(false);
    });

    it('rejects HTTP requests with path traversal attempt with 400 or 404', async () => {
      const res = await fetch(`${baseUrl}/api/v1/public/images/..%2F..%2Fetc%2Fpasswd`);
      expect([400, 404]).toContain(res.status);
    });
  });

  describe('Disk Cache lifecycle', () => {
    it('caches buffer to disk and retrieves it', async () => {
      const dummyId = 'test-cache-img-1';
      const dummyBuffer = Buffer.from('fake-image-bytes-123');
      const mimeType = 'image/png';

      expect(getCachedImagePath(dummyId)).toBeNull();

      const savedPath = await saveImageToCache(dummyId, mimeType, dummyBuffer);
      expect(savedPath).toBeTruthy();

      const cached = getCachedImagePath(dummyId);
      expect(cached).not.toBeNull();
      expect(cached?.mimeType).toBe(mimeType);
      expect(cached?.filePath).toBe(savedPath);

      const stats = getImageCacheStats();
      expect(stats.count).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Integration with /api/v1/public/images/:id', () => {
    const testImageId = '88888888-8888-8888-8888-888888888888';
    const fakePngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    beforeEach(async () => {
      await query(
        `INSERT INTO uploaded_images (id, tenant_id, filename, mime_type, size_bytes, data_base64)
         VALUES ($1, '11111111-1111-1111-1111-111111111111', 'test.png', 'image/png', 70, $2)
         ON CONFLICT (id) DO UPDATE SET data_base64 = $2`,
        [testImageId, `data:image/png;base64,${fakePngBase64}`]
      );
    });

    afterEach(async () => {
      await query(`DELETE FROM uploaded_images WHERE id = $1`, [testImageId]);
    });

    it('first request reads DB and caches to disk; second request serves from disk cache', async () => {
      clearImageCache();

      // Request 1: DB hit
      const res1 = await fetch(`${baseUrl}/api/v1/public/images/${testImageId}`);
      expect(res1.status).toBe(200);
      expect(res1.headers.get('content-type')).toBe('image/png');
      expect(res1.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
      const buf1 = await res1.arrayBuffer();
      expect(buf1.byteLength).toBeGreaterThan(0);

      // Allow background disk write to complete
      await new Promise((r) => setTimeout(r, 100));

      const cachedAfterReq1 = getCachedImagePath(testImageId);
      expect(cachedAfterReq1).not.toBeNull();

      // Request 2: Served straight from disk cache
      const res2 = await fetch(`${baseUrl}/api/v1/public/images/${testImageId}`);
      expect(res2.status).toBe(200);
      expect(res2.headers.get('content-type')).toBe('image/png');
      const buf2 = await res2.arrayBuffer();
      expect(buf2.byteLength).toBe(buf1.byteLength);
    });

    it('returns 404 for non-existent image', async () => {
      const res = await fetch(`${baseUrl}/api/v1/public/images/99999999-9999-9999-9999-999999999999`);
      expect(res.status).toBe(404);
    });
  });
});
