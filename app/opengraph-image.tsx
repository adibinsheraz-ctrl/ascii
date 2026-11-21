import { ImageResponse } from "next/og";

export const alt = "ASCII — live camera to print-sharp type";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: "#0a0a0a",
          padding: 72,
          color: "#ece8df",
        }}
      >
        <div style={{ fontSize: 22, letterSpacing: 8, color: "#7cffb2" }}>ON DEVICE</div>
        <div style={{ fontSize: 160, lineHeight: 0.9, letterSpacing: -8, marginTop: 12 }}>ASCII</div>
        <div style={{ fontSize: 28, marginTop: 24, color: "rgba(236,232,223,0.65)" }}>
          Print-sharp type from a camera or a photo
        </div>
      </div>
    ),
    { ...size },
  );
}
