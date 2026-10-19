export class ApiError extends Error {
  status: number;
  code: string;
  constructor(message: string, code: string = 'API_ERROR', status: number = 500) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

export async function request<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const apiBase = (import.meta as any).env?.VITE_API_URL || '';
  const isGet = !options.method || options.method.toUpperCase() === 'GET';
  let fullUrl = endpoint.startsWith('http') ? endpoint : `${apiBase}/api/v1${endpoint}`;
  if (isGet) {
    const separator = fullUrl.includes('?') ? '&' : '?';
    fullUrl = `${fullUrl}${separator}_t=${Date.now()}`;
  }

  const headers = new Headers(options.headers || {});
  headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  headers.set('Pragma', 'no-cache');
  headers.set('Expires', '0');

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  // Attach staff token if present in localStorage
  const staffToken = localStorage.getItem('staff_token');
  if (staffToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${staffToken}`);
  }

  // Attach guest token if present in localStorage
  const guestToken = localStorage.getItem('guest_token');
  if (guestToken && !headers.has('x-guest-token')) {
    headers.set('x-guest-token', guestToken);
  }

  const activeTenantId = localStorage.getItem('staff_tenant_id');
  if (activeTenantId && !headers.has('x-tenant-id')) {
    headers.set('x-tenant-id', activeTenantId);
  }

  const response = await fetch(fullUrl, {
    ...options,
    headers,
    cache: 'no-store',
    credentials: 'include'
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(data.message || 'Lỗi xử lý yêu cầu', data.error || 'SERVER_ERROR', response.status);
  }

  return data as T;
}
