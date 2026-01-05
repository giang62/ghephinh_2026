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

type PublicRoomView = {
  serverNowMs: number;
  roomId: string;
  gameId: "image-puzzle" | "click-counter";
  status: "lobby" | "running" | "ended";
  durationSec: number;
  startedAtMs: number | null;
  stageIndex: number;
  stageCount: number;
  stageStartedAtMs: number | null;
  endsAtMs: number | null;
  remainingMs: number;
  imageUrl: string | null;
  players: { playerId: string; name: string }[];
};

type PlayerAuth = { playerId: string; token: string; name: string };
type LeaderboardResponse = {
  serverNowMs: number;
  roomId: string;
  gameId: "image-puzzle" | "click-counter";
  status: "lobby" | "running" | "ended";
  durationSec: number;
  startedAtMs: number | null;
  stageIndex: number;
  stageCount: number;
  stageStartedAtMs: number | null;
  endsAtMs: number | null;
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

  const [view, setView] = useState<PublicRoomView | null>(null);
  const [error, setError] = useState("");
  const [submittedStages, setSubmittedStages] = useState<number[]>([]);
  const [submitError, setSubmitError] = useState("");
  const { toasts, push } = useToasts();
  const [leaderboard, setLeaderboard] = useState<LeaderboardResponse | null>(null);
  const submittedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!player) router.replace(`/join/${roomId}`);
  }, [player, roomId, router]);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      const next = await fetchJson<PublicRoomView>(`/api/rooms/${roomId}`);
      if (cancelled) return;
      setView(next);
      setError("");
    }
    tick().catch((e) => setError(e instanceof Error ? e.message : String(e)));
    const id = setInterval(() => tick().catch(() => {}), 750);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [roomId]);

  useEffect(() => {
    if (!view) return;
    if (view.status === "running") push({ title: "Bắt đầu", body: "Chúc bạn chơi vui.", tone: "info", ttlMs: 2000 });
  }, [push, view?.startedAtMs, view?.status]);

  useEffect(() => {
    if (!view) return;
    if (view.status === "lobby") return;
    let cancelled = false;

    async function tick() {
      const next = await fetchJson<LeaderboardResponse>(`/api/rooms/${roomId}/leaderboard`);
      if (cancelled) return;

      const newlySubmitted = new Set<string>();
      for (const e of next.entries) if (e.submitted) newlySubmitted.add(e.playerId);

      for (const id of newlySubmitted) {
        if (!submittedRef.current.has(id)) {
          const who = next.entries.find((x) => x.playerId === id)?.name ?? "Ai đó";
          if (!player || id !== player.playerId) {
            push({ title: "Có người vừa hoàn thành", body: who, tone: "good", ttlMs: 2200 });
          }
        }
      }

      submittedRef.current = newlySubmitted;
      setLeaderboard(next);
    }

    tick().catch(() => {});
    const id = setInterval(() => tick().catch(() => {}), 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [player?.playerId, push, roomId, view?.status]);

  useEffect(() => {
    if (!view?.startedAtMs) return;
    setSubmittedStages([]);
  }, [view?.startedAtMs]);

  async function submitResult(result: { type: string; stageIndex: number; [k: string]: unknown }) {
    if (!player) return;
    if (submittedStages.includes(result.stageIndex)) return;
    setSubmitError("");
    try {
      await fetchJson(`/api/rooms/${roomId}/result`, {
        method: "POST",
        body: JSON.stringify({ playerId: player.playerId, token: player.token, result })
      });
      setSubmittedStages((prev) => (prev.includes(result.stageIndex) ? prev : [...prev, result.stageIndex]));
      push({ title: "Đã nộp kết quả", tone: "good", ttlMs: 2400 });
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
      push({
        title: "Nộp kết quả thất bại",
        body: e instanceof Error ? e.message : String(e),
        tone: "bad",
        ttlMs: 2800
      });
    }
  }

  const meInPlayers = useMemo(() => {
    if (!view || !player) return false;
    return view.players.some((p) => p.playerId === player.playerId);
  }, [player, view]);

  return (
    <main className="container">
      <ToastStack toasts={toasts} />
      <div className="grid" style={{ gap: 16 }}>
        <header className="row" style={{ justifyContent: "space-between" }}>
          <div className="grid" style={{ gap: 6 }}>
            <div className="row">
              <h1 className="title" style={{ margin: 0 }}>
                Chơi · Phòng <span className="mono">{roomId}</span>
              </h1>
            </div>
            <div className="subtitle">
              Người chơi <span className="mono">{player?.name ?? "…"}</span>
              {view ? (
                <>
                  {" "}
                  · Game <span className="mono">{view.gameId === "image-puzzle" ? "Ghép hình" : "Đếm lượt bấm"}</span> ·{" "}
                  Trạng thái{" "}
                  <span className="mono">
                    {view.status === "lobby" ? "Chờ" : view.status === "running" ? "Đang chơi" : "Kết thúc"}
                  </span>
                </>
              ) : null}
            </div>
          </div>
          <Link className="btn" href={`/join/${roomId}`}>
            Thông tin phòng
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
            {view ? (
              <HeroTimer
                serverNowMs={view.serverNowMs}
                startedAtMs={view.stageStartedAtMs}
                endsAtMs={view.endsAtMs}
                durationSec={view.durationSec}
              />
            ) : null}

            {view?.status === "running" && view.gameId === "image-puzzle" ? (
              <div className="row" style={{ justifyContent: "center" }}>
                <span className="pill">
                  Màn <span className="mono">{view.stageIndex + 1}</span>/<span className="mono">{view.stageCount}</span>
                </span>
              </div>
            ) : null}

            {!view || view.status === "lobby" ? (
              <div className="grid" style={{ gap: 10 }}>
                <div style={{ fontWeight: 700 }}>Đang chờ quản trò bắt đầu…</div>
                <div className="subtitle">Giữ tab này mở. Game sẽ hiện tự động khi bắt đầu.</div>
                <div className="divider" />
                <PlayerGrid
                  players={view?.players ?? []}
                  title="Người chơi đang chờ"
                  subtitle="Khi quản trò bấm Bắt đầu, game sẽ chạy ngay."
                />
              </div>
            ) : view.gameId === "image-puzzle" ? (
              <ImagePuzzleGame
                key={`image-puzzle:${view.startedAtMs ?? "na"}:${view.stageIndex}`}
                room={view as PublicRoomView & { gameId: "image-puzzle"; status: "running" | "ended" }}
                onSubmit={submitResult}
                disabled={view.status !== "running" || submittedStages.includes(view.stageIndex)}
              />
            ) : (
              <ClickCounterGame
                key={`click-counter:${view.startedAtMs ?? "na"}`}
                room={view as PublicRoomView & { gameId: "click-counter"; status: "running" | "ended" }}
                onSubmit={submitResult}
                disabled={view.status !== "running" || submittedStages.includes(0)}
              />
            )}

            {view?.status === "running" && view && submittedStages.includes(view.stageIndex) ? (
              <div className="overlay">
                <div className="overlayCard">
                  <h3 className="bigTitle">Bạn đã nộp!</h3>
                  <div className="subtitle" style={{ marginTop: 6 }}>
                    Đang chờ chuyển màn / chờ người chơi khác… (hết giờ sẽ tự chuyển)
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
                <div style={{ fontWeight: 900, fontSize: 20, letterSpacing: "-0.02em" }}>Kết quả cuối</div>
                <span className="pill">
                  Đã nộp <span className="mono">{leaderboard.entries.filter((e) => e.submitted).length}</span>/
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
