import { Linking, ScrollView, Text } from 'react-native';
import { API_URL } from '../config';
import { Button, Card, H, Muted, colors, s } from '../ui';

// Consentimiento explícito para la ubicación en vivo (Ley 1581 de 2012).
// El texto final lo deben revisar los responsables del servicio.
export function ConsentScreen({ onAccept, onDecline }: { onAccept: () => void; onDecline: () => void }) {
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.scroll}>
      <H style={{ fontSize: 22 }}>Tu ubicación, tus reglas</H>
      <Card>
        <Text style={s.label}>QUÉ RECOGEMOS</Text>
        <Text style={s.value}>
          Solo si activas "Ubicación en vivo": tu posición GPS cada pocos segundos, también con la pantalla bloqueada. Sin
          activarla, solo el sector que tú eliges.
        </Text>
        <Text style={s.label}>PARA QUÉ</Text>
        <Text style={s.value}>Para que el operador te asigne servicios cercanos y sepa cómo va un servicio en curso.</Text>
        <Text style={s.label}>QUIÉN LA VE</Text>
        <Text style={s.value}>Solo los operadores de tu ciudad. Otros conductores no ven tu ubicación.</Text>
        <Text style={s.label}>CUÁNTO SE GUARDA</Text>
        <Text style={s.value}>La posición actual se reemplaza cada vez. El historial se borra automáticamente a los 30 días.</Text>
        <Text style={s.label}>TU CONTROL</Text>
        <Text style={s.value}>Puedes apagar la ubicación en vivo cuando quieras, sin perder el servicio que estés haciendo.</Text>
      </Card>
      <Text style={{ color: colors.primary, textDecorationLine: 'underline' }} onPress={() => Linking.openURL(`${API_URL.replace(':4000', ':3000')}/privacidad`)}>
        Política de tratamiento de datos
      </Text>
      <Button title="Acepto compartir mi ubicación en vivo" onPress={onAccept} big />
      <Button title="Ahora no (solo por sector)" onPress={onDecline} outline />
      <Muted>Puedes cambiar esta decisión después desde la pantalla principal.</Muted>
    </ScrollView>
  );
}
