import path from "path"

const SHELLS = new Set(["bash", "zsh", "fish", "sh", "dash", "tmux"])

/**
 * Short tab label for a tmux pane: "npm · reach" while a program runs,
 * just "reach" at an idle shell prompt, "~" in the home directory.
 */
export function describePane(command: string, cwd: string, home: string): string | undefined {
  const dir = !cwd ? "" : cwd === home ? "~" : path.basename(cwd)
  const cmd = command.trim()
  if (!cmd || SHELLS.has(cmd)) return dir || undefined
  return dir ? `${cmd} · ${dir}` : cmd
}
