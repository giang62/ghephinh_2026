"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ConfettiBurst } from "@/components/ui/ConfettiBurst";

type RoomView = {
  serverNowMs: number;
  roomId: string;
  gameId: "click-counter";
  status: "running" | "ended";
  startedAtMs: number | null;
  endsAtMs: number | null;
};

type Props = {
  room: RoomView;
  disabled: boolean;
  onSubmit: (result: { type: "click-counter"; stageIndex: number; score: number }) => void;
};

export function ClickCounterGame({ room, onSubmit, disabled }: Props) {
  const offsetMs = useMemo(() => room.serverNowMs - Date.now(), [room.serverNowMs]);
  const [score, setScore] = useState(0);
  const [message, setMessage] = useState("");
  const [burst, setBurst] = useState(0);
  const sentRef = useRef(false);

  function nowServerMs() {
    return Date.now() + offsetMs;
  }

  function isTimeUp() {
    return room.endsAtMs ? nowServerMs() >= room.endsAtMs : false;
  }

  function trySubmit() {
    if (sentRef.current) return;
    sentRef.current = true;
    setBurst((b) => b + 1);
    onSubmit({ type: "click-counter", stageIndex: 0, score });
  }

  useEffect(() => {
    if (!room.endsAtMs) return;
    if (disabled) return;
    const remaining = room.endsAtMs - nowServerMs();
    if (remaining <= 0) {
      setMessage("Hết giờ!");
      trySubmit();
      return;
    }
    const id = window.setTimeout(() => {
      setMessage("Hết giờ!");
      trySubmit();
    }, remaining);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.endsAtMs, disabled]);

  function onClick() {
    if (disabled) return;
    if (isTimeUp()) return;
    setScore((s) => s + 1);
  }

  return (
    <div className="grid" style={{ gap: 14, position: "relative" }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="pill">
          Điểm <span className="mono">{score}</span>
        </span>
        {message ? <span className="pill">{message}</span> : null}
      </div>

      <div className="grid" style={{ gap: 12, placeItems: "center" }}>
        {burst ? <ConfettiBurst key={burst} /> : null}
        <button
          className="btn btnPrimary"
          style={{ padding: "18px 22px", borderRadius: 18, fontSize: 18 }}
          onClick={onClick}
          disabled={disabled || isTimeUp()}
        >
          Bấm!
        </button>
        <button className="btn" onClick={trySubmit} disabled={disabled}>
          Nộp điểm
        </button>
        <div className="subtitle">Bấm càng nhiều càng tốt. Ai điểm cao nhất sẽ thắng.</div>
      </div>
    </div>
  );
}
