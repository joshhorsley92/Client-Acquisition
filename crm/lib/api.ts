// Tiny typed fetch wrapper for client components. The Supabase browser
// client handles auth cookies automatically — these helpers just centralize
// JSON encoding/decoding + error handling.

async function request<T = any>(
  path: string,
  options: RequestInit & { body?: any } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  let body: BodyInit | undefined;
  if (options.body !== undefined && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  } else if (options.body instanceof FormData) {
    body = options.body;
  }

  const res = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers,
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Request failed: ${res.status}`);
  }
  return data as T;
}

export const api = {
  // Generic helpers
  get: <T = any>(path: string) => request<T>(path),
  post: <T = any>(path: string, body?: any) => request<T>(path, { method: 'POST', body }),
  patch: <T = any>(path: string, body?: any) => request<T>(path, { method: 'PATCH', body }),
  del: <T = any>(path: string) => request<T>(path, { method: 'DELETE' }),

  // Multipart helper for file uploads (CSV import etc.)
  postForm: <T = any>(path: string, formData: FormData) =>
    request<T>(path, { method: 'POST', body: formData }),
};
