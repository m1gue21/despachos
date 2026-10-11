'use client';

import {
  type ParseResponse,
  type RequestRow,
  SERVICE_LABEL,
  SERVICE_TYPES,
  type ServiceType,
  type WhatsappGroup,
  type Zone,
} from '@despacho/shared';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { Button, Dialog, ErrorText, Field, Input, Select, Textarea } from './ui';

const LOW = 0.6;

interface Form {
  service: ServiceType | '';
  source_group_id: string;
  pickup_text: string;
  pickup_sector_id: string;
  dropoff_text: string;
  dropoff_sector_id: string;
  customer_name: string;
  customer_phone: string;
  notes: string;
}

const EMPTY: Form = {
  service: '',
  source_group_id: '',
  pickup_text: '',
  pickup_sector_id: '',
  dropoff_text: '',
  dropoff_sector_id: '',
  customer_name: '',
  customer_phone: '',
  notes: '',
};

export function NewRequestDialog({
  open,
  onClose,
  cityId,
  sectors,
  groups,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  cityId: string;
  sectors: Zone[];
  groups: WhatsappGroup[];
  onCreated: (r: RequestRow) => void;
}) {
  const toast = useToast();
  const [raw, setRaw] = useState('');
  const [form, setForm] = useState<Form>(EMPTY);
  const [low, setLow] = useState<Set<string>>(new Set());
  const [engine, setEngine] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rawRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setRaw('');
      setForm(EMPTY);
      setLow(new Set());
      setEngine(null);
      setError(null);
      setTimeout(() => rawRef.current?.focus(), 0);
    }
  }, [open]);

  const set = (k: keyof Form) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setLow((l) => {
      const n = new Set(l);
      n.delete(k);
      return n;
    });
  };

  const analyze = async (text = raw) => {
    if (text.trim().length < 3) return;
    setParsing(true);
    setError(null);
    try {
      const p = await api<ParseResponse>('/parse', { body: { raw_text: text, city_zone_id: cityId } });
      setForm((f) => ({
        ...f,
        service: p.service === 'unknown' ? f.service : p.service,
        pickup_text: p.pickup_text ?? '',
        pickup_sector_id: p.pickup_sector_id ?? '',
        dropoff_text: p.dropoff_text ?? '',
        dropoff_sector_id: p.dropoff_sector_id ?? '',
        customer_name: p.customer_name ?? '',
        customer_phone: p.customer_phone ?? '',
        notes: p.notes ?? '',
      }));
      const l = new Set<string>();
      if (p.service === 'unknown' || p.confidence.service < LOW) l.add('service');
      if (!p.pickup_text || p.confidence.pickup < LOW) l.add('pickup_text').add('pickup_sector_id');
      if (p.dropoff_text && p.confidence.dropoff < LOW) l.add('dropoff_text').add('dropoff_sector_id');
      setLow(l);
      setEngine(p.engine);
    } catch (e) {
      setError(`${e instanceof Error ? e.message : 'No se pudo analizar'}. Llena los campos a mano.`);
    } finally {
      setParsing(false);
    }
  };

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!form.service) {
      setError('Elige el tipo de servicio');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const nul = (v: string) => (v.trim() ? v.trim() : null);
      const r = await api<RequestRow>('/requests', {
        body: {
          city_zone_id: cityId,
          service: form.service,
          source_group_id: nul(form.source_group_id),
          raw_text: nul(raw),
          pickup_text: form.pickup_text,
          pickup_sector_id: nul(form.pickup_sector_id),
          dropoff_text: nul(form.dropoff_text),
          dropoff_sector_id: nul(form.dropoff_sector_id),
          customer_name: nul(form.customer_name),
          customer_phone: nul(form.customer_phone),
          notes: nul(form.notes),
        },
      });
      toast('Solicitud creada');
      onCreated(r);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const hl = (k: string) => low.has(k);

  return (
    <Dialog open={open} onClose={onClose} title="Nueva solicitud" wide>
      <form
        onSubmit={submit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit();
        }}
        className="grid gap-4 md:grid-cols-2"
      >
        <div className="space-y-2">
          <Field label="Pegar mensaje de WhatsApp" hint={engine && <span>analizado con {engine === 'llm' ? 'IA' : 'reglas'}</span>}>
            <Textarea
              ref={rawRef}
              rows={9}
              value={raw}
              placeholder="Pega aquí el mensaje del grupo…"
              onChange={(e) => setRaw(e.target.value)}
              onPaste={(e) => {
                const text = e.clipboardData.getData('text');
                if (text && !raw.trim()) setTimeout(() => void analyze(text), 0);
              }}
            />
          </Field>
          <Button type="button" variant="secondary" onClick={() => analyze()} disabled={parsing || raw.trim().length < 3}>
            {parsing ? 'Analizando…' : 'Analizar'}
          </Button>
          {low.size > 0 && <p className="text-xs text-warn">Revisa los campos resaltados: el análisis no está seguro.</p>}
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Servicio">
              <Select value={form.service} onChange={set('service')} highlight={hl('service')} required>
                <option value="">Elegir…</option>
                {SERVICE_TYPES.map((s) => (
                  <option key={s} value={s}>
                    {SERVICE_LABEL[s]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Grupo de origen">
              <Select value={form.source_group_id} onChange={set('source_group_id')}>
                <option value="">—</option>
                {groups
                  .filter((g) => g.active)
                  .map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-[1fr_9rem] gap-2">
            <Field label="Recogida">
              <Input value={form.pickup_text} onChange={set('pickup_text')} highlight={hl('pickup_text')} required />
            </Field>
            <Field label="Sector">
              <Select value={form.pickup_sector_id} onChange={set('pickup_sector_id')} highlight={hl('pickup_sector_id')}>
                <option value="">—</option>
                {sectors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-[1fr_9rem] gap-2">
            <Field label="Destino">
              <Input value={form.dropoff_text} onChange={set('dropoff_text')} highlight={hl('dropoff_text')} />
            </Field>
            <Field label="Sector">
              <Select value={form.dropoff_sector_id} onChange={set('dropoff_sector_id')} highlight={hl('dropoff_sector_id')}>
                <option value="">—</option>
                {sectors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Cliente">
              <Input value={form.customer_name} onChange={set('customer_name')} />
            </Field>
            <Field label="Teléfono">
              <Input value={form.customer_phone} onChange={set('customer_phone')} inputMode="tel" placeholder="3001234567" />
            </Field>
          </div>
          <Field label="Notas">
            <Input value={form.notes} onChange={set('notes')} />
          </Field>
          <ErrorText>{error}</ErrorText>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button disabled={saving}>{saving ? 'Guardando…' : 'Guardar (⌘↵)'}</Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
