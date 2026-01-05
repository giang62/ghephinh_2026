import Link from "next/link";
import { GAMES } from "@/lib/games";

export default function HomePage() {
  return (
    <main className="container">
      <div className="grid" style={{ gap: 20 }}>
        <header className="grid" style={{ gap: 6 }}>
          <h1 className="title">Trò chơi mini</h1>
          <p className="subtitle">
            Chọn game, tạo phòng, người chơi tham gia bằng link hoặc QR.
          </p>
        </header>

        <section className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
          {GAMES.map((game) => (
            <Link
              key={game.id}
              href={`/admin/create?game=${encodeURIComponent(game.id)}`}
              className="card"
            >
              <div className="grid" style={{ gap: 10 }}>
                <div className="grid" style={{ gap: 4 }}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <h2 style={{ margin: 0, fontSize: 18 }}>{game.name}</h2>
                  </div>
                  <div className="subtitle">{game.description}</div>
                </div>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span className="pill">{game.adminHint}</span>
                  <span className="pill">Tạo phòng →</span>
                </div>
              </div>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
