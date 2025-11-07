type SoundKey = "pass";

const SOUND_SOURCES: Record<SoundKey, string> = {
  pass: "/sounds/pass-turn.mp3",
};

let audioContext: AudioContext | null = null;
const bufferCache = new Map<SoundKey, AudioBuffer>();

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioContext) {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return null;
    try {
      audioContext = new Ctor();
    } catch (error) {
      console.warn("AudioContext creation failed", error);
      audioContext = null;
    }
  }
  return audioContext;
}

async function loadBuffer(ctx: AudioContext, key: SoundKey): Promise<AudioBuffer | null> {
  if (bufferCache.has(key)) return bufferCache.get(key)!;
  const url = SOUND_SOURCES[key];
  if (!url) return null;
  try {
    const response = await fetch(url, { cache: "force-cache" });
    if (!response.ok) throw new Error(`Failed to fetch sound: ${response.status}`);
    const data = await response.arrayBuffer();
    const decoded = await ctx.decodeAudioData(data);
    bufferCache.set(key, decoded);
    return decoded;
  } catch (error) {
    console.warn(`Unable to load sound for key "${key}"`, error);
    return null;
  }
}

export async function playSound(key: SoundKey): Promise<void> {
  const ctx = getContext();
  if (!ctx) return;
  try {
    if (ctx.state === "suspended") {
      await ctx.resume().catch(() => undefined);
    }
    const buffer = await loadBuffer(ctx, key);
    if (!buffer) return;

    const now = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(1.3, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + buffer.duration + 0.1);

    source.connect(gain);
    gain.connect(ctx.destination);

    source.start(now);
    source.stop(now + buffer.duration + 0.1);

    source.onended = () => {
      try {
        source.disconnect();
        gain.disconnect();
      } catch (disconnectError) {
        console.warn("Error cleaning up audio nodes", disconnectError);
      }
    };
  } catch (error) {
    console.warn("playSound failed", error);
  }
}
