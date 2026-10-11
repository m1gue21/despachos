import { DEMO_DRIVERS, DEMO_PASSWORD } from '@despacho/shared';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { Button, H, Muted, colors, s } from '../ui';

// Acceso rápido con las cuentas del seed: solo en desarrollo, o si se fuerza
// con EXPO_PUBLIC_DEMO_LOGINS=1 en un build de demostración.
const SHOW_DEMO = __DEV__ || process.env.EXPO_PUBLIC_DEMO_LOGINS === '1';

export function LoginScreen({ onLogin }: { onLogin: (email: string, password: string) => Promise<void> }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onLogin(email.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo entrar');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[s.screen, { justifyContent: 'center', padding: 24 }]}>
      <View style={{ gap: 14 }}>
        <H style={{ fontSize: 26 }}>Despacho</H>
        <Muted>Entra con el correo y la contraseña que te dio el operador.</Muted>
        <TextInput
          style={s.input}
          placeholder="Correo"
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput style={s.input} placeholder="Contraseña" secureTextEntry value={password} onChangeText={setPassword} onSubmitEditing={submit} />
        {error && <Text style={{ color: colors.danger }}>{error}</Text>}
        <Button title="Entrar" onPress={submit} busy={busy} disabled={!email || !password} big />
        {SHOW_DEMO && (
          <View style={{ gap: 8, marginTop: 8, padding: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: 10 }}>
            <Muted>Cuentas de prueba (solo desarrollo)</Muted>
            {DEMO_DRIVERS.map((a) => (
              <Pressable
                key={a.email}
                accessibilityRole="button"
                onPress={() => {
                  setEmail(a.email);
                  setPassword(DEMO_PASSWORD);
                  setError(null);
                }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  minHeight: 48,
                  paddingHorizontal: 14,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: email === a.email ? colors.primary : colors.border,
                  backgroundColor: email === a.email ? '#dbeafe' : pressed ? colors.bg : '#fff',
                })}
              >
                <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>{a.label}</Text>
                <Muted>{a.hint}</Muted>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
