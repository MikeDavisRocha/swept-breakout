export const PAL = {
  bg: 0x0b0f14,
  wall: 0x1a232e,
  paddle: 0xdfe6ee,
  ball: 0xf5a524,
  trail: 0xf5a524,
  text: 0x8a97a8,
  textHi: 0xdfe6ee,
} as const;

/**
 * Bricks run cool at the bottom to warm at the top, so the rows worth the most
 * are the ones that read as hottest without a legend explaining it.
 */
export const BRICK_ROW = [
  0xff5c5c, 0xff8a5c, 0xf5a524, 0x9fd356, 0x3ddc97, 0x4aa3f5,
] as const;

/** A brick with hp left is drawn dimmer, which is the only damage cue needed. */
export const CRACKED_ALPHA = 0.45;
