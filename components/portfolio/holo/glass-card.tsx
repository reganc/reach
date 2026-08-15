"use client"

/**
 * Holo glass card — ported from the holo-shell design spec
 * (~/apps/.design-specs/reach/2026-07-10-command-deck/patterns/glass-card.tsx).
 *
 * Token contract: styles itself ONLY from the --holo-* CSS variables defined
 * in app/globals.css (.holo scope). Retheme there, never here.
 */

import type { CSSProperties, ReactNode } from "react"

export function GlassCard({
  title,
  hid,
  foot = "◈ SYNC",
  footRight = "⌾ LOCK",
  selected = false,
  children,
  className,
  style,
}: {
  title: string
  /** Small id/annotation shown top-right, e.g. "◆ PIN" */
  hid?: string
  /** Footer status, e.g. "◈ HEALTHY" */
  foot?: string
  /** Right footer slot, e.g. relative activity time */
  footRight?: ReactNode
  selected?: boolean
  children?: ReactNode
  className?: string
  style?: CSSProperties
}) {
  return (
    <div
      className={className}
      style={{
        padding: 14,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
        color: "#fff",
        background:
          "linear-gradient(135deg, rgba(255,255,255,.075), rgba(255,255,255,.015))",
        backdropFilter: "blur(7px)",
        WebkitBackdropFilter: "blur(7px)",
        border: selected
          ? "1px solid var(--holo-accent2)"
          : "1px solid color-mix(in srgb, var(--holo-accent) 40%, transparent)",
        boxShadow: selected
          ? "0 12px 40px rgba(0,0,0,.55), 0 0 30px var(--holo-accent), inset 0 0 26px color-mix(in srgb, var(--holo-accent) 16%, transparent)"
          : "0 12px 40px rgba(0,0,0,.55), 0 0 26px color-mix(in srgb, var(--holo-accent) 10%, transparent), inset 0 0 24px color-mix(in srgb, var(--holo-accent) 6%, transparent)",
        clipPath: "polygon(0 0, calc(100% - 15px) 0, 100% 15px, 100% 100%, 0 100%)",
        ...style,
      }}
    >
      {/* corner ticks */}
      <div
        style={{
          position: "absolute",
          top: 5,
          left: 5,
          width: 9,
          height: 9,
          borderTop: "1px solid var(--holo-accent)",
          borderLeft: "1px solid var(--holo-accent)",
          opacity: 0.7,
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 5,
          right: 5,
          width: 9,
          height: 9,
          borderBottom: "1px solid var(--holo-accent)",
          borderRight: "1px solid var(--holo-accent)",
          opacity: 0.7,
        }}
      />
      {/* header */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
          <span
            style={{
              font: "700 11px var(--holo-display)",
              letterSpacing: "1.4px",
              color: "var(--holo-accent2)",
              textTransform: "uppercase",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {title}
          </span>
          {hid && (
            <span
              style={{
                font: "600 8px var(--holo-font)",
                letterSpacing: ".5px",
                color: "color-mix(in srgb, var(--holo-accent) 60%, transparent)",
                whiteSpace: "nowrap",
              }}
            >
              {hid}
            </span>
          )}
        </div>
        <div
          style={{
            height: 1,
            marginTop: 7,
            background:
              "linear-gradient(90deg, color-mix(in srgb, var(--holo-accent) 60%, transparent), transparent)",
          }}
        />
      </div>
      {/* body */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, marginTop: 10, minHeight: 0 }}>
        {children}
      </div>
      {/* footer */}
      <div
        style={{
          marginTop: 10,
          paddingTop: 8,
          borderTop: "1px solid color-mix(in srgb, var(--holo-accent) 12%, transparent)",
          display: "flex",
          justifyContent: "space-between",
          gap: 8,
          font: "600 8px var(--holo-font)",
          letterSpacing: ".5px",
          color: "color-mix(in srgb, var(--holo-accent) 55%, transparent)",
        }}
      >
        <span>{foot}</span>
        <span>{footRight}</span>
      </div>
    </div>
  )
}

/* ---------- body building blocks (composable card content) ---------- */

export function StatBar({ label, value, pct }: { label: string; value: string; pct: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          font: "600 8px var(--holo-font)",
          letterSpacing: ".5px",
          color: "rgba(255,255,255,.45)",
        }}
      >
        <span>{label}</span>
        <span style={{ color: "var(--holo-accent2)" }}>{value}</span>
      </div>
      <div
        style={{
          height: 4,
          background: "color-mix(in srgb, var(--holo-accent) 12%, transparent)",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${Math.max(0, Math.min(100, pct))}%`,
            background:
              "linear-gradient(90deg, color-mix(in srgb, var(--holo-accent) 50%, transparent), var(--holo-accent))",
            boxShadow: "0 0 6px var(--holo-accent)",
            borderRadius: 2,
            transition: "width var(--holo-card-ms) var(--holo-card-ease)",
          }}
        />
      </div>
    </div>
  )
}

export function Placeholder({ label }: { label: string }) {
  return (
    <div
      style={{
        flex: 1,
        minHeight: 20,
        border: "1px solid color-mix(in srgb, var(--holo-accent) 20%, transparent)",
        background:
          "repeating-linear-gradient(45deg, color-mix(in srgb, var(--holo-accent) 6%, transparent) 0 6px, transparent 6px 12px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "6px 8px",
      }}
    >
      <span
        style={{
          font: "600 8px var(--holo-font)",
          letterSpacing: 1,
          color: "color-mix(in srgb, var(--holo-accent) 60%, transparent)",
        }}
      >
        {label}
      </span>
    </div>
  )
}
