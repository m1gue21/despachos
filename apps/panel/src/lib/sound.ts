// Pitido corto con WebAudio (no requiere archivos). El navegador solo deja
// sonar después de una interacción del usuario con la página.
let ctx: AudioContext | null = null;

export function beep(kind: 'new' | 'alert' = 'new') {
  try {
    ctx ??= new AudioContext();
    const tones = kind === 'new' ? [880, 1175] : [440, 330];
    tones.forEach((freq, i) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx!.destination);
      const t = ctx!.currentTime + i * 0.16;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      osc.start(t);
      osc.stop(t + 0.15);
    });
  } catch {
    // Sin audio disponible.
  }
}
