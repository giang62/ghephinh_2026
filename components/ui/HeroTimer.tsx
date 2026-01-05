"use client";

import { useEffect, useMemo, useState } from "react";
import { formatMs } from "@/components/Countdown";

export function HeroTimer({
  serverNowMs,
  startedAtMs,
  endsAtMs,
  durationSec
}: {
  serverNowMs: number;
  startedAtMs: number | null;
  endsAtMs: number | null;
  durationSec: number;
}) {
  const offset = useMemo(() => serverNowMs - Date.now(), [serverNowMs]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 120);
    return () => clearInterval(id);
  }, []);

  const remainingMs = endsAtMs ? Math.max(0, endsAtMs - (now + offset)) : 0;
  const elapsedMs = startedAtMs ? Math.max(0, now + offset - startedAtMs) : 0;
  const totalMs = Math.max(1, durationSec * 1000);
  const pct = endsAtMs && startedAtMs ? Math.max(0, Math.min(1, 1 - elapsedMs / totalMs)) : 0;

  const color =
    remainingMs <= 10_000 ? "var(--bad)" : remainingMs <= 30_000 ? "var(--warn)" : "rgba(255,255,255,0.92)";

  return (
    <div className="heroTimerWrap">
      <div className="heroTimerValue mono" style={{ color }}>
        {endsAtMs ? formatMs(remainingMs) : "--:--"}
      </div>
      <div className="heroTimerLabel">
        {endsAtMs ? "Thời gian còn lại" : "Đang chờ quản trò bắt đầu"}
      </div>
      <div style={{ width: "100%", marginTop: 12 }}>
        <div className="progress" aria-hidden="true">
          <div style={{ width: `${Math.round(pct * 100)}%` }} />
        </div>
      </div>
    </div>
  );
}

