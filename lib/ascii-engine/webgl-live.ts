/**
 * High-performance WebGL2 live ASCII renderer.
 * Uploads video frames directly to the GPU as textures.
 * Performs linear luminance math, glyph selection, and atlas sampling in fragment shaders
 * with ZERO CPU readback for 60fps on high-tier and 30fps on low-tier mobile devices.
 */

import { BACKGROUNDS, parseHex } from "./color";
import type { AsciiSettings, FinishEffects, GlyphBank, RenderPalette } from "./types";

const VS_SOURCE = `#version 300 es
in vec2 a_position;
out vec2 v_uv;

void main() {
  v_uv = (a_position + 1.0) * 0.5;
  v_uv.y = 1.0 - v_uv.y; // Match canvas top-down coordinate system
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FS_SOURCE = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_video;
uniform sampler2D u_atlas;

uniform vec2 u_resolution;
uniform float u_cols;
uniform float u_rows;
uniform float u_atlasCols;
uniform float u_atlasRows;
uniform int u_numGlyphs;
uniform float u_glyphAspect;

uniform int u_colorMode;
uniform vec3 u_customAccent;
uniform vec3 u_duotoneLow;
uniform vec3 u_duotoneHigh;
uniform vec3 u_bgColor;

uniform float u_contrast;
uniform float u_brightness;
uniform float u_gamma;
uniform float u_invert;
uniform float u_mirror;
uniform float u_scanlines;
uniform float u_vignette;
uniform float u_glow;

vec3 srgbToLinear(vec3 c) {
  return pow(c, vec3(2.2));
}

vec3 linearToSrgb(vec3 c) {
  return pow(c, vec3(1.0 / 2.2));
}

float getLuma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec3 boostSaturation(vec3 c, float amount) {
  float l = getLuma(c);
  return mix(vec3(l), c, 1.0 + amount);
}

void main() {
  vec2 uv = v_uv;
  if (u_mirror > 0.5) {
    uv.x = 1.0 - uv.x;
  }

  vec2 gridDim = vec2(u_cols, u_rows);
  vec2 cellIdx = floor(uv * gridDim);
  vec2 cellUV = fract(uv * gridDim);

  // Multi-tap cell sampling for smooth luminance
  vec2 d = 0.22 / gridDim;
  vec2 centerUV = (cellIdx + 0.5) / gridDim;
  vec4 s1 = texture(u_video, centerUV + vec2(-d.x, -d.y));
  vec4 s2 = texture(u_video, centerUV + vec2( d.x, -d.y));
  vec4 s3 = texture(u_video, centerUV + vec2(-d.x,  d.y));
  vec4 s4 = texture(u_video, centerUV + vec2( d.x,  d.y));
  vec4 avgSample = (s1 + s2 + s3 + s4) * 0.25;

  vec3 linColor = srgbToLinear(avgSample.rgb);
  float luma = getLuma(linColor);

  // Tone processing in linear space
  luma = (luma - 0.5) * u_contrast + 0.5 + u_brightness;
  luma = clamp(luma, 0.0, 1.0);
  luma = pow(luma, u_gamma);
  if (u_invert > 0.5) {
    luma = 1.0 - luma;
  }

  // Pick glyph index proportional to luminance
  float maxG = float(u_numGlyphs - 1);
  float gIdx = floor(luma * maxG + 0.5);
  gIdx = clamp(gIdx, 0.0, maxG);

  float gCol = mod(gIdx, u_atlasCols);
  float gRow = floor(gIdx / u_atlasCols);
  vec2 atlasUV = (vec2(gCol, gRow) + cellUV) / vec2(u_atlasCols, u_atlasRows);

  vec4 atlasSample = texture(u_atlas, atlasUV);
  float mask = atlasSample.a;

  // Determine text color based on mode
  vec3 textColor = vec3(0.92, 0.91, 0.88); // Default Mono
  if (u_colorMode == 1) { // Phosphor
    textColor = vec3(0.18, 1.0, 0.42);
  } else if (u_colorMode == 2) { // Amber
    textColor = vec3(1.0, 0.72, 0.18);
  } else if (u_colorMode == 3) { // Ice
    textColor = vec3(0.48, 0.82, 1.0);
  } else if (u_colorMode == 4) { // Full color
    textColor = boostSaturation(avgSample.rgb, 0.28);
  } else if (u_colorMode == 5) { // Duotone
    textColor = mix(u_duotoneLow, u_duotoneHigh, luma);
  } else if (u_colorMode == 6) { // Gradient
    vec3 g1 = vec3(0.16, 0.04, 0.28);
    vec3 g2 = vec3(0.98, 0.28, 0.55);
    vec3 g3 = vec3(1.0, 0.88, 0.32);
    textColor = luma < 0.5 ? mix(g1, g2, luma * 2.0) : mix(g2, g3, (luma - 0.5) * 2.0);
  } else if (u_colorMode == 7) { // Custom
    textColor = u_customAccent;
  }

  // Composite text on top of background
  vec3 finalColor = mix(u_bgColor, textColor, mask);

  // Subtle glow emulation in-shader
  if (u_glow > 0.01) {
    float glowMask = atlasSample.a * u_glow * 0.4;
    finalColor += textColor * glowMask;
  }

  // Scanlines
  if (u_scanlines > 0.01) {
    float scan = sin(v_uv.y * u_resolution.y * 1.5) * 0.5 + 0.5;
    finalColor *= 1.0 - scan * u_scanlines * 0.4;
  }

  // Vignette
  if (u_vignette > 0.01) {
    float dist = distance(v_uv, vec2(0.5));
    float vig = smoothstep(0.35, 0.8, dist) * u_vignette * 0.65;
    finalColor *= (1.0 - vig);
  }

  fragColor = vec4(finalColor, 1.0);
}
`;

function createShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Could not create WebGL shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compilation failed: ${info}`);
  }
  return shader;
}

export class WebGL2AsciiRenderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private quadVao: WebGLVertexArrayObject | null = null;
  private videoTexture: WebGLTexture | null = null;
  private atlasTexture: WebGLTexture | null = null;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private bank: GlyphBank | null = null;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error("WebGL2 not supported on this device");
    this.gl = gl;

    const vs = createShader(gl, gl.VERTEX_SHADER, VS_SOURCE);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, FS_SOURCE);
    const program = gl.createProgram();
    if (!program) throw new Error("Could not create WebGL program");
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`Program linking failed: ${info}`);
    }
    this.program = program;

    this.initBuffers();
    this.initTextures();
    this.cacheUniforms();
  }

  private initBuffers(): void {
    const gl = this.gl;
    this.quadVao = gl.createVertexArray();
    gl.bindVertexArray(this.quadVao);

    const posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    // 2 triangles covering [-1, 1]
    const positions = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    const aPos = gl.getAttribLocation(this.program, "a_position");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);
  }

  private initTextures(): void {
    const gl = this.gl;
    this.videoTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.videoTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    this.atlasTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }

  private cacheUniforms(): void {
    const gl = this.gl;
    const p = this.program;
    const names = [
      "u_video",
      "u_atlas",
      "u_resolution",
      "u_cols",
      "u_rows",
      "u_atlasCols",
      "u_atlasRows",
      "u_numGlyphs",
      "u_glyphAspect",
      "u_colorMode",
      "u_customAccent",
      "u_duotoneLow",
      "u_duotoneHigh",
      "u_bgColor",
      "u_contrast",
      "u_brightness",
      "u_gamma",
      "u_invert",
      "u_mirror",
      "u_scanlines",
      "u_vignette",
      "u_glow",
    ];
    for (const name of names) {
      this.uniforms[name] = gl.getUniformLocation(p, name);
    }
  }

  setGlyphBank(bank: GlyphBank): void {
    this.bank = bank;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      bank.atlas as TexImageSource,
    );
  }

  render(params: {
    video: HTMLVideoElement;
    cols: number;
    rows: number;
    mirror: boolean;
    settings: AsciiSettings;
    palette: RenderPalette;
    finish: FinishEffects;
    width: number;
    height: number;
  }): void {
    const gl = this.gl;
    const bank = this.bank;
    if (!bank || !this.videoTexture) return;

    if (gl.canvas.width !== params.width || gl.canvas.height !== params.height) {
      gl.canvas.width = params.width;
      gl.canvas.height = params.height;
    }
    gl.viewport(0, 0, params.width, params.height);

    // Direct GPU upload of video frame (zero CPU readback!)
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.videoTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      params.video,
    );

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture);

    gl.useProgram(this.program);
    gl.bindVertexArray(this.quadVao);

    gl.uniform1i(this.uniforms.u_video, 0);
    gl.uniform1i(this.uniforms.u_atlas, 1);
    gl.uniform2f(this.uniforms.u_resolution, params.width, params.height);
    gl.uniform1f(this.uniforms.u_cols, params.cols);
    gl.uniform1f(this.uniforms.u_rows, params.rows);
    gl.uniform1f(this.uniforms.u_atlasCols, bank.atlasCols);
    const atlasRows = Math.ceil(bank.glyphs.length / bank.atlasCols);
    gl.uniform1f(this.uniforms.u_atlasRows, atlasRows);
    gl.uniform1i(this.uniforms.u_numGlyphs, bank.glyphs.length);
    gl.uniform1f(this.uniforms.u_glyphAspect, bank.metrics.aspect);

    // Color mode mapping
    const modeIndex = {
      mono: 0,
      phosphor: 1,
      amber: 2,
      ice: 3,
      full: 4,
      duotone: 5,
      gradient: 6,
      custom: 7,
    }[params.palette.colorMode] ?? 0;
    gl.uniform1i(this.uniforms.u_colorMode, modeIndex);

    const [caR, caG, caB] = parseHex(params.palette.customAccent);
    gl.uniform3f(this.uniforms.u_customAccent, caR / 255, caG / 255, caB / 255);

    const [dtlR, dtlG, dtlB] = parseHex(params.palette.duotoneLow);
    gl.uniform3f(this.uniforms.u_duotoneLow, dtlR / 255, dtlG / 255, dtlB / 255);

    const [dthR, dthG, dthB] = parseHex(params.palette.duotoneHigh);
    gl.uniform3f(this.uniforms.u_duotoneHigh, dthR / 255, dthG / 255, dthB / 255);

    const bgRgb = BACKGROUNDS[params.palette.background] ?? [10, 10, 10];
    gl.uniform3f(this.uniforms.u_bgColor, bgRgb[0] / 255, bgRgb[1] / 255, bgRgb[2] / 255);

    gl.uniform1f(this.uniforms.u_contrast, params.settings.contrast);
    gl.uniform1f(this.uniforms.u_brightness, params.settings.brightness);
    gl.uniform1f(this.uniforms.u_gamma, params.settings.gamma);
    gl.uniform1f(this.uniforms.u_invert, params.settings.invert ? 1.0 : 0.0);
    gl.uniform1f(this.uniforms.u_mirror, params.mirror ? 1.0 : 0.0);
    gl.uniform1f(this.uniforms.u_scanlines, params.finish.scanlines);
    gl.uniform1f(this.uniforms.u_vignette, params.finish.vignette);
    gl.uniform1f(this.uniforms.u_glow, params.finish.glow);

    // Draw full-screen quad in a single GPU pass
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.bindVertexArray(null);
  }

  destroy(): void {
    const gl = this.gl;
    if (this.videoTexture) gl.deleteTexture(this.videoTexture);
    if (this.atlasTexture) gl.deleteTexture(this.atlasTexture);
    if (this.quadVao) gl.deleteVertexArray(this.quadVao);
    if (this.program) gl.deleteProgram(this.program);
  }
}
