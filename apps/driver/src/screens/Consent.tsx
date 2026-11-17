import { Linking, ScrollView, Text } from 'react-native';
import { API_URL } from '../config';
import { Button, Card, H, Muted, colors, s } from '../ui';

// Consentimiento explícito (Ley 1581 de 2012), versión 2026-11-v3.
// `required` = el despacho exige ubicación en turno: no hay "ahora no"; quien no
// acepta simplemente no inicia turnos. El texto final lo deben revisar los responsables.
export function ConsentScreen({
  required,
  onAccept,
  onDecline,
}: {
  required: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.scroll}>
      <H style={{ fontSize: 22 }}>Tu ubicación, tus reglas</H>
      <Card>
        <Text style={s.label}>QUÉ RECOGEMOS</Text>
        <Text style={s.value}>
          Solo durante tu turno: tu posición GPS cada pocos segundos, también con la pantalla bloqueada, y el estado de tu celular
          (si el GPS está encendido, si la app tiene permiso, el nivel de batería y si la ubicación es simulada). Fuera de turno, nada.
        </Text>
        <Text style={s.label}>PARA QUÉ</Text>
        <Text style={s.value}>
          Para asignarte servicios cercanos, saber cómo va un servicio en curso y avisar al despacho si pierdes la señal para que te
          ayuden o te llamen.
        </Text>
        <Text style={s.label}>QUIÉN LA VE</Text>
        <Text style={s.value}>
          Los operadores y administradores de tu ciudad, también su recorrido de cada día. Mientras le haces un servicio a un cliente,
          ese cliente ve tu posición por un enlace temporal. Otros conductores no.
        </Text>
        <Text style={s.label}>CUÁNTO SE GUARDA</Text>
        <Text style={s.value}>El recorrido y las alertas se guardan 30 días y luego se borran.</Text>
        <Text style={s.label}>TU CONTROL</Text>
        <Text style={s.value}>
          Tú decides cuándo empieza y termina tu turno. Al terminarlo, la app deja de compartir ubicación de inmediato.
          {required ? ' Tu despacho exige ubicación mientras estés en turno; si no la quieres compartir, no inicies turno.' : ''}
        </Text>
      </Card>
      <Text style={{ color: colors.primary, textDecorationLine: 'underline' }} onPress={() => Linking.openURL(`${API_URL.replace(':4000', ':3000')}/privacidad`)}>
        Política de tratamiento de datos
      </Text>
      <Button title="Acepto" onPress={onAccept} big />
      <Button title={required ? 'No acepto (no podré iniciar turnos)' : 'Ahora no'} onPress={onDecline} outline />
      {!required && <Muted>Puedes cambiar esta decisión después.</Muted>}
    </ScrollView>
  );
}
