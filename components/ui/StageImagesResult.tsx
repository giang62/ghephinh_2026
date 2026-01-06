"use client";

export function StageImagesResult({
  title = "Ảnh của 2 vòng",
  images
}: {
  title?: string;
  images: { url: string; label: string }[];
}) {
  if (!images.length) return null;

  return (
    <div className="grid" style={{ gap: 10 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div style={{ fontWeight: 900, fontSize: 18, letterSpacing: "-0.02em" }}>{title}</div>
        <span className="pill">
          <span className="mono">{images.length}</span> ảnh
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12
        }}
      >
        {images.map((img) => (
          <div key={img.url} className="card" style={{ padding: 12, borderRadius: 18 }}>
            <div className="grid" style={{ gap: 10 }}>
              <div className="pill" style={{ width: "fit-content" }}>
                {img.label}
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt={img.label}
                src={img.url}
                style={{
                  width: "100%",
                  height: 180,
                  objectFit: "cover",
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.12)",
                  boxShadow: "0 18px 44px rgba(0,0,0,0.35)"
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

