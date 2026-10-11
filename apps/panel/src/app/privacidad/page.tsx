import Link from 'next/link';

// Placeholder: el texto legal (Ley 1581 de 2012) lo redactan los dueños.
export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-8 text-sm leading-relaxed">
      <h1 className="text-xl font-semibold">Política de tratamiento de datos personales</h1>
      <p className="rounded-md border border-dashed border-warn bg-orange-50 p-4">
        Texto pendiente. Los responsables del servicio deben redactar aquí la política conforme a la Ley 1581 de 2012:
        responsable del tratamiento, finalidades, datos que se recogen (incluida la ubicación en vivo de los conductores),
        quién los ve, tiempo de conservación (el historial de ubicación se borra a los 30 días), derechos de los titulares y
        canal de atención.
      </p>
      <Link href="/" className="text-primary underline">
        Volver
      </Link>
    </div>
  );
}
