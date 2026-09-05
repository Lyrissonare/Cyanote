/* Admin API client — token-based write access */
const TOKEN_KEY = 'cyanote-token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}
export function setToken(v) {
  if (v) localStorage.setItem(TOKEN_KEY, v);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function api(path, { method = 'GET', json, form } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let body;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  } else if (form !== undefined) {
    body = form;
  }
  const res = await fetch(path, { method, headers, body });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* no body */
  }
  if (!res.ok) throw new Error(data?.error || `请求失败 (${res.status})`);
  return data;
}

export const get = (p) => api(p);
export const post = (p, json) => api(p, { method: 'POST', json });
export const put = (p, json) => api(p, { method: 'PUT', json });
export const del = (p) => api(p, { method: 'DELETE' });

export async function uploadImage(file) {
  const form = new FormData();
  form.append('file', file, file.name || 'paste.png');
  return api('/api/uploads', { method: 'POST', form });
}
