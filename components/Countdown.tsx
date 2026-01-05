"use client";

import { useEffect, useMemo, useState } from "react";

export function formatMs(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function Countdown({ endsAtMs, serverNowMs }: { endsAtMs: number | null; serverNowMs: number }) {
  const offset = useMemo(() => serverNowMs - Date.now(), [serverNowMs]);
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, []);

  if (!endsAtMs) return <span className="pill">Chưa bắt đầu</span>;

  const remaining = Math.max(0, endsAtMs - (now + offset));
  const color = remaining <= 10_000 ? "var(--bad)" : remaining <= 30_000 ? "var(--warn)" : "var(--muted)";
  return (
    <span className="pill" style={{ color }}>
      Còn lại <span className="mono">{formatMs(remaining)}</span>
    </span>
  );
}
