/* Public API client — read-only, no token handling (see /admin for write API) */
export async function api(path, opts = {}) {
  const res = await fetch(path, opts);
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
