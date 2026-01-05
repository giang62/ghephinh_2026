"use client";

import type { PublicLeaderboardEntry } from "@/lib/roomStore";

export function RankBoard({
  entries,
  mePlayerId
}: {
  entries: PublicLeaderboardEntry[];
  mePlayerId?: string | null;
}) {
  if (!entries.length) return <div className="subtitle">Chưa có kết quả.</div>;

  return (
    <div className="grid" style={{ gap: 10 }}>
      {entries.map((e, idx) => {
        const isTop = idx < 3 && e.submitted;
        const isMe = mePlayerId && e.playerId === mePlayerId;
        return (
          <div
            key={e.playerId}
            className={`leaderboardRow ${isTop ? "leaderboardRowTop" : ""}`}
            style={{
              outline: isMe ? "2px solid rgba(34,197,94,0.55)" : "none",
              background: isMe ? "rgba(34,197,94,0.12)" : undefined
            }}
          >
            <div className="row" style={{ gap: 10 }}>
              <span className="pill mono">#{e.rank ?? "—"}</span>
              <span style={{ fontWeight: 650 }}>{e.name}</span>
              {!e.submitted ? <span className="pill">Chưa nộp</span> : null}
            </div>
            <span className="pill mono">{e.label}</span>
          </div>
        );
      })}
    </div>
  );
}

