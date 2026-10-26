import {
  createMixer,
  musicProfile,
  scoreStep,
  renderEvent,
  renderCue,
} from "./sound-design.js";
// Device-local procedural audio. All music and effects are original synthesized material.
let ctx,
  mixer,
  musicTimer,
  step = 0,
  nextBeat = 0,
  phase = "lobby",
  paused = false,
  duckUntil = 0;
const get = (key, fallback) => {
  try {
    return localStorage.getItem("afterhours:" + key) ?? fallback;
  } catch {
    return fallback;
  }
};
export const audioSettings = () => ({
  muted: get("mute", "true") !== "false",
  music: get("music", "true") !== "false",
  voices: get("voices", "true") !== "false",
  volume: Math.max(0, Math.min(1, Number(get("volume", "0.55")) || 0)),
});
export async function unlockAudio() {
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    mixer ||= createMixer(ctx);
    if (ctx.state === "suspended") await ctx.resume();
    syncAudio();
  } catch {}
}
export function syncAudio() {
  if (!ctx || !mixer) return;
  const s = audioSettings(),
    silent = s.muted || document.hidden;
  mixer.master.gain.setTargetAtTime(
    silent ? 0 : s.volume,
    ctx.currentTime,
    0.035,
  );
  mixer.music.gain.setTargetAtTime(
    s.music && !paused && !silent
      ? ctx.currentTime < duckUntil
        ? 0.055
        : musicProfile(phase).mix
      : 0,
    ctx.currentTime,
    0.08,
  );
  if (silent || !s.voices) window.speechSynthesis?.cancel();
  if (!musicTimer) {
    nextBeat = ctx.currentTime;
    musicTimer = setInterval(score, 80);
  }
}
function score() {
  if (!ctx || ctx.state !== "running") return;
  if (
    document.hidden ||
    audioSettings().muted ||
    !audioSettings().music ||
    paused
  ) {
    nextBeat = ctx.currentTime;
    return;
  }
  if (nextBeat < ctx.currentTime - 0.1) nextBeat = ctx.currentTime;
  while (nextBeat < ctx.currentTime + 0.16) {
    const plan = scoreStep(step++, phase);
    plan.events.forEach((e) =>
      renderEvent(ctx, mixer.music, e, nextBeat + e.offset),
    );
    nextBeat += plan.seconds;
  }
}
export function soundtrack(nextPhase, isPaused = false) {
  if (phase !== nextPhase) {
    phase = nextPhase;
    step = 0;
    if (ctx) nextBeat = ctx.currentTime + 0.03;
  }
  paused = isPaused;
  syncAudio();
}
export async function tone(kind) {
  if (audioSettings().muted || document.hidden) return;
  await unlockAudio();
  if (!ctx || ctx.state !== "running" || audioSettings().muted) return;
  const duration = renderCue(ctx, mixer.fx, kind);
  duckUntil = Math.max(duckUntil, ctx.currentTime + duration + 0.12);
  syncAudio();
  setTimeout(syncAudio, (duration + 0.15) * 1000);
}
export function speak(text) {
  if (
    audioSettings().muted ||
    !audioSettings().voices ||
    document.hidden ||
    !window.speechSynthesis ||
    !ctx ||
    ctx.state !== "running"
  )
    return;
  try {
    renderCue(ctx, mixer.fx, "comms");
    const u = new SpeechSynthesisUtterance(text),
      voices = window.speechSynthesis.getVoices();
    u.voice =
      voices.find((v) => v.lang.startsWith("en-IN") && v.localService) ||
      voices.find((v) => v.lang.startsWith("en") && v.localService) ||
      null;
    u.lang = u.voice?.lang || "en-IN";
    u.rate = 0.98;
    u.pitch = 0.72;
    u.volume = audioSettings().volume * 0.65;
    duckUntil = Math.max(
      duckUntil,
      ctx.currentTime + Math.min(5, text.length * 0.055),
    );
    syncAudio();
    u.onend = () =>
      setTimeout(syncAudio, Math.max(0, duckUntil - ctx.currentTime) * 1000);
    setTimeout(
      syncAudio,
      Math.max(0, duckUntil - ctx.currentTime + 0.1) * 1000,
    );
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {}
}
if (typeof document !== "undefined")
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) window.speechSynthesis?.cancel();
    syncAudio();
  });
