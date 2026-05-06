export async function apiGetJson(path, { headers } = {}) {
  const res = await fetch(path, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      ...(headers || {})
    }
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // ignore
  }
  if (!res.ok) {
    const msg = json?.error || json?.message || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.body = json ?? text;
    throw err;
  }
  return json;
}

