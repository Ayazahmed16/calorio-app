// Thin client for the Calorio JSON API. The token lives in localStorage; a 401 anywhere signs the user out.
export const API_URL = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
export const CLASSIC_URL = (import.meta.env.VITE_CLASSIC_URL || API_URL).replace(/\/$/, '');
const TOKEN_KEY = 'calorio_token';

export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
export const setToken = (t) => { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* storage blocked */ } };
export const clearToken = () => { try { localStorage.removeItem(TOKEN_KEY); } catch { /* storage blocked */ } };

export class ApiError extends Error {
  constructor(status, data) {
    super((data && (data.message || data.error)) || `Request failed (${status})`);
    this.status = status;
    this.data = data || {};
    this.fields = (data && data.fields) || {};
  }
}

export function qs(params = {}) {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') p.set(k, v); });
  const s = p.toString();
  return s ? `?${s}` : '';
}

async function request(method, path, body) {
  const token = getToken();
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Token ${token}`;
  let res;
  try {
    res = await fetch(`${API_URL}/api/v1${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError(0, { message: 'Cannot reach the server. Check your connection (the free server may be waking up, try again in a minute).' });
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) {
      clearToken();
      window.dispatchEvent(new Event('calorio:unauthorized'));
    }
    throw new ApiError(res.status, data);
  }
  return data;
}

/** Authenticated file download (CSV export): fetches with the token, then saves the blob. */
export async function download(path, filename) {
  const token = getToken();
  let res;
  try {
    res = await fetch(`${API_URL}/api/v1${path}`, { headers: token ? { Authorization: `Token ${token}` } : {} });
  } catch { throw new ApiError(0, { message: 'Cannot reach the server.' }); }
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => ({})));
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Multipart upload (CSV import). The browser sets the Content-Type boundary itself. */
export async function upload(path, formData) {
  const token = getToken();
  let res;
  try {
    res = await fetch(`${API_URL}/api/v1${path}`, { method: 'POST', headers: token ? { Authorization: `Token ${token}` } : {}, body: formData });
  } catch { throw new ApiError(0, { message: 'Cannot reach the server.' }); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body = {}) => request('POST', path, body),
  put: (path, body = {}) => request('PUT', path, body),
  del: (path) => request('DELETE', path),
};

/** First message of a field error, for `fields.name = ["..."]`. */
export const fieldError = (err, name) => (err && err.fields && err.fields[name] && err.fields[name][0]) || '';
