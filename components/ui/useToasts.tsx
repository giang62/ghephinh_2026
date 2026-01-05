"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type ToastTone = "info" | "good" | "warn" | "bad";

export type Toast = {
  id: string;
  title: string;
  body?: string;
  tone?: ToastTone;
};

function toneColor(tone: ToastTone | undefined) {
  if (tone === "good") return "var(--good)";
  if (tone === "warn") return "var(--warn)";
  if (tone === "bad") return "var(--bad)";
  return "rgba(255,255,255,0.92)";
}

export function ToastStack({ toasts }: { toasts: Toast[] }) {
  if (!toasts.length) return null;
  return (
    <div className="toastStack" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <p className="toastTitle" style={{ color: toneColor(t.tone) }}>
            {t.title}
          </p>
          {t.body ? <p className="toastBody">{t.body}</p> : null}
        </div>
      ))}
    </div>
  );
}

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, number>>(new Map());

  const push = useCallback((toast: Omit<Toast, "id"> & { ttlMs?: number }) => {
    const id = crypto.randomUUID();
    const ttlMs = toast.ttlMs ?? 2400;
    setToasts((prev) => [{ id, title: toast.title, body: toast.body, tone: toast.tone }, ...prev].slice(0, 4));

    const timer = window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      timers.current.delete(id);
    }, ttlMs);
    timers.current.set(id, timer);
  }, []);

  useEffect(() => {
    return () => {
      for (const timer of timers.current.values()) window.clearTimeout(timer);
      timers.current.clear();
    };
  }, []);

  return useMemo(() => ({ toasts, push }), [push, toasts]);
}

