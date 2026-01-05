"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GAMES, type GameId } from "@/lib/games";
import { fetchJson } from "@/lib/client";

type CreateRoomResponse = { roomId: string; adminKey: string };

export function AdminCreateClient({ initialGameId }: { initialGameId: GameId }) {
  const router = useRouter();
  const [gameId, setGameId] = useState<GameId>(initialGameId);
  const [durationSec, setDurationSec] = useState<number>(60);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  async function onCreate() {
    setError("");
    setLoading(true);
    try {
      const created = await fetchJson<CreateRoomResponse>("/api/rooms", {
        method: "POST",
        body: JSON.stringify({ gameId, durationSec })
      });
      localStorage.setItem(`admin:${created.roomId}`, created.adminKey);
      router.push(`/admin/room/${created.roomId}?key=${encodeURIComponent(created.adminKey)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card">
      <div className="grid" style={{ gap: 14 }}>
        <div className="row" style={{ alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <label className="label">Chọn game</label>
            <select className="input" value={gameId} onChange={(e) => setGameId(e.target.value as GameId)}>
              {GAMES.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Thời gian (giây)</label>
            <input
              className="input"
              type="number"
              min={10}
              max={900}
              step={5}
              value={durationSec}
              onChange={(e) => setDurationSec(Number(e.target.value))}
            />
          </div>
        </div>

        {error ? (
          <div className="pill" style={{ color: "var(--bad)" }}>
            {error}
          </div>
        ) : null}

        <div className="row">
          <button className="btn btnPrimary" onClick={onCreate} disabled={loading}>
            {loading ? "Đang tạo…" : "Tạo phòng"}
          </button>
          <span className="pill">Người chơi tham gia bằng link/QR</span>
          <span className="pill">Bấm Bắt đầu khi sẵn sàng</span>
        </div>
      </div>
    </section>
  );
}
