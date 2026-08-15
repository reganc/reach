// Shared between client and server — keep free of `server-only` imports.

export interface FileRootInfo {
  id: string
  label: string
  /** Absolute path on the server, shown to the admin for orientation. */
  path: string
  /** Whether uploads / mkdir / delete are permitted in this root. */
  writable: boolean
  /** Whether the directory currently exists on disk. */
  exists: boolean
}

export interface DirEntry {
  name: string
  type: "file" | "dir"
  /** Size in bytes (0 for directories). */
  size: number
  /** Last-modified time in epoch milliseconds. */
  mtimeMs: number
  /** True if the entry is a symbolic link. */
  symlink: boolean
}

export interface ListResponse {
  rootId: string
  /** Directory path relative to the root ("" === root itself). */
  path: string
  entries: DirEntry[]
}

export interface UploadResult {
  /** Final on-disk name (may differ from the requested name after de-duping). */
  name: string
  size: number
  /** Path of the written file relative to its root. */
  path: string
}
