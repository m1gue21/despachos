// Modo demo: sin backend, todo simulado en el navegador. En la rama
// demo-sin-backend está activo por defecto; NEXT_PUBLIC_DEMO_MODE=0 lo apaga.
export const DEMO = process.env.NEXT_PUBLIC_DEMO_MODE !== '0';
export const DEMO_API_URL = 'https://api.demo.local';
