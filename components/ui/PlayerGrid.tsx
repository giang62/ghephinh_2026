"use client";

function initials(name: string) {
  const parts = name.trim().split(/\s+/g).slice(0, 2);
  const letters = parts.map((p) => p.slice(0, 1).toUpperCase()).join("");
  return letters || "?";
}

function colorFromName(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return `hsl(${h} 85% 60%)`;
}

export function PlayerGrid({
  players,
  title,
  subtitle
}: {
  players: { playerId: string; name: string }[];
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="grid" style={{ gap: 12 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="grid" style={{ gap: 2 }}>
          <div style={{ fontWeight: 800 }}>{title}</div>
          {subtitle ? <div className="subtitle">{subtitle}</div> : null}
        </div>
        <span className="pill">
          <span className="mono">{players.length}</span>
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 12
        }}
      >
        {players.map((p) => (
          <div
            key={p.playerId}
            className="card"
            style={{
              padding: 14,
              borderRadius: 18,
              position: "relative",
              overflow: "hidden"
            }}
          >
            <div className="row" style={{ gap: 12 }}>
              <div
                className="mono"
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  display: "grid",
                  placeItems: "center",
                  fontWeight: 900,
                  letterSpacing: "-0.02em",
                  color: "rgba(0,0,0,0.75)",
                  background: colorFromName(p.name),
                  boxShadow: "0 18px 42px rgba(0,0,0,0.35)"
                }}
              >
                {initials(p.name)}
              </div>
              <div style={{ fontWeight: 800, fontSize: 16, lineHeight: 1.2 }}>{p.name}</div>
            </div>
          </div>
        ))}
      </div>

      {!players.length ? <div className="subtitle">Chưa có ai tham gia.</div> : null}
    </div>
  );
}

