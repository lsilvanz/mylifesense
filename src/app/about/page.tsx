"use client";

import { useState } from "react";
import { AppHeader, Button, Card } from "@/components/ui";
import { useStore } from "@/lib/store";

export default function AboutPage() {
  const { resetDemo, senses, usingSupabase } = useStore();
  const [done, setDone] = useState(false);

  return (
    <main className="px-4 pb-16">
      <AppHeader title="About me" back="/" />

      <Card className="mt-4 p-5">
        <div className="flex items-center gap-3">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-accent-soft text-2xl">
            🙂
          </div>
          <div>
            <p className="text-lg font-bold text-ink">You</p>
            <p className="text-sm text-muted">
              {senses.length} active Senses ·{" "}
              {usingSupabase ? "synced to Supabase" : "stored on this device"}
            </p>
          </div>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-muted">
          This space is where a future version keeps the context that helps interpret your
          patterns — age, baseline health, goals. For this prototype it&apos;s a placeholder.
        </p>
      </Card>

      <Card className="mt-4 p-5">
        <p className="text-sm font-semibold text-ink">Prototype data</p>
        <p className="mt-1 text-sm text-muted">
          {usingSupabase
            ? "Your data is stored in Supabase under an anonymous account tied to this browser. Reset replaces it with the seeded demo Senses."
            : "All data lives in this browser (localStorage). Reset to restore the seeded demo Senses with their sample history."}
        </p>
        <Button
          variant="outline"
          className="mt-3"
          onClick={() => {
            resetDemo();
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          }}
        >
          {done ? "Reset ✓" : "Reset demo data"}
        </Button>
      </Card>

      <p className="mt-6 px-1 text-xs leading-relaxed text-faint">
        MyLifeSense prototype · Phase 1 core loop + client-side Insights. Chat and correlations are
        gated at {""}
        <strong>15 entries</strong> to avoid reporting noise as signal.
      </p>
    </main>
  );
}
