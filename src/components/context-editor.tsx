"use client";

import { useRef, useState } from "react";
import { Button, Card } from "./ui";
import { getContext, setContext, MAX_CONTEXT_CHARS } from "@/lib/context";

export function ContextEditor({ senseId }: { senseId: string }) {
  const [text, setText] = useState(() => getContext(senseId));
  const [saved, setSaved] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const save = () => {
    setContext(senseId, text);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    let added = "";
    let skipped = 0;
    for (const file of Array.from(files)) {
      const isText =
        /\.(txt|md|markdown|csv|tsv|json|log)$/i.test(file.name) || file.type.startsWith("text/");
      if (!isText) {
        skipped++;
        continue;
      }
      const content = await file.text();
      added += `\n\n--- ${file.name} ---\n${content.trim()}`;
    }
    if (added) setText((prev) => (prev + added).slice(0, MAX_CONTEXT_CHARS));
    setMsg(
      skipped
        ? `Added text. Skipped ${skipped} file(s) — PDFs/images aren't supported yet (paste their text instead).`
        : "Attached — remember to Save."
    );
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <Card className="p-4">
      <p className="text-sm font-semibold text-ink">Context for AI</p>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        Background that helps Chat, Insights and suggestions understand your situation — conditions,
        goals, routine, anything relevant. Used only to interpret your data; stored in this browser.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder="e.g. I'm 45 with GERD, desk job, training for a 10k. Doctor mentioned anxiety. I usually skip breakfast…"
        className="mt-2 w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.md,.markdown,.csv,.tsv,.json,.log,text/*"
          multiple
          hidden
          onChange={(e) => onFiles(e.target.files)}
        />
        <Button variant="outline" className="text-sm" onClick={() => fileRef.current?.click()}>
          Attach text file
        </Button>
        <Button className="text-sm" onClick={save}>
          {saved ? "Saved ✓" : "Save context"}
        </Button>
        <span className="ml-auto text-xs text-faint">
          {text.length}/{MAX_CONTEXT_CHARS}
        </span>
      </div>
      {msg && <p className="mt-2 text-xs text-muted">{msg}</p>}
    </Card>
  );
}
