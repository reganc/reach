// Insights types — the analytics layer over the portfolio scan. Answers
// "what is each app for, when did it last run, and where has dev focus gone".

import type { StackLanguage } from "@/lib/projects/types"

/** Docker runtime info aggregated per project directory. */
export interface RuntimeInfo {
  /** ISO timestamp of the most recent container start for this app. */
  lastStartedAt: string | null
  runningContainers: number
  totalContainers: number
}

export interface AppInsight {
  slug: string
  displayName: string
  language: StackLanguage
  /** Best-effort one-liner from package.json/README (scan layer). */
  detectedDescription: string | null
  /** LLM-generated purpose summary (cached in ProjectInsight). */
  summary: string | null
  /** True when sources changed since the summary was generated (or none exists). */
  summaryStale: boolean
  lastCommitAt: string | null
  lastTouchedAt: string | null
  runtime: RuntimeInfo
  /**
   * Commits per week, aligned with InsightsPayload.weeks (index 0 = oldest).
   */
  weeklyCommits: number[]
  totalCommits: number
}

export interface InsightsPayload {
  /** ISO date (Monday) of each week bucket, oldest first. */
  weeks: string[]
  apps: AppInsight[]
  generatedAt: string
}
