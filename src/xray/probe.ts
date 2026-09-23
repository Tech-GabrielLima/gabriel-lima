// What the X-ray measured this instant, written by XrayStage (inside the
// canvas) and read by XrayUI (the captions). A plain object: nothing here
// re-renders React, the captions poll it a few times a second.

export const probe = {
  // pixel
  width: 0,
  height: 0,
  dpr: 1,
  fps: 0,
  /** The pixel under the cursor, as drawn (after the film pass), and where it is. */
  rgb: [0, 0, 0] as [number, number, number],
  px: [0, 0] as [number, number],
  // geometry
  calls: 0,
  triangles: 0,
  lines: 0,
  points: 0,
  geometries: 0,
  textures: 0,
  programs: 0,
  // shader: the light the visitor holds
  light: null as null | { type: string; intensity: number; color: string; x: number; y: number; z: number; angle?: number },
  time: 0,
  // silicon
  cpuMs: 0,
  gpuMs: 0,
  gpuSupported: false,
  gpuHistory: [] as number[],
  renderer: '',
  vendor: '',
  maxTexture: 0,
  cores: typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency ?? 0) : 0,
  // network
  packets: 0,
  packetRate: 0,
  bytesRate: 0,
  lastPacket: 0,
}
