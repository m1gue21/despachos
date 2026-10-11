import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, TextInput, View } from 'react-native';
import { Button, H, Muted, colors, s } from '../ui';

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
      </View>
    </KeyboardAvoidingView>
  );
}
