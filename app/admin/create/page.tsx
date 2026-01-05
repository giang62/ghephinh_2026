import Link from "next/link";
import { AdminCreateClient } from "@/components/admin/AdminCreateClient";
import { GAMES } from "@/lib/games";

export default async function AdminCreatePage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const game = typeof sp.game === "string" ? sp.game : undefined;
  const initialGameId = GAMES.find((g) => g.id === game)?.id ?? "image-puzzle";

  return (
    <main className="container">
      <div className="grid" style={{ gap: 16 }}>
        <header className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <h1 className="title" style={{ marginBottom: 4 }}>
              Tạo phòng chơi
            </h1>
            <div className="subtitle">Bạn sẽ là quản trò (admin) của phòng.</div>
          </div>
          <Link className="btn" href="/">
            ← Danh sách game
          </Link>
        </header>

        <AdminCreateClient initialGameId={initialGameId} />
      </div>
    </main>
  );
}
