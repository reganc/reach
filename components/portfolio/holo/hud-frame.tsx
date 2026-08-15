"use client"

/**
 * Holo HUD frame — ported from the holo-shell design spec
 * (~/apps/.design-specs/reach/2026-07-10-command-deck/patterns/hud-frame.tsx).
 * Fills its container (not the viewport); content scrolls inside the chrome.
 *
 * Token contract: styles itself ONLY from the --holo-* CSS variables defined
 * in app/globals.css (.holo scope). Retheme there, never here.
 */

import type { CSSProperties, ReactNode } from "react"

function CornerBracket({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  const s: CSSProperties = {
    position: "absolute",
    width: 36,
    height: 36,
    opacity: 0.55,
    pointerEvents: "none",
    zIndex: 40,
  }
  if (pos.includes("t")) {
    s.top = 14
    s.borderTop = "2px solid var(--holo-accent)"
  } else {
    s.bottom = 14
    s.borderBottom = "2px solid var(--holo-accent)"
  }
  if (pos.includes("l")) {
    s.left = 14
    s.borderLeft = "2px solid var(--holo-accent)"
  } else {
    s.right = 14
    s.borderRight = "2px solid var(--holo-accent)"
  }
  return <div style={s} />
}

export function HudFrame({
  title,
  subtitle,
  statusRight,
  watermark,
  children,
  className,
}: {
  /** Brand shown top-left, e.g. "◇ REACH" */
  title: string
  subtitle?: string
  /** Right slot of the status bar (counts, clock…) */
  statusRight?: ReactNode
  /** Giant faded glyph bottom-right */
  watermark?: string
  children?: ReactNode
  className?: string
}) {
  return (
    <div
      className={className}
      style={{
        position: "relative",
        overflow: "hidden",
        background:
          "radial-gradient(ellipse at 50% 18%, rgba(255,255,255,.04), transparent 55%), var(--holo-bg)",
        fontFamily: "var(--holo-font)",
        color: "#fff",
      }}
    >
      {/* perspective grid floor */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: "44%",
          overflow: "hidden",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: "-60% -50% -1px -50%",
            backgroundImage:
              "linear-gradient(var(--holo-accent) 1px, transparent 1px), linear-gradient(90deg, var(--holo-accent) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            opacity: 0.13,
            transform: "perspective(420px) rotateX(71deg)",
            transformOrigin: "bottom center",
            animation: "holo-gridmove 5s linear infinite",
            WebkitMaskImage: "linear-gradient(transparent, #000 65%)",
            maskImage: "linear-gradient(transparent, #000 65%)",
          }}
        />
      </div>

      {/* vignette + scanlines + traveling scan bar */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: "radial-gradient(circle at 50% 48%, transparent 52%, rgba(0,0,0,.6))",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          opacity: 0.4,
          backgroundImage:
            "repeating-linear-gradient(0deg, rgba(255,255,255,.045) 0 1px, transparent 1px 3px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          height: 120,
          pointerEvents: "none",
          background: "linear-gradient(var(--holo-accent), transparent)",
          opacity: 0.06,
          animation: "holo-scan 6.5s linear infinite",
          zIndex: 4,
        }}
      />

      {watermark && (
        <div
          style={{
            position: "absolute",
            right: 44,
            bottom: 52,
            font: "900 158px var(--holo-display)",
            letterSpacing: 8,
            color: "var(--holo-accent)",
            opacity: 0.045,
            pointerEvents: "none",
            zIndex: 2,
          }}
        >
          {watermark}
        </div>
      )}

      {/* content — scrolls inside the chrome */}
      <div style={{ position: "absolute", inset: 0, zIndex: 5 }}>{children}</div>

      <CornerBracket pos="tl" />
      <CornerBracket pos="tr" />
      <CornerBracket pos="bl" />
      <CornerBracket pos="br" />

      {/* top status bar */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 46,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 62px",
          pointerEvents: "none",
          zIndex: 45,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ font: "900 15px var(--holo-display)", letterSpacing: 3, color: "var(--holo-accent2)" }}>
            {title}
          </span>
          {subtitle && (
            <span style={{ fontSize: 10, letterSpacing: 2, color: "rgba(255,255,255,.4)" }}>{subtitle}</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: 10, letterSpacing: 1, color: "rgba(255,255,255,.5)" }}>
          {statusRight}
        </div>
      </div>
    </div>
  )
}
