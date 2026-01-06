"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetchJson } from "@/lib/client";
import { ImagePuzzleGame } from "@/components/games/ImagePuzzleGame";
import { ClickCounterGame } from "@/components/games/ClickCounterGame";
import { HeroTimer } from "@/components/ui/HeroTimer";
import { ToastStack, useToasts } from "@/components/ui/useToasts";
import { PlayerGrid } from "@/components/ui/PlayerGrid";
import { PodiumBoard } from "@/components/ui/PodiumBoard";
import type { PublicLeaderboardEntry } from "@/lib/roomStore";

type PlayerAuth = { playerId: string; token: string; name: string };

type PlayerStageView = {
  stageIndex: 0 | 1 | 2;
  stageStartedAtMs: number | null;
  stageEndsAtMs: number | null;
  imageUrl: string | null;
  submittedStages: number[];
};

type MeRoomView = {
  serverNowMs: number;
  roomId: string;
  gameId: "image-puzzle" | "click-counter";
  status: "lobby" | "running" | "ended";
  durationSec: number;
  startedAtMs: number | null;
  endsAtMs: number | null;
  remainingMs: number;
  stageCount: number;
  stageImages: string[];
  players: { playerId: string; name: string }[];
  me: PlayerStageView;
};

type LeaderboardResponse = {
  serverNowMs: number;
  roomId: string;
  gameId: "image-puzzle" | "click-counter";
  status: "lobby" | "running" | "ended";
  durationSec: number;
  startedAtMs: number | null;
  endsAtMs: number | null;
  remainingMs: number;
  stageCount: number;
  stageImages: string[];
  entries: PublicLeaderboardEntry[];
};

export default function PlayRoomPage() {
  const params = useParams<{ roomId: string }>();
  const router = useRouter();
  const roomId = params.roomId;

  const player = useMemo(() => {
    if (typeof window === "undefined") return null as PlayerAuth | null;
    const raw = localStorage.getItem(`player:${roomId}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as PlayerAuth;
    } catch {
      return null;
    }
  }, [roomId]);

  const [view, setView] = useState<MeRoomView | null>(null);
  const [error, setError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const { toasts, push } = useToasts();
  const [leaderboard, setLeaderboard] = useState<LeaderboardResponse | null>(null);
  const finishedToastRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!player) router.replace(`/join/${roomId}`);
  }, [player, roomId, router]);

  useEffect(() => {
    const p = player;
    if (!p) return;
    const playerId = p.playerId;
    const token = p.token;
    let cancelled = false;

    async function tick() {
      const next = await fetchJson<MeRoomView>(`/api/rooms/${roomId}/me`, {
        method: "POST",
        body: JSON.stringify({ playerId, token })
      });
      if (cancelled) return;
      setView(next);
      setError("");
    }

    tick().catch((e) => {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      if (msg.toLowerCase().includes("không tìm thấy phòng")) {
        localStorage.removeItem(`player:${roomId}`);
        router.replace(`/join/${roomId}`);
      }
    });

    const id = setInterval(() => tick().catch(() => {}), 750);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [player, roomId, router]);

  useEffect(() => {
    if (!view) return;
    if (view.status === "running") push({ title: "Bắt đầu!", body: "Chúc bạn chơi vui.", tone: "info", ttlMs: 2000 });
  }, [push, view?.startedAtMs, view?.status]);

  useEffect(() => {
    const v = view;
    if (!v) return;
    if (v.status === "lobby") return;
    const gameId = v.gameId;
    const stageCount = v.stageCount;
    let cancelled = false;

    function isFinishedEntry(entry: PublicLeaderboardEntry) {
      if (gameId === "click-counter") return entry.submitted;
      return entry.label.startsWith(`${stageCount}/${stageCount}`);
    }

    async function tick() {
      const next = await fetchJson<LeaderboardResponse>(`/api/rooms/${roomId}/leaderboard`);
      if (cancelled) return;

      const finishedNow = new Set(next.entries.filter(isFinishedEntry).map((e) => e.playerId));
      for (const id of finishedNow) {
        if (finishedToastRef.current.has(id)) continue;
        finishedToastRef.current.add(id);
        if (player && id === player.playerId) continue;
        const who = next.entries.find((x) => x.playerId === id)?.name ?? "Một người chơi";
        push({ title: "Có người vừa hoàn thành!", body: who, tone: "good", ttlMs: 2200 });
      }

      setLeaderboard(next);
    }

    tick().catch(() => {});
    const id = setInterval(() => tick().catch(() => {}), 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [player, push, roomId, view]);

  const submittedStages = view?.me.submittedStages ?? [];
  const meInPlayers = player && view?.players.some((p) => p.playerId === player.playerId);

  async function submitResult(
    result:
      | { type: "image-puzzle"; stageIndex: number; solved: true; completedMs: number }
      | { type: "click-counter"; stageIndex: number; score: number }
  ) {
    if (!player) return;
    if (submittedStages.includes(result.stageIndex)) return;
    setSubmitError("");
    try {
      await fetchJson(`/api/rooms/${roomId}/result`, {
        method: "POST",
        body: JSON.stringify({ playerId: player.playerId, token: player.token, result })
      });
      push({ title: "Đã nộp!", body: "Kết quả đã được ghi nhận.", tone: "good", ttlMs: 1800 });
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    }
  }

  const overlay = useMemo(() => {
    if (!view || view.status !== "running") return null;
    if (view.gameId === "click-counter") {
      if (submittedStages.includes(0)) return { title: "Bạn đã nộp điểm!", body: "Đang chờ kết quả..." };
      return null;
    }

    if (submittedStages.includes(1)) return { title: "Bạn đã hoàn thành!", body: "Đang chờ kết quả..." };
    if (submittedStages.includes(0) && view.me.stageIndex === 0) return { title: "Tuyệt!", body: "Đang chuyển sang ảnh tiếp theo..." };
    if (view.me.stageIndex === 2) return { title: "Hết giờ!", body: "Đang chờ kết quả..." };
    return null;
  }, [submittedStages, view]);

  return (
    <main className="container">
      <div className="grid" style={{ gap: 16 }}>
        <ToastStack toasts={toasts} />
        <header className="row" style={{ justifyContent: "space-between" }}>
          <div className="grid" style={{ gap: 6 }}>
            <div className="row">
              <h1 className="title" style={{ margin: 0 }}>
                Phòng <span className="mono">{roomId}</span>
              </h1>
              {view ? (
                <span className="pill">
                  Trạng thái{" "}
                  <span className="mono">{view.status === "lobby" ? "Chờ" : view.status === "running" ? "Đang chơi" : "Kết thúc"}</span>
                </span>
              ) : null}
            </div>
            <div className="subtitle">Chơi game từ thiết bị của bạn.</div>
          </div>
          <Link className="btn" href="/">
            Danh sách game
          </Link>
        </header>

        {error ? (
          <section className="card">
            <div className="pill" style={{ color: "var(--bad)" }}>
              {error}
            </div>
          </section>
        ) : null}

        {player && view && !meInPlayers ? (
          <section className="card">
            <div className="pill" style={{ color: "var(--warn)" }}>
              Phiên người chơi của bạn không còn trong phòng. Vui lòng tham gia lại.
            </div>
          </section>
        ) : null}

        {submitError ? (
          <section className="card">
            <div className="pill" style={{ color: "var(--bad)" }}>
              Nộp kết quả thất bại: {submitError}
            </div>
          </section>
        ) : null}

        <section className="card">
          <div className="grid" style={{ gap: 14, position: "relative" }}>
            {view && view.status === "running" ? (
              <HeroTimer
                serverNowMs={view.serverNowMs}
                startedAtMs={view.me.stageStartedAtMs}
                endsAtMs={view.me.stageEndsAtMs}
                durationSec={view.durationSec}
              />
            ) : null}

            {!view || view.status === "lobby" ? (
              <div className="grid" style={{ gap: 14 }}>
                <div className="row" style={{ justifyContent: "center" }}>
                    <span className="pill" style={{ fontWeight: 900, fontSize: 16 }}>
                    Đang chờ quản trò bắt đầu...
                  </span>
                </div>
                <PlayerGrid
                  players={view?.players ?? []}
                  title="Người chơi trong phòng"
                  subtitle="Khi quản trò bấm Bắt đầu, game sẽ chạy ngay trên máy bạn."
                  variant="focus"
                />
              </div>
            ) : view.status === "ended" ? (
              <div className="grid" style={{ gap: 10, placeItems: "center", padding: "6px 0" }}>
                <div className="pill" style={{ fontWeight: 900, fontSize: 16 }}>
                  Trò chơi đã kết thúc
                </div>
                <div className="subtitle">Xem bảng xếp hạng bên dưới.</div>
              </div>
            ) : view.gameId === "image-puzzle" ? (
              <ImagePuzzleGame
                key={`image-puzzle:${view.startedAtMs ?? "na"}:${view.me.stageIndex}`}
                room={{
                  serverNowMs: view.serverNowMs,
                  roomId: view.roomId,
                  gameId: "image-puzzle",
                  status: "running",
                  startedAtMs: view.startedAtMs,
                  stageIndex: view.me.stageIndex,
                  stageStartedAtMs: view.me.stageStartedAtMs,
                  stageEndsAtMs: view.me.stageEndsAtMs,
                  imageUrl: view.me.imageUrl
                }}
                onSubmit={submitResult}
                disabled={
                  view.me.stageIndex === 2 ||
                  submittedStages.includes(view.me.stageIndex)
                }
              />
            ) : (
              <ClickCounterGame
                key={`click-counter:${view.startedAtMs ?? "na"}`}
                room={{
                  serverNowMs: view.serverNowMs,
                  roomId: view.roomId,
                  gameId: "click-counter",
                  status: "running",
                  startedAtMs: view.startedAtMs,
                  endsAtMs: view.endsAtMs
                }}
                onSubmit={submitResult}
                disabled={submittedStages.includes(0)}
              />
            )}

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
          </div>
        </section>

        {leaderboard && view?.status === "ended" ? (
          <section className="card">
            <div className="grid" style={{ gap: 10 }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div style={{ fontWeight: 900, fontSize: 20, letterSpacing: "-0.02em" }}>Kết quả</div>
                <span className="pill">
                  Đã có <span className="mono">{leaderboard.entries.filter((e) => e.submitted).length}</span>/
                  <span className="mono">{leaderboard.entries.length}</span>
                </span>
              </div>

              <PodiumBoard entries={leaderboard.entries} />
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="subtitle">{submittedStages.length ? "Bạn đã nộp kết quả." : "Bạn chưa nộp kết quả."}</span>
                <Link className="btn" href="/">
                  Chơi game khác
                </Link>
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
