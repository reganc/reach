/**
 * Browser clipboard helpers for the console terminal.
 *
 * The terminal runs inside tmux with mouse mode on, which puts three different
 * clipboard mechanisms in play — tmux copy-mode (delivered to us as OSC 52),
 * xterm.js's own selection (Shift+drag), and the browser's paste event — and
 * each has its own permission rules. Everything here reports success so the UI
 * can tell the user what happened instead of failing silently.
 */

export const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform)

/**
 * Copy to the system clipboard, falling back to execCommand where the async
 * API is unavailable or refuses (non-secure context, or Firefox rejecting a
 * write with no user activation behind it).
 */
export async function copyText(text: string): Promise<boolean> {
  if (!text) return false
  try {
    if (window.isSecureContext && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through to legacy path */
  }
  // The legacy path has to put a real, selected textarea in the document to
  // copy from, which moves focus off the terminal. tmux emits OSC 52 on every
  // copy-mode selection, so this can run with no user activation behind it —
  // restore the previous element synchronously, before yielding, or the next
  // keystroke goes to a removed textarea.
  const previous = document.activeElement as HTMLElement | null
  const ta = document.createElement("textarea")
  ta.value = text
  ta.setAttribute("readonly", "")
  ta.style.position = "fixed"
  ta.style.opacity = "0"
  document.body.appendChild(ta)
  ta.select()
  let ok = false
  try {
    ok = document.execCommand("copy")
  } catch {
    ok = false
  }
  ta.remove()
  previous?.focus?.()
  return ok
}

/**
 * Read the system clipboard. Only used by the explicit paste affordances
 * (toolbar button, right-click, middle-click): Chrome gates reads behind a
 * permission prompt, so a null here is a routine denial, not a bug. The
 * keyboard shortcuts never come through here — they use the browser's native
 * paste event, which needs no permission at all.
 */
export async function readClipboard(): Promise<string | null> {
  try {
    if (!window.isSecureContext || !navigator.clipboard?.readText) return null
    return await navigator.clipboard.readText()
  } catch {
    return null
  }
}

/** Decode an OSC 52 payload (`<selection>;<base64>`). Null for reads/garbage. */
export function decodeOsc52(data: string): string | null {
  const idx = data.indexOf(";")
  const b64 = idx === -1 ? data : data.slice(idx + 1)
  if (!b64 || b64 === "?") return null // clipboard *reads* are not supported
  try {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch {
    return null
  }
}

/** "Copied 42 characters" / "Copied 3 lines". */
export function describeCopy(text: string): string {
  const lines = text.split("\n").length
  if (lines > 1) return `Copied ${lines} lines`
  return `Copied ${text.length} character${text.length === 1 ? "" : "s"}`
}

export type ClipboardAction = "copy" | "paste" | null

/**
 * Classify a keydown into the terminal's clipboard shortcuts.
 *
 *  - copy:  Ctrl+Shift+C always; Ctrl+C / ⌘C only while text is selected, so
 *           with no selection Ctrl+C still reaches the shell as SIGINT.
 *  - paste: Ctrl+V and Ctrl+Shift+V (⌘V already works natively on macOS).
 *
 * Paste is deliberately *not* performed here: the caller lets the keydown
 * through to the browser so it fires a native paste event on xterm's textarea.
 * xterm.js would otherwise translate Ctrl+V into the ^V control byte and
 * preventDefault it, which is why the shortcut used to do nothing.
 */
export function clipboardActionFor(
  e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">,
  hasSelection: boolean,
  mac: boolean = isMac,
): ClipboardAction {
  if (e.altKey) return null
  const key = e.key.toLowerCase()
  const primary = mac ? e.metaKey : e.ctrlKey
  if (key === "c") {
    if (e.ctrlKey && e.shiftKey) return "copy"
    if (primary && hasSelection) return "copy"
    return null
  }
  if (key === "v" && !mac && e.ctrlKey && !e.metaKey) return "paste"
  return null
}
