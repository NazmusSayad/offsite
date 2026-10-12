import { useEffect, useRef } from 'react'
import { getState } from '@/session'

const glyphs = ' .:-=+*#%@'

const vertexShader = `
attribute vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`

const fragmentShader = `
precision highp float;
uniform vec2 resolution;
uniform vec2 cell;
uniform vec2 pointer;
uniform float time;
uniform float arm;
uniform bool animated;
uniform float glyphCount;
uniform sampler2D atlas;
uniform vec3 background;
uniform vec3 foreground;
uniform vec3 primary;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p = p * 2.03 + vec2(17.0, 9.0);
    amplitude *= 0.5;
  }
  return value;
}

float smoke(vec2 p) {
  vec2 warp = vec2(
    fbm(p * 1.4 + time * 0.03),
    fbm(p * 1.4 + vec2(5.2, 1.3) - time * 0.025)
  );
  float mask = smoothstep(0.28, 0.6, fbm(p * 0.7 - time * 0.01));
  return mask * smoothstep(0.4, 0.85, fbm(p * 2.0 + 2.6 * warp + time * 0.015));
}

float glyph(float level, vec2 inside) {
  return texture2D(atlas, vec2((level + inside.x) / glyphCount, inside.y)).a;
}

void main() {
  vec2 pixel = vec2(gl_FragCoord.x, resolution.y - gl_FragCoord.y);
  float unit = min(resolution.x, resolution.y);
  vec2 index = floor(pixel / cell);
  vec2 inside = fract(pixel / cell);
  vec2 center = (index + 0.5) * cell;
  vec3 color = background;

  if (animated) {
    float sharp = smoke(center / unit);
    float soft = smoke(pixel / unit);
    float distance = length(center - pointer) / unit;
    float focus = 1.0 - smoothstep(0.08, 0.3, distance);
    float hole = smoothstep(0.035, 0.07, distance);

    float level = max(floor(sharp * (glyphCount - 1.0) + 0.5), 1.0);
    float ink = glyph(level, inside);
    vec3 tint = mix(primary, foreground, 0.25 * soft);
    float light = mix(soft * 0.18, ink * (0.1 + sharp * 0.8), focus) * hole;
    color += tint * light;
  }

  vec2 offset = abs(index - floor(pointer / cell));
  float armX = floor(arm * cell.y / cell.x + 0.5);
  bool plus = (offset.y < 0.5 && offset.x <= armX) || (offset.x < 0.5 && offset.y <= arm);
  if (plus) {
    color = mix(color, foreground, glyph(glyphCount - 3.0, inside));
  }

  gl_FragColor = vec4(color, 1.0);
}
`

export function NewTerminalCanvas(props: {
  animated: boolean
  onOpen: () => void
}) {
  const container = useRef<HTMLButtonElement>(null)
  const pointer = useRef<{ x: number; y: number } | null>(null)
  const pressed = useRef(false)

  useEffect(() => {
    const parent = container.current
    const element = document.createElement('canvas')
    element.className = 'pointer-events-none size-full'
    const gl = element.getContext('webgl', { alpha: false, antialias: false })
    if (!parent || !gl) return

    const ratio = Math.min(window.devicePixelRatio, 2)
    const atlas = document.createElement('canvas')
    const context = atlas.getContext('2d')
    if (!context) return
    const font = `${10 * ratio}px "${getState().config.font.family}", monospace`
    context.font = font
    const cellWidth = Math.ceil(context.measureText('M').width)
    const cellHeight = Math.ceil(10 * ratio * 1.35)
    atlas.width = cellWidth * glyphs.length
    atlas.height = cellHeight
    context.font = font
    context.fillStyle = '#fff'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    for (const [index, character] of [...glyphs].entries()) {
      context.fillText(character, (index + 0.5) * cellWidth, cellHeight / 2)
    }

    const program = gl.createProgram()
    for (const [type, source] of [
      [gl.VERTEX_SHADER, vertexShader],
      [gl.FRAGMENT_SHADER, fragmentShader],
    ] as const) {
      const shader = gl.createShader(type)
      if (!shader) return
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      gl.attachShader(program, shader)
    }
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(program))
      return
    }
    gl.useProgram(program)

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW
    )
    const position = gl.getAttribLocation(program, 'position')
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture())
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas)

    const style = getComputedStyle(parent)
    const uniform = Object.fromEntries(
      [
        'resolution',
        'cell',
        'pointer',
        'time',
        'arm',
        'animated',
        'glyphCount',
        'background',
        'foreground',
        'primary',
      ].map((name) => [name, gl.getUniformLocation(program, name)])
    )
    gl.uniform3fv(uniform.background, cssColor(style, '--background'))
    gl.uniform3fv(uniform.foreground, cssColor(style, '--foreground'))
    gl.uniform3fv(uniform.primary, cssColor(style, '--primary'))
    gl.uniform2f(uniform.cell, cellWidth, cellHeight)
    gl.uniform1f(uniform.glyphCount, glyphs.length)
    gl.uniform1i(uniform.animated, props.animated ? 1 : 0)

    parent.append(element)
    const observer = new ResizeObserver(() => {
      element.width = Math.round(element.clientWidth * ratio)
      element.height = Math.round(element.clientHeight * ratio)
      gl.viewport(0, 0, element.width, element.height)
      gl.uniform2f(uniform.resolution, element.width, element.height)
    })
    observer.observe(element)

    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    let frame = requestAnimationFrame(function draw(now) {
      const current = pointer.current ?? {
        x: element.clientWidth / 2,
        y: element.clientHeight / 2,
      }
      gl.uniform2f(uniform.pointer, current.x * ratio, current.y * ratio)
      gl.uniform1f(uniform.arm, pressed.current ? 2 : 3)
      gl.uniform1f(uniform.time, still ? 0 : now / 1000)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      frame = requestAnimationFrame(draw)
    })

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      gl.getExtension('WEBGL_lose_context')?.loseContext()
      element.remove()
    }
  }, [props.animated])

  return (
    <button
      ref={container}
      type="button"
      aria-label="New terminal"
      className="absolute inset-0 outline-none pointer-fine:cursor-none"
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect()
        pointer.current = {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        }
      }}
      onPointerLeave={() => {
        pointer.current = null
        pressed.current = false
      }}
      onPointerDown={() => {
        pressed.current = true
      }}
      onPointerUp={() => {
        pressed.current = false
      }}
      onClick={(event) => {
        if (event.detail <= 1) props.onOpen()
      }}
    ></button>
  )
}

function cssColor(style: CSSStyleDeclaration, name: string) {
  const probe = document.createElement('canvas').getContext('2d')
  if (!probe) return [0, 0, 0]
  probe.fillStyle = style.getPropertyValue(name)
  probe.fillRect(0, 0, 1, 1)
  const [red, green, blue] = probe.getImageData(0, 0, 1, 1).data
  return [red / 255, green / 255, blue / 255]
}
