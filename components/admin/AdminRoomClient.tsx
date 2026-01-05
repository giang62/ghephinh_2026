"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchJson } from "@/lib/client";
import { RoomQr } from "@/components/RoomQr";
import { Countdown } from "@/components/Countdown";
import { HeroTimer } from "@/components/ui/HeroTimer";
import { ToastStack, useToasts } from "@/components/ui/useToasts";
import { PlayerGrid } from "@/components/ui/PlayerGrid";
import { PodiumBoard } from "@/components/ui/PodiumBoard";
import type { PlayerResult, PublicLeaderboardEntry } from "@/lib/roomStore";

type AdminRoomView = {
  serverNowMs: number;
  roomId: string;
  gameId: string;
  status: "lobby" | "running" | "ended";
  durationSec: number;
  startedAtMs: number | null;
  endsAtMs: number | null;
  remainingMs: number;
  imageUrl: string | null;
  players: { playerId: string; name: string; joinedAtMs: number }[];
  results: PlayerResult[];
};

export function AdminRoomClient({ roomId, keyFromUrl }: { roomId: string; keyFromUrl: string }) {
  const [adminKey, setAdminKey] = useState<string>("");
  const [view, setView] = useState<AdminRoomView | null>(null);
  const [error, setError] = useState<string>("");
  const [durationSec, setDurationSec] = useState<number>(60);
  const [imageUrl, setImageUrl] = useState<string>("/puzzles/puzzle1.png");
  const [busy, setBusy] = useState(false);
  const { toasts, push } = useToasts();

  useEffect(() => {
    const stored = localStorage.getItem(`admin:${roomId}`) ?? "";
    const key = keyFromUrl || stored;
    setAdminKey(key);
    if (keyFromUrl && keyFromUrl !== stored) localStorage.setItem(`admin:${roomId}`, keyFromUrl);
  }, [keyFromUrl, roomId]);

  useEffect(() => {
    if (!adminKey) return;
    let cancelled = false;
    let prevPlayerIds = new Set<string>();
    let prevResultIds = new Set<string>();

    async function tick() {
      const next = await fetchJson<AdminRoomView>(`/api/rooms/${roomId}?adminKey=${encodeURIComponent(adminKey)}`);
      if (cancelled) return;
      setView(next);
      setDurationSec(next.durationSec);
      if (typeof next.imageUrl === "string" && next.imageUrl) setImageUrl(next.imageUrl);
      setError("");

      const nextPlayerIds = new Set(next.players.map((p) => p.playerId));
      for (const p of next.players) {
        if (!prevPlayerIds.has(p.playerId)) {
          push({ title: "Có người mới tham gia", body: p.name, tone: "info", ttlMs: 2200 });
        }
      }
      prevPlayerIds = nextPlayerIds;

      const nextResultIds = new Set(next.results.map((r) => r.playerId));
      for (const r of next.results) {
        if (!prevResultIds.has(r.playerId)) {
          push({ title: "Có người vừa nộp kết quả", body: r.name, tone: "good", ttlMs: 2400 });
        }
      }
      prevResultIds = nextResultIds;
    }

    tick().catch((e) => setError(e instanceof Error ? e.message : String(e)));
    const id = setInterval(() => tick().catch(() => {}), 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [adminKey, roomId]);

  const joinUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/join/${roomId}`;
  }, [roomId]);

  async function copyJoinLink() {
    if (!joinUrl) return;
    await navigator.clipboard.writeText(joinUrl);
    push({ title: "Đã sao chép link tham gia", tone: "good", ttlMs: 1800 });
  }

  async function onConfigure() {
    if (!adminKey) return;
    setBusy(true);
    try {
      await fetchJson(`/api/rooms/${roomId}/configure`, {
        method: "POST",
        body: JSON.stringify({ adminKey, durationSec, imageUrl })
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onStart() {
    if (!adminKey) return;
    setBusy(true);
    try {
      await fetchJson(`/api/rooms/${roomId}/start`, {
        method: "POST",
        body: JSON.stringify({ adminKey })
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onEnd() {
    if (!adminKey) return;
    setBusy(true);
    try {
      await fetchJson(`/api/rooms/${roomId}/end`, {
        method: "POST",
        body: JSON.stringify({ adminKey })
      });
      push({ title: "Đã kết thúc lượt chơi", tone: "warn", ttlMs: 2200 });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onRestart() {
    if (!adminKey) return;
    setBusy(true);
    try {
      await fetchJson(`/api/rooms/${roomId}/restart`, {
        method: "POST",
        body: JSON.stringify({ adminKey })
      });
      push({ title: "Đã reset về phòng chờ", tone: "good", ttlMs: 2200 });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const sortedBoard = useMemo(() => {
    if (!view) return [];
    const byPlayer = new Map(view.results.map((r) => [r.playerId, r]));
    const rows = view.players.map((p) => ({ player: p, result: byPlayer.get(p.playerId) ?? null }));

    if (view.gameId === "click-counter") {
      return rows.sort((a, b) => {
        const as = a.result?.result.type === "click-counter" ? a.result.result.score : -1;
        const bs = b.result?.result.type === "click-counter" ? b.result.result.score : -1;
        return bs - as;
      });
    }

    return rows.sort((a, b) => {
      const ar = a.result?.result.type === "image-puzzle" ? a.result.result : null;
      const br = b.result?.result.type === "image-puzzle" ? b.result.result : null;
      const as = ar?.solved ? 1 : 0;
      const bs = br?.solved ? 1 : 0;
      if (bs !== as) return bs - as;
      const at = ar?.completedMs ?? Number.POSITIVE_INFINITY;
      const bt = br?.completedMs ?? Number.POSITIVE_INFINITY;
      return at - bt;
    });
  }, [view]);

  if (!adminKey) {
    return (
      <section className="card">
        <div className="grid" style={{ gap: 10 }}>
          <div className="pill" style={{ color: "var(--bad)" }}>
            Thiếu mã quản trị. Hãy mở trang này từ bước tạo phòng.
          </div>
          <Link className="btn" href="/admin/create">
            Tạo phòng mới
          </Link>
        </div>
      </section>
    );
  }

  const statusLabel =
    view?.status === "lobby" ? "Chờ" : view?.status === "running" ? "Đang chơi" : view?.status === "ended" ? "Kết thúc" : "";

  return (
    <>
      <ToastStack toasts={toasts} />
      {error ? (
        <section className="card">
          <div className="pill" style={{ color: "var(--bad)" }}>
            {error}
          </div>
        </section>
      ) : null}

      {view ? (
        <section className="card">
          <div className="grid" style={{ gap: 12 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="pill">
                Trạng thái <span className="mono">{statusLabel}</span>
              </span>
              <Countdown endsAtMs={view.endsAtMs} serverNowMs={view.serverNowMs} />
            </div>
            {view.status !== "lobby" ? (
              <HeroTimer
                serverNowMs={view.serverNowMs}
                startedAtMs={view.startedAtMs}
                endsAtMs={view.endsAtMs}
                durationSec={view.durationSec}
              />
            ) : null}
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="pill">
                Người chơi <span className="mono">{view.players.length}</span>
              </span>
              <span className="pill">
                Đã nộp <span className="mono">{view.results.length}</span>
              </span>
            </div>
          </div>
        </section>
      ) : null}

      {view?.status === "lobby" ? (
        <>
          <section className="card" style={{ padding: 18 }}>
            <PlayerGrid
              players={view.players.map((p) => ({ playerId: p.playerId, name: p.name }))}
              title="Phòng chờ"
              subtitle="Người chơi tham gia bằng link/QR bên dưới"
            />
          </section>

          <section className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
            <div className="card">
              <div className="grid" style={{ gap: 12 }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <div className="grid" style={{ gap: 2 }}>
                    <div style={{ fontWeight: 800 }}>Tham gia</div>
                    <div className="subtitle mono" style={{ wordBreak: "break-all" }}>
                      {joinUrl || "Đang tải…"}
                    </div>
                  </div>
                  <button className="btn" onClick={copyJoinLink} disabled={!joinUrl}>
                    Sao chép
                  </button>
                </div>
                <div className="row" style={{ justifyContent: "center" }}>
                  <RoomQr url={joinUrl} />
                </div>
              </div>
            </div>

            <div className="card">
              <div className="grid" style={{ gap: 12 }}>
                <div style={{ fontWeight: 800 }}>Cài đặt & điều khiển</div>

                <div className="row" style={{ alignItems: "flex-end" }}>
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

                  {view?.gameId === "image-puzzle" ? (
                    <div style={{ flex: 1 }}>
                      <label className="label">Ảnh ghép hình</label>
                      <select className="input" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)}>
                        <option value="/puzzles/puzzle1.png">Ảnh 1</option>
                        <option value="/puzzles/puzzle2.png">Ảnh 2</option>
                      </select>
                    </div>
                  ) : null}
                </div>

                <div className="row">
                  <button className="btn" disabled={busy} onClick={onConfigure}>
                    Lưu cài đặt
                  </button>
                  <button className="btn btnPrimary" disabled={busy} onClick={onStart}>
                    Bắt đầu
                  </button>
                  <span className="pill">Tắt QR/link sau khi bắt đầu</span>
                </div>
              </div>
            </div>
          </section>
        </>
      ) : null}

      {view?.status === "running" ? (
        <section className="card">
          <div className="grid" style={{ gap: 12 }}>
            <div style={{ fontWeight: 800 }}>Đang chơi</div>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="pill">
                Đã nộp <span className="mono">{view.results.length}</span>/<span className="mono">{view.players.length}</span>
              </span>
              <button className="btn" disabled={busy} onClick={onEnd}>
                Kết thúc lượt chơi
              </button>
            </div>
            <div className="subtitle">
              Lượt chơi sẽ tự kết thúc khi tất cả người chơi đã nộp kết quả hoặc khi hết giờ.
            </div>
          </div>
        </section>
      ) : null}

      {view?.status === "ended" ? (
        <section className="card">
          <div className="grid" style={{ gap: 12 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div style={{ fontWeight: 900, fontSize: 20, letterSpacing: "-0.02em" }}>Bảng xếp hạng</div>
              <button className="btn btnPrimary" disabled={busy} onClick={onRestart}>
                Chơi lại (reset)
              </button>
            </div>
            <PodiumBoard entries={getEntriesFromAdmin(view, sortedBoard)} />
            <div className="subtitle">Bấm “Chơi lại” để quay về phòng chờ và bắt đầu lượt mới.</div>
          </div>
        </section>
      ) : null}
    </>
  );
}

function getEntriesFromAdmin(
  view: { players: { playerId: string; name: string }[]; results: PlayerResult[]; gameId: string; status: "lobby" | "running" | "ended" },
  sortedBoard: { player: { playerId: string; name: string }; result: PlayerResult | null }[]
) : PublicLeaderboardEntry[] {
  // Convert existing computed order into PublicLeaderboardEntry-like objects.
  return sortedBoard.map(({ player, result }, idx) => {
    const submitted = Boolean(result);
    const label =
      view.gameId === "click-counter"
        ? result?.result.type === "click-counter"
          ? `${result.result.score} lần`
          : view.status === "ended"
            ? "Chưa nộp"
            : "—"
        : result?.result.type === "image-puzzle"
          ? result.result.solved
            ? `${Math.round((result.result.completedMs ?? 0) / 1000)}s`
            : "Chưa xong"
          : view.status === "ended"
            ? "Chưa nộp"
            : "—";

    return { playerId: player.playerId, name: player.name, submitted, label, rank: idx + 1 };
  });
}
