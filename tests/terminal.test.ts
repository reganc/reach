import { test } from "node:test"
import assert from "node:assert/strict"
import { clipboardActionFor, decodeOsc52, describeCopy } from "../lib/terminal/clipboard"
import { isMouseReport, isWheelUp } from "../lib/terminal/mouse"
import { describePane } from "../lib/terminal/pane-title"

const key = (k: string, mods: Partial<Record<"ctrlKey" | "metaKey" | "shiftKey" | "altKey", boolean>> = {}) => ({
  key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods,
})

test("Ctrl+V and Ctrl+Shift+V paste on Linux/Windows", () => {
  assert.equal(clipboardActionFor(key("v", { ctrlKey: true }), false, false), "paste")
  assert.equal(clipboardActionFor(key("V", { ctrlKey: true, shiftKey: true }), false, false), "paste")
})

test("macOS leaves ⌘V to the browser and Ctrl+V to the shell", () => {
  assert.equal(clipboardActionFor(key("v", { metaKey: true }), false, true), null)
  assert.equal(clipboardActionFor(key("v", { ctrlKey: true }), false, true), null)
})

test("Ctrl+C is SIGINT without a selection, copy with one", () => {
  assert.equal(clipboardActionFor(key("c", { ctrlKey: true }), false, false), null)
  assert.equal(clipboardActionFor(key("c", { ctrlKey: true }), true, false), "copy")
  assert.equal(clipboardActionFor(key("c", { metaKey: true }), true, true), "copy")
})

test("Ctrl+Shift+C always copies (never a surprise SIGINT)", () => {
  assert.equal(clipboardActionFor(key("C", { ctrlKey: true, shiftKey: true }), false, false), "copy")
})

test("Alt combos and plain keys are left alone", () => {
  assert.equal(clipboardActionFor(key("v", { ctrlKey: true, altKey: true }), false, false), null)
  assert.equal(clipboardActionFor(key("v"), false, false), null)
  assert.equal(clipboardActionFor(key("c"), true, false), null)
})

test("decodeOsc52 handles tmux payloads, UTF-8, reads and garbage", () => {
  const b64 = Buffer.from("héllo\nworld").toString("base64")
  assert.equal(decodeOsc52(`c;${b64}`), "héllo\nworld")
  assert.equal(decodeOsc52(b64), "héllo\nworld")
  assert.equal(decodeOsc52("c;?"), null)
  assert.equal(decodeOsc52("c;"), null)
  assert.equal(decodeOsc52("c;!!!not base64"), null)
})

test("describeCopy", () => {
  assert.equal(describeCopy("x"), "Copied 1 character")
  assert.equal(describeCopy("hello"), "Copied 5 characters")
  assert.equal(describeCopy("a\nb\nc"), "Copied 3 lines")
})

test("wheel-up detection, SGR and X10", () => {
  assert.ok(isWheelUp("\x1b[<64;10;5M"))
  assert.ok(isWheelUp("\x1b[<64;10;5M\x1b[<64;10;5M"))
  assert.ok(isWheelUp("\x1b[M`!!"))
  assert.ok(!isWheelUp("\x1b[<65;10;5M")) // wheel down
  assert.ok(!isWheelUp("ls\r"))
})

test("mouse reports are distinguished from typing", () => {
  assert.ok(isMouseReport("\x1b[<0;3;4M\x1b[<0;3;4m"))
  assert.ok(isMouseReport("\x1b[<65;10;5M"))
  assert.ok(!isMouseReport("a"))
  assert.ok(!isMouseReport("\x1b[A")) // arrow key
  assert.ok(!isMouseReport("\x1b[<0;3;4Mls"))
})

test("describePane", () => {
  assert.equal(describePane("bash", "/home/u/apps/reach", "/home/u"), "reach")
  assert.equal(describePane("bash", "/home/u", "/home/u"), "~")
  assert.equal(describePane("npm", "/home/u/apps/reach", "/home/u"), "npm · reach")
  assert.equal(describePane("claude", "", "/home/u"), "claude")
  assert.equal(describePane("", "", "/home/u"), undefined)
})
