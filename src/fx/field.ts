/**
 * A small WebGL pixel starfield used as the page background. It is decorative only: every failure path (no WebGL,
 * shader error, context loss) ends in the CSS fallback underneath the canvas.
 */
export type FieldState = 'running' | 'static' | 'lost' | 'unsupported';

const VERT = `#version 300 es
precision highp float;
in vec3 a_star;           // x, y in 0..1, z = per-star seed
uniform float u_time;
uniform vec2 u_res;
uniform float u_dpr;
out float v_tw;
out float v_hue;
void main() {
  float seed = a_star.z;
  float speed = 0.004 + 0.012 * fract(seed * 7.13);
  float y = fract(a_star.y - u_time * speed);
  float x = fract(a_star.x + sin(u_time * 0.05 + seed * 20.0) * 0.004);
  vec2 px = floor(vec2(x, y) * u_res / u_dpr) * u_dpr;     // snap to whole CSS pixels so stars stay crisp squares
  gl_Position = vec4(px / u_res * 2.0 - 1.0, 0.0, 1.0);
  gl_Position.y = -gl_Position.y;
  float size = 1.0 + floor(fract(seed * 3.7) * 2.99);       // 1, 2 or 3 CSS pixels
  gl_PointSize = size * u_dpr;
  v_tw = 0.55 + 0.45 * sin(u_time * (0.6 + fract(seed * 5.1) * 1.6) + seed * 40.0);
  v_hue = fract(seed * 11.7);
}`;
const FRAG = `#version 300 es
precision mediump float;
in float v_tw;
in float v_hue;
out vec4 o;
void main() {
  vec3 teal = vec3(0.18, 0.77, 0.71);
  vec3 orange = vec3(0.95, 0.49, 0.18);
  vec3 cream = vec3(0.95, 0.91, 0.80);
  vec3 c = v_hue < 0.5 ? cream : (v_hue < 0.82 ? teal : orange);
  o = vec4(c * v_tw, v_tw * 0.8);
}`;

export interface FieldOptions {
  count?: number;
  onState?: (s: FieldState) => void;
  onFps?: (fps: number) => void;
}

export class PixelField {
  private gl: WebGL2RenderingContext | null = null;
  private prog: WebGLProgram | null = null;
  private buf: WebGLBuffer | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private loc = { time: null as WebGLUniformLocation | null, res: null as WebGLUniformLocation | null, dpr: null as WebGLUniformLocation | null };
  private raf = 0;
  private elapsed = 0;
  private last = 0;
  private animate = true;
  private visible = true;
  private destroyed = false;
  private frames = 0;
  private fpsStart = 0;
  private ro: ResizeObserver | null = null;
  private readonly count: number;
  private dpr = 1;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly opts: FieldOptions = {}) {
    this.count = opts.count ?? 260;
    canvas.addEventListener('webglcontextlost', this.onLost);
    canvas.addEventListener('webglcontextrestored', this.onRestored);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.visible = !document.hidden;
    if (!this.init()) {
      this.opts.onState?.('unsupported');
      return;
    }
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(canvas);
    }
    this.resize();
    this.draw();
    this.schedule();
  }

  get supported(): boolean {
    return this.gl !== null;
  }

  /** Animate (true) or show one still frame (false), e.g. for reduced motion. */
  setAnimate(on: boolean): void {
    this.animate = on;
    if (!on) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.draw();
      this.opts.onState?.(this.gl ? 'static' : 'unsupported');
    } else {
      this.schedule();
    }
  }

  private init(): boolean {
    let gl: WebGL2RenderingContext | null = null;
    try {
      gl = this.canvas.getContext('webgl2', { alpha: true, antialias: false, powerPreference: 'low-power', premultipliedAlpha: true });
    } catch {
      gl = null;
    }
    if (!gl) return false;
    const compile = (type: number, src: string): WebGLShader | null => {
      const s = gl.createShader(type);
      if (!s) return null;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram();
    if (!vs || !fs || !prog) return false;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    const data = new Float32Array(this.count * 3);
    // Deterministic pseudo-random layout (no Math.random needed; the layout is purely cosmetic and stable between loads).
    let s = 1337;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < this.count; i++) {
      data[i * 3] = rnd();
      data[i * 3 + 1] = rnd();
      data[i * 3 + 2] = rnd();
    }
    const buf = gl.createBuffer();
    const vao = gl.createVertexArray();
    if (!buf || !vao) return false;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const a = gl.getAttribLocation(prog, 'a_star');
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, 3, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.gl = gl;
    this.prog = prog;
    this.buf = buf;
    this.vao = vao;
    this.loc = { time: gl.getUniformLocation(prog, 'u_time'), res: gl.getUniformLocation(prog, 'u_res'), dpr: gl.getUniformLocation(prog, 'u_dpr') };
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
    return true;
  }

  private resize(): void {
    const { canvas } = this;
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.max(1, Math.round(canvas.clientWidth * this.dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * this.dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    if (!this.animate) this.draw();
  }

  private draw(): void {
    const gl = this.gl;
    if (!gl || !this.prog || gl.isContextLost()) return;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.uniform1f(this.loc.time, this.elapsed);
    gl.uniform2f(this.loc.res, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.loc.dpr, this.dpr);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.POINTS, 0, this.count);
    gl.bindVertexArray(null);
  }

  private schedule(): void {
    if (this.destroyed || this.raf || !this.animate || !this.visible || !this.gl) return;
    this.last = performance.now();
    this.fpsStart = this.last;
    this.frames = 0;
    this.raf = requestAnimationFrame(this.tick);
    this.opts.onState?.('running');
  }

  private tick = (now: number): void => {
    this.raf = 0;
    if (this.destroyed || !this.animate || !this.visible) return;
    this.elapsed += Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.draw();
    this.frames++;
    if (this.opts.onFps && now - this.fpsStart >= 1000) {
      this.opts.onFps((this.frames * 1000) / (now - this.fpsStart));
      this.frames = 0;
      this.fpsStart = now;
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  private onVisibility = (): void => {
    this.visible = !document.hidden;
    if (!this.visible) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    } else {
      this.schedule();
    }
  };

  private onLost = (e: Event): void => {
    e.preventDefault(); // required to allow restoration
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.opts.onState?.('lost');
  };

  private onRestored = (): void => {
    this.gl = null;
    if (this.init()) {
      this.resize();
      this.draw();
      this.animate ? this.schedule() : this.opts.onState?.('static');
    } else {
      this.opts.onState?.('unsupported');
    }
  };

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.ro?.disconnect();
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onRestored);
    document.removeEventListener('visibilitychange', this.onVisibility);
    const gl = this.gl;
    if (gl && !gl.isContextLost()) {
      if (this.buf) gl.deleteBuffer(this.buf);
      if (this.vao) gl.deleteVertexArray(this.vao);
      if (this.prog) gl.deleteProgram(this.prog);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
    this.gl = null;
  }

  /** Test hook: report whether the animation loop is currently scheduled. */
  get isRunning(): boolean {
    return this.raf !== 0;
  }
}
