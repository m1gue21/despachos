import { api } from './api';

// Aprobar una propuesta de Arriero: con app = ofrecer (el conductor acepta o
// rechaza); sin app = asignar directo (el operador le avisa por WhatsApp).
export async function approve(requestId: string, c: { driver_id: string; has_app: boolean }) {
  await api(`/requests/${requestId}/transition`, {
    body: { action: c.has_app ? 'offer' : 'assign', payload: { driver_id: c.driver_id } },
  });
}

export const approveLabel = (hasApp: boolean) => (hasApp ? 'Aprobar y ofrecer' : 'Aprobar y asignar');
