import type { JuliaParams } from './fractal'

// WebGL2 Julia renderer — full-resolution 60fps morphing on any GPU-capable
// device. The CPU renderer in fractal.ts stays as the true floor fallback.
// Colors mirror the CPU ember palette exactly.
//
// The capability probe renders a tiny known frame on a throwaway canvas and
// verifies a pixel readback, because some environments (software GL, sandboxed
// webviews) compile shaders fine and then draw garbage. A failed WebGL init must
// never touch the real canvas: it would permanently block the 2D fallback context.

const VERT = `#version 300 es
void main() {
  vec2 p = vec2(-1.0, -1.0);
  if (gl_VertexID == 1) p = vec2(3.0, -1.0);
  if (gl_VertexID == 2) p = vec2(-1.0, 3.0);
  gl_Position = vec4(p, 0.0, 1.0);
}`

const FRAG = `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 uRes;
uniform vec2 uC;
uniform float uSpan;
uniform vec2 uCenter;
uniform float uAngle;
uniform int uMax;

vec3 pal(float v) {
  vec3 s0 = vec3(10.0, 11.0, 13.0);
  vec3 s1 = vec3(70.0, 12.0, 16.0);
  vec3 s2 = vec3(188.0, 38.0, 22.0);
  vec3 s3 = vec3(255.0, 106.0, 0.0);
  vec3 s4 = vec3(255.0, 178.0, 92.0);
  vec3 s5 = vec3(255.0, 236.0, 200.0);
  float t = clamp(v, 0.0, 0.999) * 5.0;
  vec3 c = mix(s0, s1, clamp(t, 0.0, 1.0));
  c = mix(c, s2, clamp(t - 1.0, 0.0, 1.0));
  c = mix(c, s3, clamp(t - 2.0, 0.0, 1.0));
  c = mix(c, s4, clamp(t - 3.0, 0.0, 1.0));
  c = mix(c, s5, clamp(t - 4.0, 0.0, 1.0));
  return c / 255.0;
}

void main() {
  float scale = uSpan / min(uRes.x, uRes.y);
  vec2 d = vec2(
    (gl_FragCoord.x - uCenter.x * uRes.x) * scale,
    ((uRes.y - gl_FragCoord.y) - uCenter.y * uRes.y) * scale
  );
  float ca = cos(uAngle);
  float sa = sin(uAngle);
  vec2 z = vec2(d.x * ca - d.y * sa, d.x * sa + d.y * ca);
  int iter = uMax;
  for (int k = 0; k < 300; k++) {
    if (k >= uMax) break;
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + uC;
    if (dot(z, z) > 16.0) { iter = k; break; }
  }
  vec3 color;
  if (iter >= uMax) {
    float v2 = clamp(dot(z, z), 0.0, 4.0);
    color = vec3(14.0 + v2 * 9.0, 8.0 + v2 * 3.0, 9.0 + v2 * 1.5) / 255.0;
  } else {
    float nu = float(iter) - log2(log2(dot(z, z)));
    color = pal(nu / float(uMax) * 2.2);
  }
  outColor = vec4(color, 1.0);
}`

export interface GlJulia {
  render: (params: JuliaParams) => void
  dispose: () => void
}

const CTX_OPTS: WebGLContextAttributes = {
  antialias: false,
  depth: false,
  stencil: false,
  powerPreference: 'low-power',
}

interface GlPipeline {
  gl: WebGL2RenderingContext
  draw: (params: JuliaParams, w: number, h: number) => void
}

function buildPipeline(gl: WebGL2RenderingContext): GlPipeline | null {
  const compile = (type: number, src: string) => {
    const shader = gl.createShader(type)
    if (!shader) return null
    gl.shaderSource(shader, src)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader)
      return null
    }
    return shader
  }
  const vs = compile(gl.VERTEX_SHADER, VERT)
  const fs = compile(gl.FRAGMENT_SHADER, FRAG)
  const program = gl.createProgram()
  if (!vs || !fs || !program) return null
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null
  gl.useProgram(program)
  const u = {
    res: gl.getUniformLocation(program, 'uRes'),
    c: gl.getUniformLocation(program, 'uC'),
    span: gl.getUniformLocation(program, 'uSpan'),
    center: gl.getUniformLocation(program, 'uCenter'),
    angle: gl.getUniformLocation(program, 'uAngle'),
    max: gl.getUniformLocation(program, 'uMax'),
  }
  return {
    gl,
    draw(params, w, h) {
      gl.viewport(0, 0, w, h)
      gl.uniform2f(u.res, w, h)
      gl.uniform2f(u.c, params.re, params.im)
      gl.uniform1f(u.span, params.span ?? 3.0)
      gl.uniform2f(u.center, params.centerX ?? 0.5, params.centerY ?? 0.5)
      gl.uniform1f(u.angle, params.angle ?? 0)
      gl.uniform1i(u.max, Math.min(300, params.maxIter ?? 150))
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    },
  }
}

let glCapable: boolean | null = null

function probeGl(): boolean {
  if (glCapable !== null) return glCapable
  glCapable = false
  try {
    const probe = document.createElement('canvas')
    probe.width = 8
    probe.height = 8
    const gl = probe.getContext('webgl2', CTX_OPTS)
    if (gl) {
      const pipeline = buildPipeline(gl)
      if (pipeline) {
        pipeline.draw({ re: -0.7269, im: 0.1889, span: 3.0, maxIter: 60 }, 8, 8)
        const px = new Uint8Array(4)
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
        // corner of a span-3 view escapes immediately → near the darkest stop
        glCapable = px[3] === 255 && px[0] < 70 && px[1] < 70 && px[2] < 70
      }
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  } catch {
    glCapable = false
  }
  if (!glCapable) console.info('julia: WebGL2 unavailable or unreliable, using CPU renderer')
  return glCapable
}

export function createGlJulia(canvas: HTMLCanvasElement): GlJulia | null {
  if (!probeGl()) return null
  const gl = canvas.getContext('webgl2', CTX_OPTS)
  if (!gl) return null
  const pipeline = buildPipeline(gl)
  if (!pipeline) return null

  return {
    render(params: JuliaParams) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const rect = canvas.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      const w = Math.round(rect.width * dpr)
      const h = Math.round(rect.height * dpr)
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      pipeline.draw(params, w, h)
    },
    dispose() {
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    },
  }
}
