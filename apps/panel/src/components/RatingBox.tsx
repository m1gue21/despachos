'use client';

import { RATING_TAGS } from '@despacho/shared';
import { useState } from 'react';
import { API_URL } from '@/lib/api';
import { Button, cn } from './ui';

const LABELS = ['', 'Muy mal', 'Mal', 'Regular', 'Bien', 'Excelente'];

// Calificación del cliente desde el enlace de seguimiento (sin login).
export function RatingBox({
  token,
  driverName,
  canRate,
  existing,
}: {
  token: string;
  driverName: string;
  canRate: boolean;
  existing: number | null;
}) {
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<number | null>(existing);

  if (sent) {
    return (
      <div className="mt-4 rounded-xl bg-green-50 p-4 text-center">
        <p className="text-2xl text-amber-400">{'★'.repeat(sent)}<span className="text-zinc-300">{'★'.repeat(5 - sent)}</span></p>
        <p className="mt-1 font-semibold">¡Gracias por calificar!</p>
      </div>
    );
  }
  if (!canRate) return null;

  // Con buena nota se sugieren etiquetas positivas; con mala, las negativas.
  const shown = stars === 0 ? [] : RATING_TAGS.filter((t) => (stars >= 4 ? t.positive : stars <= 2 ? !t.positive : true));

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/track/${encodeURIComponent(token)}/rating`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ stars, tags: tags.filter((t) => shown.some((s) => s.key === t)), comment: comment.trim() || null }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error?.message ?? 'No se pudo enviar');
      setSent(stars);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-border p-4">
      <p className="font-semibold">¿Cómo te fue con {driverName}?</p>
      <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)} role="radiogroup" aria-label="Calificación">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={stars === n}
            aria-label={`${n} estrella${n > 1 ? 's' : ''}`}
            onMouseEnter={() => setHover(n)}
            onClick={() => setStars(n)}
            className={cn('text-4xl leading-none transition-transform active:scale-90', (hover || stars) >= n ? 'text-amber-400' : 'text-zinc-300')}
          >
            ★
          </button>
        ))}
        <span className="ml-2 text-sm text-muted-foreground">{LABELS[hover || stars]}</span>
      </div>
      {shown.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {shown.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTags((x) => (x.includes(t.key) ? x.filter((k) => k !== t.key) : [...x, t.key]))}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm',
                tags.includes(t.key) ? (t.positive ? 'border-ok bg-green-50' : 'border-danger bg-red-50') : 'border-border',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
      {stars > 0 && (
        <textarea
          className="w-full rounded-lg border border-border p-2 text-sm"
          rows={2}
          maxLength={500}
          placeholder="Comentario (opcional)"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button className="h-11 w-full" disabled={stars === 0 || busy} onClick={submit}>
        {busy ? 'Enviando…' : 'Enviar calificación'}
      </Button>
    </div>
  );
}
