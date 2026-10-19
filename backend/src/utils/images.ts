export function decodeImage(data: unknown): { mimeType: string; sizeBytes: number } {
    const match = typeof data === 'string' && data.match(/^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
    if (!match) throw { status: 400, code: 'INVALID_IMAGE', message: 'Chỉ hỗ trợ ảnh PNG, JPEG, GIF hoặc WebP' };
    const bytes = Buffer.from(match[2], 'base64');
    if (bytes.toString('base64') !== match[2]) throw { status: 400, code: 'INVALID_IMAGE', message: 'Dữ liệu Base64 không hợp lệ' };
    if (bytes.length > 5 * 1024 * 1024) throw { status: 400, code: 'IMAGE_TOO_LARGE', message: 'Kích thước ảnh tối đa là 5MB' };
    const valid = (match[1] === 'image/png' && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')))
        || (match[1] === 'image/jpeg' && bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex')))
        || (match[1] === 'image/gif' && ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString()))
        || (match[1] === 'image/webp' && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP');
    if (!valid) throw { status: 400, code: 'INVALID_IMAGE', message: 'Nội dung không khớp định dạng ảnh' };
    return { mimeType: match[1], sizeBytes: bytes.length };
}
