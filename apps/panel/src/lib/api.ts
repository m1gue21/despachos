export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000';
const TOKEN_KEY = 'despacho.token';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Almacenamiento bloqueado: la sesión dura lo que la pestaña.
  }
}

// Avisa a la sesión cuando el token vence (401).
export const onUnauthorized = new EventTarget();

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
      headers: {
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'network', 'No hay conexión con el servidor');
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && path !== '/auth/login') onUnauthorized.dispatchEvent(new Event('401'));
    throw new ApiError(res.status, data?.error?.code ?? 'error', data?.error?.message ?? `Error ${res.status}`);
  }
  return data as T;
}
