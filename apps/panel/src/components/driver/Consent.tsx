'use client';

import Link from 'next/link';
import { Button } from '../ui';

// Consentimiento explícito para la ubicación en vivo (Ley 1581 de 2012).
// El texto final lo deben revisar los responsables del servicio.
export function Consent({ onAccept, onDecline }: { onAccept: () => void; onDecline: () => void }) {
  const items: [string, string][] = [
    ['Qué recogemos', 'Solo si activas "Ubicación en vivo": tu posición GPS cada pocos segundos mientras esta página esté abierta. Sin activarla, solo el sector que tú eliges.'],
    ['Para qué', 'Para que el operador te asigne servicios cercanos y sepa cómo va un servicio en curso.'],
    ['Quién la ve', 'Los operadores y administradores de tu ciudad, también tu recorrido de cada día. Mientras le haces un servicio a un cliente, ese cliente ve tu posición por un enlace temporal. Otros conductores no.'],
    ['Cuánto se guarda', 'El recorrido y las alertas se guardan 30 días y luego se borran.'],
    ['Tu control', 'Puedes apagar la ubicación en vivo cuando quieras, sin perder el servicio que estés haciendo. Si tu despacho exige ubicación en turno, necesitas la app del conductor.'],
  ];
  return (
    <div className="mx-auto max-w-md space-y-4 p-5">
      <h1 className="text-2xl font-bold">Tu ubicación, tus reglas</h1>
      <dl className="space-y-3 rounded-xl border border-border bg-card p-4">
        {items.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs font-semibold uppercase text-muted-foreground">{k}</dt>
            <dd className="text-[15px]">{v}</dd>
          </div>
        ))}
      </dl>
      <Link href="/privacidad" className="block text-sm text-primary underline">
        Política de tratamiento de datos
      </Link>
      <Button className="h-14 w-full text-base" onClick={onAccept}>
        Acepto compartir mi ubicación en vivo
      </Button>
      <Button variant="outline" className="h-12 w-full text-base" onClick={onDecline}>
        Ahora no (solo por sector)
      </Button>
      <p className="text-xs text-muted-foreground">Puedes cambiar esta decisión después desde la pantalla principal.</p>
    </div>
  );
}
