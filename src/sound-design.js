// Original Afterhours score: industrial synthwave / late-night broadcast.
// A shared event score drives both live Web Audio and offline audio previews.
export const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const event = (voice, midi, duration, level, offset = 0) => ({
  voice,
  midi,
  duration,
  level,
  offset,
});
export function musicProfile(phase) {
  if (phase === "complete") return { bpm: 116, mix: 0.95, drive: "victory" };
  if (["answering", "dailyAnswer", "finalAnswer"].includes(phase))
    return { bpm: 108, mix: 0.2, drive: "focus" };
  if (["arming", "buzzOpen"].includes(phase))
    return { bpm: 120, mix: 0.55, drive: "signal" };
  if (phase.startsWith("final") || phase === "dailyWager")
    return { bpm: 100, mix: 0.65, drive: "tension" };
  if (phase === "clueReading") return { bpm: 108, mix: 0.35, drive: "reading" };
  return { bpm: 108, mix: 0.9, drive: "night" };
}
export function scoreStep(step, phase = "lobby") {
  const p = musicProfile(phase),
    beat = 60 / p.bpm / 4,
    at = step % 16;
  // Em9 → Cmaj7 → Am9 → Bsus: an original four-bar harmonic circuit.
  const roots = [40, 36, 33, 35],
    root = roots[Math.floor(step / 16) % 4];
  const notes = [
    [0, 7, 14, 15],
    [0, 7, 11, 14],
    [0, 7, 10, 14],
    [0, 7, 12, 14],
  ][Math.floor(step / 16) % 4];
  const result = [];
  if (at === 0) result.push(event("pad", root + 24, beat * 15, 0.035));
  const sparse = ["focus", "reading"].includes(p.drive);
  if (at % (sparse ? 8 : 4) === 0)
    result.push(event("bass", root, beat * 2.8, sparse ? 0.06 : 0.105));
  if (!sparse && [0, 8, 10].includes(at))
    result.push(event("kick", 36, 0.26, 0.17));
  if (!sparse && [4, 12].includes(at))
    result.push(event("snare", 50, 0.15, 0.055));
  if (!sparse && at % 2 === 0)
    result.push(event("hat", 80, 0.035, at % 4 === 2 ? 0.028 : 0.016));
  if (at % (sparse ? 4 : 2) === 0) {
    const pattern = [0, 2, 1, 3, 2, 1, 3, 1];
    result.push(
      event(
        "pluck",
        root + 24 + notes[pattern[(at / 2) % 8]],
        beat * 0.8,
        sparse ? 0.016 : 0.034,
      ),
    );
  }
  if (p.drive === "signal" && at % 4 === 3)
    result.push(event("data", root + 48, 0.035, 0.025));
  return { seconds: beat, events: result };
}
export function cueScore(kind) {
  const seq = (voice, notes, gap, dur, level) =>
    notes.map((n, i) => event(voice, n, dur, level, i * gap));
  switch (kind) {
    case "count":
      return [event("data", 64, 0.065, 0.12), event("hat", 80, 0.018, 0.035)];
    case "open":
      return [
        event("impact", 40, 0.18, 0.15),
        ...seq("signal", [76, 83, 88], 0.045, 0.18, 0.1),
      ];
    case "buzz":
      return [
        event("lock", 52, 0.25, 0.18),
        event("data", 88, 0.05, 0.07, 0.03),
        event("impact", 40, 0.16, 0.1, 0.05),
      ];
    case "correct":
      return [
        event("impact", 40, 0.24, 0.11),
        ...seq("signal", [64, 67, 71, 76], 0.085, 0.34, 0.11),
        event("pad", 64, 0.8, 0.045, 0.2),
      ];
    case "wrong":
      return [
        ...seq("reject", [47, 46, 40], 0.105, 0.21, 0.12),
        event("snare", 42, 0.11, 0.045, 0.05),
      ];
    case "double":
      return [
        event("riser", 40, 0.8, 0.07),
        ...seq("pluck", [52, 59, 64, 67, 71, 76], 0.09, 0.22, 0.085),
        event("impact", 40, 0.32, 0.14, 0.65),
      ];
    case "final":
      return [
        event("impact", 40, 0.4, 0.16),
        ...seq(
          "signal",
          [52, 59, 64, 67, 71, 74, 76, 83, 88],
          0.135,
          0.5,
          0.095,
        ),
        event("pad", 64, 1.8, 0.08, 0.9),
        event("pad", 71, 1.6, 0.045, 1.05),
        event("snare", 50, 0.24, 0.05, 1.2),
      ];
    case "comms":
      return [
        event("data", 83, 0.035, 0.04),
        event("data", 76, 0.035, 0.035, 0.05),
      ];
    default:
      return [
        event("riser", 52, 0.18, 0.035),
        ...seq("pluck", [64, 71, 78], 0.065, 0.16, 0.075),
      ];
  }
}
const noiseBuffers = new WeakMap();
function noiseBuffer(ctx) {
  if (!noiseBuffers.has(ctx)) {
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate),
      data = buffer.getChannelData(0);
    let seed = 137;
    for (let i = 0; i < data.length; i++) {
      seed = (seed * 16807) % 2147483647;
      data[i] = seed / 1073741823.5 - 1;
    }
    noiseBuffers.set(ctx, buffer);
  }
  return noiseBuffers.get(ctx);
}
export function renderEvent(ctx, bus, e, start) {
  const t = Math.max(start, ctx.currentTime),
    end = t + e.duration,
    nodes = [];
  const gain = ctx.createGain(),
    filter = ctx.createBiquadFilter();
  nodes.push(gain, filter);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(
    e.level,
    t + Math.min(0.012, e.duration / 4),
  );
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(3200, t);
  filter.Q.value = 0.7;
  filter.connect(gain);
  if (["pluck", "pad"].includes(e.voice)) {
    const pan = ctx.createStereoPanner();
    pan.pan.value = e.midi % 2 ? 0.2 : -0.2;
    gain.connect(pan);
    pan.connect(bus);
    nodes.push(pan);
  } else gain.connect(bus);
  let source;
  if (["hat", "snare", "riser"].includes(e.voice)) {
    source = ctx.createBufferSource();
    source.buffer = noiseBuffer(ctx);
    filter.type = e.voice === "hat" ? "highpass" : "bandpass";
    filter.frequency.setValueAtTime(
      e.voice === "hat" ? 7200 : e.voice === "snare" ? 1900 : 450,
      t,
    );
    if (e.voice === "riser")
      filter.frequency.exponentialRampToValueAtTime(5400, end);
    filter.Q.value = e.voice === "riser" ? 2 : 0.8;
  } else {
    source = ctx.createOscillator();
    source.type = ["bass", "reject", "lock"].includes(e.voice)
      ? "sawtooth"
      : e.voice === "pad"
        ? "triangle"
        : "sine";
    const f = hz(e.midi);
    source.frequency.setValueAtTime(
      e.voice === "kick" || e.voice === "impact" ? 130 : f,
      t,
    );
    if (["kick", "impact"].includes(e.voice))
      source.frequency.exponentialRampToValueAtTime(38, t + 0.12);
    if (e.voice === "lock")
      source.frequency.exponentialRampToValueAtTime(f / 2, end);
    if (e.voice === "reject") {
      source.detune.setValueAtTime(-13, t);
      filter.frequency.setValueAtTime(1100, t);
    }
    if (e.voice === "bass") {
      filter.frequency.setValueAtTime(700, t);
      filter.frequency.exponentialRampToValueAtTime(160, end);
      filter.Q.value = 2.2;
    }
    if (e.voice === "pad") {
      source.detune.value = -6;
      filter.frequency.setValueAtTime(900, t);
    }
    if (e.voice === "pluck") {
      source.type = "square";
      filter.frequency.setValueAtTime(2400, t);
      filter.frequency.exponentialRampToValueAtTime(450, end);
    }
    if (e.voice === "signal") {
      source.type = "triangle";
      filter.frequency.setValueAtTime(4600, t);
    }
  }
  nodes.push(source);
  source.connect(filter);
  source.start(t);
  source.stop(end + 0.025);
  source.onended = () => nodes.forEach((n) => n.disconnect());
}
export function renderCue(ctx, bus, kind, start = ctx.currentTime) {
  const events = cueScore(kind);
  events.forEach((e) => renderEvent(ctx, bus, e, start + e.offset));
  return Math.max(...events.map((e) => e.offset + e.duration));
}
export function createMixer(ctx) {
  const master = ctx.createGain(),
    music = ctx.createGain(),
    fx = ctx.createGain();
  master.gain.value = 0;
  music.gain.value = 0;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -12;
  limiter.knee.value = 12;
  limiter.ratio.value = 8;
  limiter.attack.value = 0.004;
  limiter.release.value = 0.15;
  music.connect(master);
  fx.connect(master);
  master.connect(limiter);
  limiter.connect(ctx.destination);
  // A short dark echo is reserved for the score, leaving game cues precise.
  const delay = ctx.createDelay(0.5),
    feedback = ctx.createGain(),
    low = ctx.createBiquadFilter(),
    wet = ctx.createGain();
  delay.delayTime.value = 0.278;
  feedback.gain.value = 0.2;
  low.type = "lowpass";
  low.frequency.value = 1600;
  wet.gain.value = 0.1;
  music.connect(delay);
  delay.connect(low);
  low.connect(feedback);
  feedback.connect(delay);
  low.connect(wet);
  wet.connect(master);
  return { master, music, fx };
}
