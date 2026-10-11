import { REQUEST_STATUS_LABEL, type RequestRow, SERVICE_LABEL } from '@despacho/shared';
import { ScrollView, Text } from 'react-native';
import { Button, Card, H, Muted, s } from '../ui';

const hhmm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '');

export function HistoryScreen({ services, onClose }: { services: RequestRow[]; onClose: () => void }) {
  const done = services.filter((r) => r.status === 'completed' || r.status === 'cancelled');
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.scroll}>
      <H style={{ fontSize: 22 }}>Servicios de hoy</H>
      <Muted>
        {done.filter((r) => r.status === 'completed').length} completados · {done.filter((r) => r.status === 'cancelled').length} cancelados
      </Muted>
      {done.length === 0 && <Muted>Todavía no has cerrado servicios hoy.</Muted>}
      {done.map((r) => (
        <Card key={r.id}>
          <Text style={s.label}>
            {SERVICE_LABEL[r.service].toUpperCase()} · {REQUEST_STATUS_LABEL[r.status].toUpperCase()} · {hhmm(r.completed_at ?? r.assigned_at)}
          </Text>
          <Text style={s.value}>
            {r.pickup_text}
            {r.dropoff_text ? ` → ${r.dropoff_text}` : ''}
          </Text>
        </Card>
      ))}
      <Button title="Volver" outline onPress={onClose} />
    </ScrollView>
  );
}
