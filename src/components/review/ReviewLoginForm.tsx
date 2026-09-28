"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

export function ReviewLoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const nextRaw = params.get("next") || "/review";
  const next = nextRaw.startsWith("/review") ? nextRaw : "/review"; // no open redirects
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/review-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Sign-in failed.");
        setPassword("");
        return;
      }
      router.replace(next);
      router.refresh();
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm pt-10">
      <form onSubmit={submit} className="card space-y-4 p-6" aria-labelledby="login-heading">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-violet-300/80">Founder only</p>
          <h1 id="login-heading" className="mt-1 text-xl font-semibold text-ink-50">
            Content review sign-in
          </h1>
        </div>
        <div className="space-y-1">
          <label htmlFor="review-passcode" className="text-sm text-ink-200">
            Passcode
          </label>
          <input
            id="review-passcode"
            type="password"
            autoComplete="current-password"
            className="input w-full"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoFocus
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-rose-200">
            {error}
          </p>
        )}
        <button type="submit" className="btn-primary w-full disabled:opacity-50" disabled={busy || !password}>
          {busy ? "Checking…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
