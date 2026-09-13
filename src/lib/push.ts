import { supabase } from "./supabase";

// Public VAPID key — safe to embed. The matching private key is a secret held
// only by the sender Worker.
export const VAPID_PUBLIC_KEY =
  "BDJ5mMtTJCEOFLPQ-wiiP79WdWIoVlWpJo73VbzQQBXyYFMx49oFuJkKtSNC30LvL2r1H9p3xpLj-sHAGpPQ4BE";

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function saveSubscription(sub: PushSubscription): Promise<boolean> {
  if (!supabase) return true;
  const json = sub.toJSON() as { endpoint?: string };
  if (!json.endpoint) return false;
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert({ endpoint: json.endpoint, subscription: json });
  return !error;
}

export async function isPushEnabled(): Promise<boolean> {
  if (!pushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    return Boolean(sub) && Notification.permission === "granted";
  } catch {
    return false;
  }
}

export async function enablePush(): Promise<{ ok: boolean; message: string }> {
  if (!pushSupported())
    return { ok: false, message: "This browser doesn't support push notifications." };
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted")
      return { ok: false, message: "Notifications are blocked — allow them in your browser settings." };

    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    const saved = await saveSubscription(sub);
    if (!saved)
      return {
        ok: false,
        message: "Allowed, but couldn't register — reminders storage isn't set up yet (run supabase/reminders.sql).",
      };
    return { ok: true, message: "Notifications enabled on this device." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Couldn't enable notifications." };
  }
}

export async function disablePush(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      if (supabase) await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
    }
  } catch {
    /* ignore */
  }
}
