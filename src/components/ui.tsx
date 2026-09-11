"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

type Variant = "primary" | "soft" | "ghost" | "outline";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-white hover:brightness-105 shadow-card",
  soft: "bg-accent-soft text-accent-ink hover:brightness-[0.98]",
  ghost: "text-muted hover:text-ink hover:bg-raised",
  outline: "border border-line text-ink hover:bg-raised",
};

export function Button({
  children,
  variant = "primary",
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${variants[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  children,
  variant = "primary",
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  variant?: Variant;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${variants[variant]} ${className}`}
    >
      {children}
    </Link>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-line bg-surface shadow-card ${className}`}>
      {children}
    </div>
  );
}

export function Pill({
  children,
  active = false,
  onClick,
  className = "",
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const base =
    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition select-none";
  const look = active
    ? "bg-accent text-white"
    : "bg-raised text-muted hover:text-ink border border-line";
  return (
    <button type="button" onClick={onClick} className={`${base} ${look} ${className}`}>
      {children}
    </button>
  );
}

export function AppHeader({
  title,
  back,
  right,
}: {
  title?: React.ReactNode;
  back?: string;
  right?: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-ground/85 px-4 py-3 backdrop-blur">
      {back !== undefined ? (
        <button
          onClick={() => (back ? router.push(back) : router.back())}
          className="grid h-9 w-9 place-items-center rounded-full text-muted transition hover:bg-raised hover:text-ink"
          aria-label="Back"
        >
          ‹
        </button>
      ) : (
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-lg text-white shadow-card">
          ◵
        </div>
      )}
      <div className="min-w-0 flex-1">
        {typeof title === "string" ? (
          <h1 className="truncate text-lg font-bold tracking-tight">{title}</h1>
        ) : (
          title
        )}
      </div>
      {right}
    </header>
  );
}

export function Wordmark() {
  return (
    <div className="flex items-center gap-2">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-lg text-white shadow-card">
        ◵
      </span>
      <span className="text-xl font-extrabold tracking-tight">
        My<span className="text-accent">LifeSense</span>
      </span>
    </div>
  );
}

export function EmptyState({
  emoji,
  title,
  body,
}: {
  emoji: string;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-surface/60 px-6 py-10 text-center">
      <div className="mb-2 text-3xl">{emoji}</div>
      <p className="font-semibold text-ink">{title}</p>
      <p className="mx-auto mt-1 max-w-xs text-sm text-muted">{body}</p>
    </div>
  );
}

export function Loading() {
  return (
    <div className="flex items-center justify-center py-24 text-sm text-faint">Loading…</div>
  );
}
