let audio: AudioContext | undefined;
// Short synthesized sounds so a snap is audible as well as visible. Silently does nothing if audio is unavailable.
export function playSnapSound(kind: 'engage' | 'lock') {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
    const now = audio.currentTime, osc = audio.createOscillator(), gain = audio.createGain();
    const [from, to, length, level] = kind === 'engage' ? [1900, 1300, 0.04, 0.05] : [340, 120, 0.12, 0.09];
    osc.type = kind === 'engage' ? 'square' : 'triangle';
    osc.frequency.setValueAtTime(from, now); osc.frequency.exponentialRampToValueAtTime(to, now + length);
    gain.gain.setValueAtTime(level, now); gain.gain.exponentialRampToValueAtTime(0.0001, now + length);
    osc.connect(gain).connect(audio.destination); osc.start(now); osc.stop(now + length);
  } catch { /* audio blocked or unsupported */ }
}
