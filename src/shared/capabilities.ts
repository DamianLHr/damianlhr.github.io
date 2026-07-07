// Device capability probe — feeds the theme resolver (TECHNOLOGY.md §3.3).

export interface Capabilities {
  webgpu: boolean
  webgl2: boolean
  reducedMotion: boolean
  saveData: boolean
  deviceMemoryGB: number | null
  finePointer: boolean
}

interface NavigatorProbe extends Navigator {
  deviceMemory?: number
  connection?: { saveData?: boolean }
}

export async function probeCapabilities(): Promise<Capabilities> {
  const nav = navigator as NavigatorProbe

  let webgpu = false
  try {
    // navigator.gpu is typed by lib.dom but undefined at runtime in older browsers
    webgpu = navigator.gpu ? (await navigator.gpu.requestAdapter()) !== null : false
  } catch {
    webgpu = false
  }

  let webgl2 = false
  try {
    webgl2 = document.createElement('canvas').getContext('webgl2') !== null
  } catch {
    webgl2 = false
  }

  return {
    webgpu,
    webgl2,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    saveData: nav.connection?.saveData === true,
    deviceMemoryGB: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
    finePointer: window.matchMedia('(pointer: fine)').matches,
  }
}
