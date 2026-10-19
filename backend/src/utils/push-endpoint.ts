// Web Push destinations are provider controlled, never arbitrary server URLs.
export function assertPushEndpoint(value: unknown): asserts value is string {
    let url: URL;
    try { url = new URL(typeof value === 'string' ? value : ''); }
    catch { throw { status: 400, code: 'INSECURE_ENDPOINT', message: 'Push endpoint không hợp lệ' }; }
    const host = url.hostname;
    const trusted = host === 'fcm.googleapis.com' || host === 'updates.push.services.mozilla.com'
        || host === 'web.push.apple.com' || host.endsWith('.notify.windows.com');
    if (url.protocol !== 'https:' || !trusted || url.username || url.password || url.hash || (url.port && url.port !== '443') || String(value).length > 4096) {
        throw { status: 400, code: 'INSECURE_ENDPOINT', message: 'Push endpoint phải thuộc nhà cung cấp được hỗ trợ qua HTTPS' };
    }
}
