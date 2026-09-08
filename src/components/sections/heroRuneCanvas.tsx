import { useEffect, useRef } from 'react'
import profile from '../../assets/images/about/profile.svg'
import { useThemeStore } from '~/features/theme/store'


// GPU implementation of the ASCII-wave hero background. A single
// full-screen fragment shader picks an ASCII glyph per pixel from a
// pre-rasterized glyph atlas based on (distance, phase) and emits the
// theme's ink colour at full alpha inside the StakeCore rune silhouette,
// dimmed alpha outside.
//
// Per-frame main-thread work reduces to: update one `u_phase` uniform
// + drawArrays(6). All shading happens on the GPU in parallel.
const RAMP = ' .,:;+*x#@'
const SVG_ASPECT = 340 / 380

const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}`

// Fragment shader. The wave is purely f(dist, phase); the rune mask is a
// tiny texture that decides per-cell whether a glyph is full strength or
// dimmed; the glyph atlas is a 10-wide horizontal strip of pre-rendered RAMP
// characters. Output is premultiplied ink × alpha on a transparent canvas —
// the page shows through where there is no glyph, whichever theme it is.
const FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform float u_phase;
uniform vec2  u_resolution;     // canvas size in backing-store pixels
uniform float u_cellSizePx;     // backing-store pixels per cell
uniform vec2  u_runeSizeCells;  // (runeW, runeH) in cells
uniform sampler2D u_glyphAtlas; // horizontal strip, RAMP_LEN glyphs
uniform sampler2D u_runeMask;   // rune silhouette texture
uniform vec3  u_ink;            // glyph colour — the --heading-color token

out vec4 fragColor;

const float RAMP_LEN = 10.0;
const float INSIDE_ALPHA = 1.0;       // full-strength glyphs inside the rune
const float OUTSIDE_ALPHA = 0.42;     // dimmed field outside it
const float INSIDE_THRESHOLD = 0.05;

void main() {
  // gl_FragCoord is bottom-left origin in WebGL — flip Y so the rest
  // of the math reads in canvas-2D / top-left coordinates.
  vec2 px = vec2(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y);

  vec2 cell = floor(px / u_cellSizePx);
  vec2 cellCount = ceil(u_resolution / u_cellSizePx);
  vec2 cellCenter = cellCount * 0.5;

  // Wave value at this cell's radial distance.
  float dist = length(cell - cellCenter);
  float wave = 0.5
             + 0.35 * sin(dist * 0.42 - u_phase)
             + 0.15 * sin(dist * 0.18 - u_phase * 0.6);

  // Pick the RAMP glyph index from wave intensity. clamp to [0, 1)
  // so floor never hits RAMP_LEN.
  float charIdx = floor(clamp(wave, 0.0, 0.9999) * RAMP_LEN);

  // Is this cell inside the rune silhouette? Sample the centered mask
  // texture; cells outside the rune-sized rectangle short-circuit to 0.
  vec2 cellInRune = (cell - cellCenter + u_runeSizeCells * 0.5) / u_runeSizeCells;
  float inside = 0.0;
  if (all(greaterThanEqual(cellInRune, vec2(0.0))) && all(lessThanEqual(cellInRune, vec2(1.0)))) {
    vec4 maskTex = texture(u_runeMask, cellInRune);
    inside = maskTex.r * maskTex.a;
  }
  bool isInside = inside > INSIDE_THRESHOLD;

  // Local position within the cell (0..1), then map into atlas UV.
  vec2 cellLocal = (px - cell * u_cellSizePx) / u_cellSizePx;
  vec2 atlasUV = vec2((charIdx + cellLocal.x) / RAMP_LEN, cellLocal.y);

  float glyphAlpha = texture(u_glyphAtlas, atlasUV).a;
  float a = glyphAlpha * (isInside ? INSIDE_ALPHA : OUTSIDE_ALPHA);

  // Premultiplied, to match the context's premultipliedAlpha:true. CSS
  // opacity + the gradient mask still handle compositing into the page.
  fragColor = vec4(u_ink * a, a);
}`

// Any CSS colour → sRGB byte values divided by 255, into 0..1 RGB, via the 2D
// canvas parser so the token may be hex, rgb() or a named colour without a
// parser of our own. No gamma decode — that is correct for this shader, which
// composites in the same (non-linear) space; don't "fix" this later by adding
// one.
const parseCssColor = (color: string): [number, number, number] => {
  const off = document.createElement('canvas')
  off.width = 1
  off.height = 1
  const ctx = off.getContext('2d')
  if (!ctx) return [1, 1, 1]
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
  return [(r ?? 255) / 255, (g ?? 255) / 255, (b ?? 255) / 255]
}

const HeroRuneCanvas = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: true, premultipliedAlpha: true })
    if (!gl) {
      console.warn('hero-rune: WebGL2 unavailable; background will not render')
      return
    }

    // Density + cell metrics. Recomputed in setup() on every resize so a DPI
    // switch (window dragged to a different-density monitor) or crossing the
    // 768px breakpoint re-renders at the right density instead of these stale
    // mount-time values.
    // Smaller cells on phones: more rune-silhouette samples (logo detail
    // becomes visible) and denser wave bands so the field doesn't read
    // as a few wide stretched stripes against a tall narrow viewport.
    let dpr = window.devicePixelRatio || 1
    let cellSize = window.innerWidth < 768 ? 6 : 10  // CSS pixels per cell
    let cellSizePx = cellSize * dpr // backing-store pixels per cell

    // --- shader compile + link ---
    const compile = (type: number, src: string): WebGLShader | null => {
      const shader = gl.createShader(type)
      if (!shader) return null
      gl.shaderSource(shader, src)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('hero-rune shader compile error:', gl.getShaderInfoLog(shader))
        gl.deleteShader(shader)
        return null
      }
      return shader
    }
    const vs = compile(gl.VERTEX_SHADER, VERTEX_SHADER)
    const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
    if (!vs || !fs) return

    const program = gl.createProgram()
    if (!program) return
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('hero-rune program link error:', gl.getProgramInfoLog(program))
      return
    }
    gl.deleteShader(vs)
    gl.deleteShader(fs)

    // --- full-screen quad geometry (VAO + VBO) ---
    const vao = gl.createVertexArray()
    gl.bindVertexArray(vao)
    const vbo = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,  1, -1, -1,  1,
      -1,  1,  1, -1,  1,  1,
    ]), gl.STATIC_DRAW)
    const posLoc = gl.getAttribLocation(program, 'a_position')
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)
    gl.bindVertexArray(null)

    // --- uniform locations ---
    gl.useProgram(program)
    const uPhase = gl.getUniformLocation(program, 'u_phase')
    const uResolution = gl.getUniformLocation(program, 'u_resolution')
    const uCellSize = gl.getUniformLocation(program, 'u_cellSizePx')
    const uRuneSize = gl.getUniformLocation(program, 'u_runeSizeCells')
    gl.uniform1i(gl.getUniformLocation(program, 'u_glyphAtlas'), 0)
    gl.uniform1i(gl.getUniformLocation(program, 'u_runeMask'), 1)
    if (uCellSize) gl.uniform1f(uCellSize, cellSizePx)

    const uInk = gl.getUniformLocation(program, 'u_ink')
    const applyInk = () => {
      const css = getComputedStyle(canvas).getPropertyValue('--heading-color').trim() || '#fff'
      const [r, g, b] = parseCssColor(css)
      gl.useProgram(program)
      if (uInk) gl.uniform3f(uInk, r, g, b)
    }
    applyInk()

    // --- glyph atlas: a 1-row horizontal strip of all RAMP chars
    // rendered in white. The fragment shader reads only the atlas's alpha
    // channel (see fragColor above) and tints with u_ink, so the colour
    // baked into the atlas is irrelevant — it could be any colour.
    const buildGlyphAtlas = (): HTMLCanvasElement => {
      const charW = Math.ceil(cellSizePx)
      const charH = Math.ceil(cellSizePx)
      const off = document.createElement('canvas')
      off.width = charW * RAMP.length
      off.height = charH
      const octx = off.getContext('2d')
      if (octx) {
        octx.font = `${cellSizePx}px 'Roboto Mono', ui-monospace, monospace`
        octx.fillStyle = '#FFFFFF'
        octx.textBaseline = 'top'
        for (let i = 0; i < RAMP.length; i++) {
          octx.fillText(RAMP[i] ?? '', i * charW, 0)
        }
      }
      return off
    }
    const glyphTex = gl.createTexture()
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, glyphTex)
    // Note: don't enable UNPACK_FLIP_Y_WEBGL — the fragment shader is
    // already working in top-origin coordinates (it flips gl_FragCoord.y),
    // so enabling the upload-time flip on top would invert the texture.
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, buildGlyphAtlas())
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    // Re-render the glyph atlas at the current cellSizePx. Only called from
    // setup() when the backing-store cell size actually changes (DPI switch
    // or breakpoint cross) — not on ordinary resizes.
    const rebuildGlyphAtlas = () => {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, glyphTex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, buildGlyphAtlas())
    }

    // --- rune mask texture (filled by rasterize() once per resize) ---
    const runeTex = gl.createTexture()
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, runeTex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    // --- geometry state ---
    let w = 0, h = 0, cols = 0, rows = 0
    let runeW = 0, runeH = 0

    const setup = () => {
      const rect = canvas.getBoundingClientRect()
      w = rect.width
      h = rect.height
      // Refresh density + cell size in case the DPI or the 768px breakpoint
      // changed since the last setup (monitor swap, orientation, zoom).
      dpr = window.devicePixelRatio || 1
      cellSize = window.innerWidth < 768 ? 6 : 10
      const nextCellSizePx = cellSize * dpr
      canvas.width = Math.ceil(w * dpr)
      canvas.height = Math.ceil(h * dpr)
      gl.viewport(0, 0, canvas.width, canvas.height)
      cols = Math.ceil(w / cellSize)
      rows = Math.ceil(h / cellSize)
      // Rune sprite size: 55% of the shorter grid axis, preserve aspect.
      const minor = Math.min(cols, rows)
      runeH = Math.max(20, Math.round(minor * 0.55))
      runeW = Math.round(runeH * SVG_ASPECT)
      if (runeW > cols) {
        runeW = cols
        runeH = Math.round(runeW / SVG_ASPECT)
      }
      gl.useProgram(program)
      // The backing-store cell size is stable across ordinary resizes, so
      // only re-render the glyph atlas + refresh its uniform when it actually
      // changes (matches on the initial call, so no redundant first rebuild).
      if (nextCellSizePx !== cellSizePx) {
        cellSizePx = nextCellSizePx
        rebuildGlyphAtlas()
        if (uCellSize) gl.uniform1f(uCellSize, cellSizePx)
      }
      if (uResolution) gl.uniform2f(uResolution, canvas.width, canvas.height)
      if (uRuneSize) gl.uniform2f(uRuneSize, runeW, runeH)
    }

    // Rasterize profile.svg into a runeW × runeH texture. Sampled by
    // the fragment shader to decide inside/outside per cell. Async
    // because <img> loading is async, but only runs at setup + resize.
    const rasterize = () => new Promise<void>((resolve) => {
      const img = new Image()
      img.onload = () => {
        // If the effect was torn down while the image was loading, runeTex
        // has been deleted — binding it would throw INVALID_OPERATION.
        if (destroyed) { resolve(); return }
        const off = document.createElement('canvas')
        off.width = runeW
        off.height = runeH
        const octx = off.getContext('2d')
        if (octx) octx.drawImage(img, 0, 0, runeW, runeH)
        gl.activeTexture(gl.TEXTURE1)
        gl.bindTexture(gl.TEXTURE_2D, runeTex)
        // Note: don't enable UNPACK_FLIP_Y_WEBGL — the fragment shader is
    // already working in top-origin coordinates (it flips gl_FragCoord.y),
    // so enabling the upload-time flip on top would invert the texture.
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, off)
        resolve()
      }
      img.src = profile
    })

    let phase = 0
    let last = 0
    let raf = 0
    let ready = false
    // Cleanup deletes the GL objects below. Any async work in flight at
    // that moment (rasterize image-load, queued ResizeObserver fire,
    // or a re-entrant RAF tick) must short-circuit before touching GL —
    // otherwise it bindVertexArray's a deleted object, errors, and
    // since tick reschedules itself, errors every frame after that.
    // This matters most under React strict-mode double-mount.
    let destroyed = false
    // RAF only runs when the canvas is in-viewport AND the tab is in
    // the foreground. Start optimistic so we don't delay the first
    // paint while waiting for the IntersectionObserver to fire.
    let intersecting = true
    let pageVisible = !document.hidden
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

    const drawFrame = () => {
      gl.useProgram(program)
      if (uPhase) gl.uniform1f(uPhase, phase)
      gl.bindVertexArray(vao)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
    }

    const tick = (t: number) => {
      if (destroyed) return
      raf = requestAnimationFrame(tick)
      if (!ready) return
      if (t - last < 80) return
      const dt = last === 0 ? 16 : t - last
      last = t
      phase += dt * 0.002
      drawFrame()
    }

    const startLoop = () => {
      if (destroyed) return
      if (raf !== 0) return
      if (reduceMotion || !intersecting || !pageVisible) return
      // Reset the time-since-last so the first frame after a resume
      // doesn't see a huge dt and jump the wave forward.
      last = 0
      raf = requestAnimationFrame(tick)
    }

    const stopLoop = () => {
      if (raf === 0) return
      cancelAnimationFrame(raf)
      raf = 0
    }

    // The store stamps data-theme before it notifies, so the computed style
    // read in applyInk is already the incoming palette. When the RAF loop is
    // idle (reduced motion, off-screen, hidden tab) nothing else would
    // repaint, so draw one frame here.
    const unsubscribeTheme = useThemeStore.subscribe((state, prev) => {
      if (destroyed || state.theme === prev.theme) return
      applyInk()
      if (ready && raf === 0) drawFrame()
    })

    setup()
    rasterize().then(() => {
      if (destroyed) return
      ready = true
      if (reduceMotion) drawFrame()
      else startLoop()
    })

    const io = new IntersectionObserver(([entry]) => {
      if (destroyed || entry == null) return
      intersecting = entry.isIntersecting
      if (intersecting) startLoop()
      else stopLoop()
    })
    io.observe(canvas)

    const onVisibility = () => {
      if (destroyed) return
      pageVisible = !document.hidden
      if (pageVisible) startLoop()
      else stopLoop()
    }
    document.addEventListener('visibilitychange', onVisibility)

    // ResizeObserver on the canvas (not window 'resize') so we react to
    // iOS Safari URL-bar collapse, orientation changes, and any other
    // size shift of the 100vh container — keeps the backing store in
    // step with the CSS box so the GPU output isn't stretched.
    const onResize = () => {
      if (destroyed) return
      setup()
      rasterize().then(() => {
        if (destroyed) return
        if (reduceMotion) drawFrame()
      })
    }
    const ro = new ResizeObserver(onResize)
    ro.observe(canvas)

    return () => {
      destroyed = true
      unsubscribeTheme()
      io.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      stopLoop()
      ro.disconnect()
      gl.deleteTexture(glyphTex)
      gl.deleteTexture(runeTex)
      gl.deleteBuffer(vbo)
      gl.deleteVertexArray(vao)
      gl.deleteProgram(program)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="hero-rune-canvas"
      aria-hidden
    />
  )
}

export default HeroRuneCanvas
