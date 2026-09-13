// Text-to-speech via the browser's built-in Web Speech Synthesis (client-side,
// free). Used to read Claude's answers aloud.

export function ttsSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function speak(text: string) {
  if (!ttsSupported() || !text.trim()) return;
  try {
    window.speechSynthesis.cancel(); // stop anything already playing
    const u = new SpeechSynthesisUtterance(text);
    u.lang = navigator.language || "en-US";
    u.rate = 1;
    u.pitch = 1;
    window.speechSynthesis.speak(u);
  } catch {
    /* ignore */
  }
}

export function stopSpeaking() {
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}

const TTS_KEY = "mylifesense.tts";

export function getAutoSpeak(): boolean {
  try {
    return window.localStorage.getItem(TTS_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAutoSpeak(on: boolean) {
  try {
    if (on) window.localStorage.setItem(TTS_KEY, "1");
    else window.localStorage.removeItem(TTS_KEY);
  } catch {
    /* ignore */
  }
}
