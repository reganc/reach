/**
 * Recognise the mouse reports xterm.js sends while tmux has mouse mode on,
 * in SGR (1006) or legacy X10 encoding. Wheel-up is button 64
 * (`ESC[<64;x;yM`, or X10 byte 0x60 = "`").
 */
const WHEEL_UP_RE = /^(?:\x1b\[<64;\d+;\d+M|\x1b\[M`[\s\S]{2})+$/
const MOUSE_REPORT_RE = /^(?:\x1b\[<\d+;\d+;\d+[Mm]|\x1b\[M[\s\S]{3})+$/

/** True when `data` is nothing but wheel-up reports. */
export const isWheelUp = (data: string): boolean => WHEEL_UP_RE.test(data)

/** True when `data` is nothing but mouse reports (clicks, drags, wheel). */
export const isMouseReport = (data: string): boolean => MOUSE_REPORT_RE.test(data)
