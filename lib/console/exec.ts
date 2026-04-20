import { spawn } from "node:child_process"

export interface ExecResult {
  stdout: string
  stderr: string
  code: number
  timedOut: boolean
}

export function runCommand(
  cmd: string,
  args: string[],
  opts: { timeoutMs?: number; cwd?: string; input?: string } = {},
): Promise<ExecResult> {
  const { timeoutMs = 15000, cwd, input } = opts
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { cwd, env: process.env })
    let stdout = ""
    let stderr = ""
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      try {
        proc.kill("SIGKILL")
      } catch {}
    }, timeoutMs)
    proc.stdout.on("data", (d) => {
      stdout += d.toString()
    })
    proc.stderr.on("data", (d) => {
      stderr += d.toString()
    })
    proc.on("error", (err) => {
      clearTimeout(timer)
      resolve({ stdout, stderr: stderr || String(err), code: -1, timedOut })
    })
    proc.on("close", (code) => {
      clearTimeout(timer)
      resolve({ stdout, stderr, code: code ?? -1, timedOut })
    })
    if (input) {
      proc.stdin.end(input)
    } else {
      proc.stdin.end()
    }
  })
}
