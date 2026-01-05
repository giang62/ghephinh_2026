"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ConfettiBurst } from "@/components/ui/ConfettiBurst";

type RoomView = {
  serverNowMs: number;
  roomId: string;
  gameId: "image-puzzle";
  status: "running" | "ended";
  startedAtMs: number | null;
  stageIndex: number;
  stageCount: number;
  stageStartedAtMs: number | null;
  endsAtMs: number | null;
  imageUrl: string | null;
};

type Props = {
  room: RoomView;
  disabled: boolean;
  onSubmit: (result: { type: "image-puzzle"; stageIndex: number; solved: boolean; completedMs: number | null }) => void;
};

const SIZE = 120;
const GRID = 3;

function shuffle<T>(arr: T[]) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function ImagePuzzleGame({ room, onSubmit, disabled }: Props) {
  const offsetMs = useMemo(() => room.serverNowMs - Date.now(), [room.serverNowMs]);
  const [order] = useState<number[]>(() => shuffle([...Array(GRID * GRID)].map((_, i) => i)));
  const [placed, setPlaced] = useState<boolean[]>(() => Array(GRID * GRID).fill(false));
  const [message, setMessage] = useState<string>("");
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [selectedPiece, setSelectedPiece] = useState<number | null>(null);
  const sentRef = useRef(false);

  const solvedCount = placed.filter(Boolean).length;
  const solved = solvedCount === GRID * GRID;

  const imageUrl = room.imageUrl ?? "/puzzles/puzzle1.png";
  const overlay =
    solved ? { title: "Bạn đã hoàn thành", body: "Đang gửi kết quả…" } : room.status === "ended" ? { title: "Hết giờ", body: "Bạn có thể xem bảng xếp hạng bên dưới." } : null;

  function nowServerMs() {
    return Date.now() + offsetMs;
  }

  function trySubmitSolved() {
    if (sentRef.current) return;
    if (!room.stageStartedAtMs) return;
    sentRef.current = true;
    const completedMs = Math.max(0, Math.round(nowServerMs() - room.stageStartedAtMs));
    onSubmit({ type: "image-puzzle", stageIndex: room.stageIndex, solved: true, completedMs });
  }

  useEffect(() => {
    if (solved) {
      setMessage("Hoàn thành!");
      trySubmitSolved();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solved]);

  useEffect(() => {
    if (room.status === "ended" && !solved) {
      setMessage("Hết giờ!");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.status]);

  function onPieceDragStart(e: React.DragEvent<HTMLDivElement>, pieceId: number) {
    if (disabled) return;
    setSelectedPiece(pieceId);
    e.dataTransfer.setData("text/plain", String(pieceId));
    e.dataTransfer.effectAllowed = "move";
  }

  function tryPlace(pieceId: number, zoneId: number) {
    if (placed[zoneId]) return;
    if (pieceId === zoneId) {
      setPlaced((prev) => {
        const next = [...prev];
        next[zoneId] = true;
        return next;
      });
      setSelectedPiece(null);
      setMessage("");
    } else {
      setMessage("Sai vị trí, thử lại nhé!");
      setTimeout(() => setMessage(""), 800);
    }
  }

  function onDropZoneDrop(e: React.DragEvent<HTMLDivElement>, zoneId: number) {
    e.preventDefault();
    if (disabled) return;
    if (placed[zoneId]) return;
    setDragOver(null);

    const raw = e.dataTransfer.getData("text/plain");
    const pieceId = Number(raw);
    if (!Number.isFinite(pieceId)) return;

    tryPlace(pieceId, zoneId);
  }

  function onDropZoneOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (disabled) return;
    e.dataTransfer.dropEffect = "move";
  }

  const pieceStyle = (pieceId: number) => {
    const row = Math.floor(pieceId / GRID);
    const col = pieceId % GRID;
    return {
      width: SIZE,
      height: SIZE,
      borderRadius: 12,
      border: "1px solid rgba(255,255,255,0.22)",
      boxShadow: "0 10px 24px rgba(0,0,0,0.35)",
      backgroundImage: `url(${imageUrl})`,
      backgroundSize: `${SIZE * GRID}px ${SIZE * GRID}px`,
      backgroundPosition: `-${col * SIZE}px -${row * SIZE}px`,
      cursor: disabled ? "default" : "grab"
    } as const;
  };

  return (
    <div className="grid" style={{ gap: 14 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="pill">
          Đúng <span className="mono">{solvedCount}</span>/<span className="mono">{GRID * GRID}</span>
        </span>
        {message ? <span className="pill">{message}</span> : null}
      </div>

      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="subtitle">Kéo thả hoặc chạm: chọn mảnh → chọn ô.</div>
        <div className="row" style={{ gap: 10 }}>
          <span className="pill">Gợi ý:</span>
          <div
            style={{
              width: 54,
              height: 54,
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.16)",
              backgroundImage: `url(${imageUrl})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              boxShadow: "0 10px 26px rgba(0,0,0,0.35)"
            }}
            aria-label="Ảnh gốc"
            title="Ảnh gốc"
          />
        </div>
      </div>

      <div className="row" style={{ gap: 18, alignItems: "flex-start", flexWrap: "wrap", position: "relative" }}>
        {solved ? <ConfettiBurst /> : null}
        {overlay ? (
          <div className="overlay">
            <div className="overlayCard">
              <h3 className="bigTitle">{overlay.title}</h3>
              <div className="subtitle" style={{ marginTop: 6 }}>
                {overlay.body}
              </div>
            </div>
          </div>
        ) : null}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${GRID}, ${SIZE}px)`,
            gridTemplateRows: `repeat(${GRID}, ${SIZE}px)`,
            gap: 8,
            padding: 14,
            borderRadius: 18,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.05)"
          }}
        >
          {Array.from({ length: GRID * GRID }, (_, zoneId) => (
            <div
              key={zoneId}
              onDragOver={onDropZoneOver}
              onDrop={(e) => onDropZoneDrop(e, zoneId)}
              onDragEnter={() => (disabled ? null : setDragOver(zoneId))}
              onDragLeave={() => (disabled ? null : setDragOver((cur) => (cur === zoneId ? null : cur)))}
              onClick={() => {
                if (disabled) return;
                if (selectedPiece === null) return;
                tryPlace(selectedPiece, zoneId);
              }}
              style={{
                width: SIZE,
                height: SIZE,
                borderRadius: 12,
                position: "relative",
                overflow: "hidden",
                border: placed[zoneId]
                  ? "2px solid rgba(34,197,94,0.7)"
                  : dragOver === zoneId
                    ? "2px solid rgba(124,58,237,0.75)"
                    : "2px dashed rgba(255,255,255,0.25)",
                background: dragOver === zoneId ? "rgba(124,58,237,0.16)" : "rgba(0,0,0,0.15)",
                transform: dragOver === zoneId ? "scale(1.02)" : "none",
                transition: "transform 0.12s ease, background 0.12s ease, border-color 0.12s ease"
              }}
            >
              {placed[zoneId] ? <div style={pieceStyle(zoneId)} /> : null}
            </div>
          ))}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${GRID}, ${SIZE}px)`,
            gridTemplateRows: `repeat(${GRID}, ${SIZE}px)`,
            gap: 10,
            padding: 14,
            borderRadius: 18,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.05)"
          }}
        >
          {order.map((pieceId) => (
            <div
              key={pieceId}
              draggable={!disabled && !placed[pieceId]}
              onDragStart={(e) => onPieceDragStart(e, pieceId)}
              onClick={() => {
                if (disabled) return;
                if (placed[pieceId]) return;
                setSelectedPiece((cur) => (cur === pieceId ? null : pieceId));
              }}
              style={{
                ...pieceStyle(pieceId),
                opacity: placed[pieceId] ? 0.15 : 1,
                transform: placed[pieceId] ? "scale(0.98)" : selectedPiece === pieceId ? "scale(1.03)" : "none",
                filter: placed[pieceId] ? "grayscale(0.4)" : "none",
                pointerEvents: placed[pieceId] ? "none" : "auto",
                outline: selectedPiece === pieceId ? "3px solid rgba(124,58,237,0.75)" : "none"
              }}
              title={disabled ? "" : "Kéo thả"}
            />
          ))}
        </div>
      </div>

      <div className="subtitle">
        Mẹo: kéo thả trên điện thoại đôi khi không ổn định; dùng máy tính sẽ mượt hơn.
      </div>
    </div>
  );
}
