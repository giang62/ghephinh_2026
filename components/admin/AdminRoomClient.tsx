"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/client";
import { RoomQr } from "@/components/RoomQr";
import { Countdown } from "@/components/Countdown";
import { HeroTimer } from "@/components/ui/HeroTimer";
import { ToastStack, useToasts } from "@/components/ui/useToasts";
import { PlayerGrid } from "@/components/ui/PlayerGrid";
import { PodiumBoard } from "@/components/ui/PodiumBoard";
import { StageImagesResult } from "@/components/ui/StageImagesResult";
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
  stageCount: number;
  stageImages: string[];
  players: { playerId: string; name: string; joinedAtMs: number }[];
  results: PlayerResult[];
  doneCount: number;
};

export function AdminRoomClient({ roomId, keyFromUrl }: { roomId: string; keyFromUrl: string }) {
  const router = useRouter();
  const [adminKey, setAdminKey] = useState<string>("");
  const [view, setView] = useState<AdminRoomView | null>(null);
  const [error, setError] = useState<string>("");
  const [durationSec, setDurationSec] = useState<number>(60);
  const [busy, setBusy] = useState(false);
  const { toasts, push } = useToasts();
  const [finalEntries, setFinalEntries] = useState<PublicLeaderboardEntry[] | null>(null);

  const joinUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/join/${roomId}`;
  }, [roomId]);

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
    let prevResultKeys = new Set<string>();

    async function tick() {
      const next = await fetchJson<AdminRoomView>(`/api/rooms/${roomId}?adminKey=${encodeURIComponent(adminKey)}`);
      if (cancelled) return;
      setView(next);
      setDurationSec(next.durationSec);
      setError("");

      const nextPlayerIds = new Set(next.players.map((p) => p.playerId));
      for (const p of next.players) {
        if (!prevPlayerIds.has(p.playerId)) {
          push({ title: "Có người mới tham gia", body: p.name, tone: "info", ttlMs: 2200 });
        }
      }
      prevPlayerIds = nextPlayerIds;

      const nextResultKeys = new Set(next.results.map((r) => `${r.playerId}:${r.result.type}:${r.result.stageIndex}`));
      for (const r of next.results) {
        const key = `${r.playerId}:${r.result.type}:${r.result.stageIndex}`;
        if (prevResultKeys.has(key)) continue;

        const isFinalPuzzleStage = r.result.type === "image-puzzle" && r.result.stageIndex === 1;
        push({
          title: isFinalPuzzleStage ? "Có người vừa hoàn thành!" : "Có người vừa nộp kết quả",
          body: r.name,
          tone: "good",
          ttlMs: 2400
        });
      }
      prevResultKeys = nextResultKeys;
    }

    tick().catch((e) => setError(e instanceof Error ? e.message : String(e)));
    const id = setInterval(() => tick().catch(() => {}), 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [adminKey, push, roomId]);

  useEffect(() => {
    if (!view) return;
    if (view.status !== "ended") {
      setFinalEntries(null);
      return;
    }
    let cancelled = false;
    fetchJson<{ entries: PublicLeaderboardEntry[] }>(`/api/rooms/${roomId}/leaderboard`)
      .then((res) => {
        if (cancelled) return;
        setFinalEntries(res.entries);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [roomId, view?.status]);

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
        body: JSON.stringify({ adminKey, durationSec })
      });
      push({ title: "Đã lưu cài đặt", tone: "good", ttlMs: 1800 });
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
      push({ title: "Đã bắt đầu", tone: "good", ttlMs: 2000 });
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
      push({ title: "Đã quay về phòng chờ", tone: "good", ttlMs: 2200 });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onCloseRoom() {
    if (!adminKey) return;
    if (!confirm("Đóng phòng và mời tất cả người chơi thoát?")) return;
    setBusy(true);
    try {
      await fetchJson(`/api/rooms/${roomId}/close`, {
        method: "POST",
        body: JSON.stringify({ adminKey })
      });
      localStorage.removeItem(`admin:${roomId}`);
      router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

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
    view?.status === "lobby"
      ? "Chờ"
      : view?.status === "running"
        ? "Đang chơi"
        : view?.status === "ended"
          ? "Kết thúc"
          : "";

  const playerCount = view?.players.length ?? 0;
  const doneCount = view && Number.isFinite(view.doneCount) ? view.doneCount : 0;
  const submittedAny = view ? new Set(view.results.map((r) => r.playerId)).size : 0;

  const safeStageCount = view && Number.isFinite(view.stageCount) && view.stageCount > 0 ? view.stageCount : 1;
  const totalDurationSec = view ? Math.max(1, Number(view.durationSec) * safeStageCount) : 1;

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
              <div className="row" style={{ gap: 10 }}>
                <Countdown endsAtMs={view.endsAtMs} serverNowMs={view.serverNowMs} />
                <button className="btn" disabled={busy} onClick={onCloseRoom}>
                  Đóng phòng
                </button>
              </div>
            </div>

            {view.status !== "lobby" ? (
              <HeroTimer
                serverNowMs={view.serverNowMs}
                startedAtMs={view.startedAtMs}
                endsAtMs={view.endsAtMs}
                durationSec={totalDurationSec}
              />
            ) : null}

            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="pill">
                Người chơi <span className="mono">{playerCount}</span>
              </span>
              {view.status === "running" ? (
                <span className="pill">
                  Đã xong <span className="mono">{doneCount}</span>/<span className="mono">{playerCount}</span>
                </span>
              ) : (
                <span className="pill">
                  Đã nộp <span className="mono">{submittedAny}</span>
                </span>
              )}
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
              subtitle="Người chơi tham gia bằng link hoặc QR bên dưới."
              variant="focus"
            />
          </section>

          <section className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
            <div className="card">
              <div className="grid" style={{ gap: 12 }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <div className="grid" style={{ gap: 2 }}>
                    <div style={{ fontWeight: 800 }}>Tham gia</div>
                    <div className="subtitle mono" style={{ wordBreak: "break-all" }}>
                      {joinUrl || "Đang tải..."}
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
                    <label className="label">Thời gian mỗi ảnh (giây)</label>
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

                <div className="row">
                  <button className="btn" disabled={busy} onClick={onConfigure}>
                    Lưu cài đặt
                  </button>
                  <button className="btn btnPrimary" disabled={busy} onClick={onStart}>
                    Bắt đầu
                  </button>
                  <span className="pill">QR/link sẽ ẩn sau khi bắt đầu</span>
                </div>
              </div>
            </div>
          </section>
        </>
      ) : null}

      {view?.status === "running" ? (
        <section className="card">
          <div className="grid" style={{ gap: 12 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div style={{ fontWeight: 900, fontSize: 18 }}>Đang chơi</div>
              <button className="btn" disabled={busy} onClick={onEnd}>
                Kết thúc ngay
              </button>
            </div>
            <div className="subtitle">
              Game sẽ tự kết thúc khi tất cả người chơi hoàn thành (hoặc hết giờ). Bạn cũng có thể bấm “Kết thúc ngay”.
            </div>
          </div>
        </section>
      ) : null}

      {view?.status === "ended" ? (
        <section className="card">
          <div className="grid" style={{ gap: 12 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div style={{ fontWeight: 900, fontSize: 20, letterSpacing: "-0.02em" }}>Bảng xếp hạng</div>
              <div className="row" style={{ gap: 10 }}>
                <button className="btn btnPrimary" disabled={busy} onClick={onRestart}>
                  Chơi lại
                </button>
                <button className="btn" disabled={busy} onClick={onCloseRoom}>
                  Đóng phòng
                </button>
              </div>
            </div>
            {view.gameId === "image-puzzle" && view.stageImages.length >= 2 ? (
              <StageImagesResult
                title="Ảnh của 2 vòng"
                images={[
                  { url: view.stageImages[0]!, label: "Vòng 1" },
                  { url: view.stageImages[1]!, label: "Vòng 2" }
                ]}
              />
            ) : null}
            {finalEntries ? <PodiumBoard entries={finalEntries} /> : <div className="subtitle">Đang tải...</div>}
            <div className="subtitle">Bấm “Chơi lại” để quay về phòng chờ và bắt đầu lượt mới.</div>
          </div>
        </section>
      ) : null}
    </>
  );
}

