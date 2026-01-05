"use client";

import type { PublicLeaderboardEntry } from "@/lib/roomStore";

function medal(rank: number) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return "";
}

export function PodiumBoard({ entries }: { entries: PublicLeaderboardEntry[] }) {
  if (!entries.length) return <div className="subtitle">Chưa có kết quả.</div>;

  const top = entries.slice(0, 3);
  const rest = entries.slice(3);

  const card = (e: PublicLeaderboardEntry, emphasis: "first" | "second" | "third") => {
    const bg =
      emphasis === "first"
        ? "rgba(245, 158, 11, 0.18)"
        : emphasis === "second"
          ? "rgba(148, 163, 184, 0.18)"
          : "rgba(217, 119, 6, 0.14)";
    const border =
      emphasis === "first"
        ? "rgba(245, 158, 11, 0.42)"
        : emphasis === "second"
          ? "rgba(148, 163, 184, 0.36)"
          : "rgba(217, 119, 6, 0.32)";
    return (
      <div
        className="card"
        style={{
          padding: 16,
          borderRadius: 22,
          background: bg,
          border: `1px solid ${border}`,
          position: "relative",
          overflow: "hidden"
        }}
      >
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <div className="grid" style={{ gap: 6 }}>
            <div className="pill mono" style={{ width: "fit-content" }}>
              {medal(e.rank ?? 0)} #{e.rank}
            </div>
            <div style={{ fontWeight: 900, fontSize: 20, letterSpacing: "-0.02em" }}>{e.name}</div>
            <div className="subtitle">{e.submitted ? "Đã nộp" : "Chưa nộp"}</div>
          </div>
          <div className="pill mono" style={{ fontSize: 14 }}>
            {e.label}
          </div>
        </div>
      </div>
    );
  };

  const first = top.find((e) => e.rank === 1) ?? top[0];
  const second = top.find((e) => e.rank === 2) ?? top[1];
  const third = top.find((e) => e.rank === 3) ?? top[2];

  return (
    <div className="grid" style={{ gap: 14 }}>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
        {second ? card(second, "second") : null}
        {first ? card(first, "first") : null}
        {third ? card(third, "third") : null}
      </div>

      {rest.length ? (
        <div className="grid" style={{ gap: 10 }}>
          {rest.map((e) => (
            <div key={e.playerId} className="leaderboardRow">
              <div className="row" style={{ gap: 10 }}>
                <span className="pill mono">#{e.rank}</span>
                <span style={{ fontWeight: 750 }}>{e.name}</span>
                {!e.submitted ? <span className="pill">Chưa nộp</span> : null}
              </div>
              <span className="pill mono">{e.label}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

