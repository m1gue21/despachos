// Logo de Arriero: A-montaña con el sendero hasta el punto de entrega
// (docs/MARCA.md). `product` agrega el nombre del producto al lado.
export function Logo({
  product,
  tone = 'dark',
  className = '',
}: {
  product?: string;
  tone?: 'dark' | 'light';
  className?: string;
}) {
  const stroke = tone === 'dark' ? '#1F5C45' : '#F6F1E7';
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <svg viewBox="0 0 64 64" className="h-[1.5em] w-[1.5em] shrink-0" aria-hidden="true">
        <path d="M8 54 32 10l24 44" fill="none" stroke={stroke} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M18 51c8-1 5-8 12-10s7-8 3-12" fill="none" stroke="#E59A2F" strokeWidth="3.6" strokeLinecap="round" strokeDasharray="0.1 6.2" />
        <circle cx="33" cy="26" r="4.6" fill="#E59A2F" />
      </svg>
      <span
        aria-hidden="true"
        className={`font-display text-[1.2em] font-extrabold tracking-tight ${tone === 'dark' ? 'text-foreground' : 'text-background'}`}
      >
        arr
        <span className="relative">
          ı<span className="absolute left-1/2 top-[0.1em] h-[0.2em] w-[0.2em] -translate-x-1/2 rounded-full bg-accent" />
        </span>
        ero
      </span>
      <span className="sr-only">Arriero{product ? ` ${product}` : ''}</span>
      {product && (
        <span aria-hidden="true" className="ml-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[0.7em] font-semibold uppercase tracking-wide text-primary">
          {product}
        </span>
      )}
    </span>
  );
}
