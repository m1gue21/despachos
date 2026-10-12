import { DEMO, DEMO_API_URL } from './demo';

// En modo demo las llamadas a esta URL las atiende el API simulado (lib/mock).
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? (DEMO ? DEMO_API_URL : 'http://127.0.0.1:4000');

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

type Init = { method?: string; body?: unknown };

// Un cliente por tipo de sesión: el panel (personal) y la web del conductor
// guardan tokens distintos, así se puede probar ambos en el mismo navegador.
function createClient(tokenKey: string) {
  const getToken = (): string | null => {
    try {
      return localStorage.getItem(tokenKey);
    } catch {
      return null;
    }
  };
  const setToken = (token: string | null) => {
    try {
      if (token) localStorage.setItem(tokenKey, token);
      else localStorage.removeItem(tokenKey);
    } catch {
      // Almacenamiento bloqueado: la sesión dura lo que la pestaña.
    }
  };
  // Avisa cuando el token vence (401).
  const onUnauthorized = new EventTarget();

  async function request<T>(path: string, init: Init = {}): Promise<T> {
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

  return { request, getToken, setToken, onUnauthorized };
}

const staff = createClient('despacho.token');
export const api = staff.request;
export const getToken = staff.getToken;
export const setToken = staff.setToken;
export const onUnauthorized = staff.onUnauthorized;

export const driverClient = createClient('despacho.driver.token');
