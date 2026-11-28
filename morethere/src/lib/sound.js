// Small sounds for the moments that matter between people (no audio files: synthesised).
//   sent     — a soft "pop" when you send a friend request
//   joined   — a bright two-note chime when you become friends
//   incoming — a gentle ping when someone asks to add you
// Phones only allow sound after a touch: the audio is unlocked on the first tap.

let ctx = null;
const getCtx = () => {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) { try { ctx = new AC(); } catch { return null; } }
  return ctx;
};
if (typeof window !== 'undefined') {
  const unlock = () => {
    const c = getCtx();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
    // A silent blip: iPhone keeps the audio unlocked from now on.
    if (c) { const o = c.createOscillator(); const g = c.createGain(); g.gain.value = 0; o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + 0.01); }
    window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
}

// One soft bell-like note: sine with a quick attack and a natural decay.
function note(c, freq, at, dur, gain = 0.16) {
  const o = c.createOscillator(); const g = c.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(freq, at);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(c.destination);
  o.start(at); o.stop(at + dur + 0.02);
  // A quiet octave above for warmth.
  const o2 = c.createOscillator(); const g2 = c.createGain();
  o2.type = 'sine'; o2.frequency.setValueAtTime(freq * 2, at);
  g2.gain.setValueAtTime(0.0001, at); g2.gain.exponentialRampToValueAtTime(gain * 0.25, at + 0.012); g2.gain.exponentialRampToValueAtTime(0.0001, at + dur * 0.7);
  o2.connect(g2).connect(c.destination); o2.start(at); o2.stop(at + dur);
}

const muted = () => { try { return localStorage.getItem('mt-sound') === 'off'; } catch { return false; } };

export function play(kind) {
  if (muted()) return;
  const c = getCtx(); if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  const t = c.currentTime + 0.02;
  if (kind === 'sent') { note(c, 880, t, 0.22, 0.12); }                                   // A5, short
  else if (kind === 'joined') { note(c, 659.25, t, 0.5); note(c, 987.77, t + 0.12, 0.7); }  // E5 → B5
  else if (kind === 'incoming') { note(c, 783.99, t, 0.35, 0.1); note(c, 783.99, t + 0.16, 0.35, 0.08); } // G5 ×2
}
