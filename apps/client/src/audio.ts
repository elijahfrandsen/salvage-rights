let context: AudioContext | undefined;
export function tone(kind: "click" | "lock" | "reveal" | "end") {
  if (localStorage.getItem("salvage-sound") !== "on") return;
  context ??= new AudioContext();
  void context.resume();
  const t = context.currentTime;
  const oscillator = context.createOscillator(),
    gain = context.createGain();
  oscillator.type = kind === "lock" ? "triangle" : "sine";
  oscillator.frequency.setValueAtTime(
    { click: 180, lock: 90, reveal: 440, end: 660 }[kind],
    t,
  );
  oscillator.frequency.exponentialRampToValueAtTime(
    kind === "lock" ? 40 : 880,
    t + 0.18,
  );
  gain.gain.setValueAtTime(0.06, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(t + 0.25);
}
