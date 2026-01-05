"use client";

import { useMemo } from "react";

type Piece = {
  leftPct: number;
  topPct: number;
  dx: string;
  dy: string;
  rot: string;
  color: string;
  delayMs: number;
};

const COLORS = ["#22c55e", "#7c3aed", "#60a5fa", "#f59e0b", "#ef4444", "#a78bfa"];

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

export function ConfettiBurst({ count = 26 }: { count?: number }) {
  const pieces = useMemo<Piece[]>(() => {
    return Array.from({ length: count }, () => {
      const angle = rand(-Math.PI * 0.95, -Math.PI * 0.05);
      const dist = rand(120, 280);
      const dx = `${Math.cos(angle) * dist}px`;
      const dy = `${Math.sin(angle) * dist}px`;
      return {
        leftPct: rand(35, 65),
        topPct: rand(40, 60),
        dx,
        dy,
        rot: `${rand(-540, 540)}deg`,
        color: COLORS[Math.floor(rand(0, COLORS.length))]!,
        delayMs: Math.floor(rand(0, 140))
      };
    });
  }, [count]);

  return (
    <div className="sparkle" aria-hidden="true">
      {pieces.map((p, idx) => (
        <span
          key={idx}
          className="sparklePiece"
          style={{
            left: `${p.leftPct}%`,
            top: `${p.topPct}%`,
            background: p.color,
            animationDelay: `${p.delayMs}ms`,
            ["--dx" as never]: p.dx,
            ["--dy" as never]: p.dy,
            ["--rot" as never]: p.rot
          }}
        />
      ))}
    </div>
  );
}

