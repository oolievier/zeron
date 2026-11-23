let context = null;
let enabled = true;

export function setSound(value) {
  enabled = Boolean(value);
}

function ctx() {
  if (!enabled) return null;
  context ||= new (window.AudioContext || window.webkitAudioContext)();
  if (context.state === 'suspended') context.resume();
  return context;
}

function tone(frequency, duration = 0.08, type = 'square', gain = 0.035, delay = 0) {
  const audio = ctx();
  if (!audio) return;
  const oscillator = audio.createOscillator();
  const volume = audio.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, audio.currentTime + delay);
  volume.gain.setValueAtTime(gain, audio.currentTime + delay);
  volume.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + delay + duration);
  oscillator.connect(volume).connect(audio.destination);
  oscillator.start(audio.currentTime + delay);
  oscillator.stop(audio.currentTime + delay + duration + 0.02);
}

export const sfx = {
  click: () => tone(520, 0.05, 'square', 0.025),
  submit: () => {
    tone(440, 0.07, 'square', 0.03);
    tone(660, 0.09, 'square', 0.03, 0.07);
  },
  reveal: (points) => {
    const base = points >= 75 ? 660 : points >= 35 ? 520 : 300;
    tone(base, 0.1, 'triangle', 0.05);
    tone(base * 1.5, 0.14, 'triangle', 0.04, 0.09);
  },
  tick: () => tone(880, 0.035, 'sine', 0.02),
  win: () => [523, 659, 784, 1046].forEach((note, i) => tone(note, 0.16, 'triangle', 0.045, i * 0.1)),
  error: () => tone(160, 0.18, 'sawtooth', 0.035),
};
