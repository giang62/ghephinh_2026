"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetchJson } from "@/lib/client";
import { Countdown } from "@/components/Countdown";

type PublicRoomView = {
  serverNowMs: number;
  roomId: string;
  gameId: string;
  status: "lobby" | "running" | "ended";
  durationSec: number;
  startedAtMs: number | null;
  endsAtMs: number | null;
  remainingMs: number;
  imageUrl: string | null;
  players: { playerId: string; name: string }[];
};

type JoinResponse = { playerId: string; token: string; room: Omit<PublicRoomView, "players" | "serverNowMs"> };

export default function JoinRoomPage() {
  const params = useParams<{ roomId: string }>();
  const router = useRouter();
  const roomId = params.roomId;

  const [view, setView] = useState<PublicRoomView | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const existing = useMemo(() => {
    if (typeof window === "undefined") return null as null | { playerId: string; token: string; name: string };
    const raw = localStorage.getItem(`player:${roomId}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as { playerId: string; token: string; name: string };
    } catch {
      return null;
    }
  }, [roomId]);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      const next = await fetchJson<PublicRoomView>(`/api/rooms/${roomId}`);
      if (cancelled) return;
      setView(next);
      setError("");
    }
    tick().catch((e) => setError(e instanceof Error ? e.message : String(e)));
    const id = setInterval(() => tick().catch(() => {}), 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [roomId]);

  async function onJoin() {
    setError("");
    setBusy(true);
    try {
      const joined = await fetchJson<JoinResponse>(`/api/rooms/${roomId}/join`, {
        method: "POST",
        body: JSON.stringify({ name })
      });
      localStorage.setItem(`player:${roomId}`, JSON.stringify({ playerId: joined.playerId, token: joined.token, name }));
      router.push(`/play/${roomId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function continueGame() {
    router.push(`/play/${roomId}`);
  }

  return (
    <main className="container">
      <div className="grid" style={{ gap: 16 }}>
        <header className="row" style={{ justifyContent: "space-between" }}>
          <div className="grid" style={{ gap: 6 }}>
            <div className="row">
              <h1 className="title" style={{ margin: 0 }}>
                Tham gia phòng <span className="mono">{roomId}</span>
              </h1>
              {view ? (
                <span className="pill">
                  Trạng thái{" "}
                  <span className="mono">
                    {view.status === "lobby" ? "Chờ" : view.status === "running" ? "Đang chơi" : "Kết thúc"}
                  </span>
                </span>
              ) : null}
              {view ? <Countdown endsAtMs={view.endsAtMs} serverNowMs={view.serverNowMs} /> : null}
            </div>
            <div className="subtitle">Nhập tên của bạn để tham gia.</div>
          </div>
          <Link className="btn" href="/">
            ← Danh sách game
          </Link>
        </header>

        {error ? (
          <section className="card">
            <div className="pill" style={{ color: "var(--bad)" }}>
              {error}
            </div>
          </section>
        ) : null}

        <section className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
          <div className="card">
            <div className="grid" style={{ gap: 12 }}>
              {existing ? (
                <div className="grid" style={{ gap: 10 }}>
                  <div className="pill">
                    Bạn đã tham gia với tên <span className="mono">{existing.name}</span>.
                  </div>
                  <button className="btn btnPrimary" onClick={continueGame}>
                    Tiếp tục
                  </button>
                </div>
              ) : view?.status === "ended" ? (
                <div className="grid" style={{ gap: 10 }}>
                  <div className="pill" style={{ color: "var(--warn)" }}>
                    Phòng đã kết thúc. Hãy tạo phòng mới để chơi tiếp.
                  </div>
                  <Link className="btn btnPrimary" href="/">
                    Về trang chủ
                  </Link>
                </div>
              ) : (
                <div className="grid" style={{ gap: 10 }}>
                  <div>
                    <label className="label">Tên của bạn</label>
                    <input
                      className="input"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ví dụ: Giang"
                      autoFocus
                    />
                  </div>
                  <button className="btn btnPrimary" onClick={onJoin} disabled={busy || !name.trim()}>
                    {busy ? "Đang tham gia…" : "Tham gia"}
                  </button>
                  {view?.status === "running" ? (
                    <div className="pill" style={{ color: "var(--warn)" }}>
                      Game đã bắt đầu — bạn vẫn có thể vào, nhưng sẽ bị trễ.
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="grid" style={{ gap: 10 }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div style={{ fontWeight: 600 }}>Người chơi trong phòng</div>
                <span className="pill">
                  <span className="mono">{view?.players.length ?? 0}</span>
                </span>
              </div>
              <div className="grid" style={{ gap: 8 }}>
                {(view?.players ?? []).map((p) => (
                  <div key={p.playerId} className="row" style={{ justifyContent: "space-between" }}>
                    <span>{p.name}</span>
                  </div>
                ))}
                {!view?.players.length ? <div className="subtitle">Chưa có ai tham gia.</div> : null}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
