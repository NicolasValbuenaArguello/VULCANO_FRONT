import { AfterViewInit, Component, ElementRef, Input, NgZone, OnDestroy, ViewChild, inject } from '@angular/core';
import { DEFAULT_TOPOGRAPHY_CONFIG, TERRAIN_FRAGMENT, TERRAIN_VERTEX, TopographyConfig } from './topography-shaders';

/** Fondo WebGL2 autonomo: un contexto y una pasada, sin interferir con el login. */
@Component({
  selector: 'app-topography-background', standalone: true,
  host: { '[style.opacity]': 'config.opacity ?? 1' },
  templateUrl: './topography-background.html', styleUrl: './topography-background.css',
})
export class TopographyBackground implements AfterViewInit, OnDestroy {
  @Input() config: Readonly<TopographyConfig> = DEFAULT_TOPOGRAPHY_CONFIG;
  @ViewChild('canvas', { static: true }) private canvas!: ElementRef<HTMLCanvasElement>;
  private readonly zone = inject(NgZone);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private readonly uniforms = new Map<string, WebGLUniformLocation | null>();
  private observer?: ResizeObserver;
  private motion?: MediaQueryList;
  private surface?: HTMLElement;
  private frame = 0;
  private destroyed = false;
  private lost = false;
  private previous = 0;
  private time = 0;
  private elapsed = 0;
  private pulseAt = -100;
  private pointer = { x: 0, y: 8, active: 0 };
  private pulse = { x: 0, y: 8 };

  /** Registra recursos y eventos fuera de Angular; no ejecuta deteccion de cambios por frame. */
  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      this.motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
      this.motion?.addEventListener('change', this.syncAnimation);
      document.addEventListener('visibilitychange', this.syncAnimation);
      window.addEventListener('resize', this.resize);
      this.surface = this.host.nativeElement.closest('main') ?? this.host.nativeElement.parentElement ?? undefined;
      this.surface?.addEventListener('pointermove', this.pointerMove, { passive: true });
      this.surface?.addEventListener('pointerdown', this.pointerDown, { passive: true });
      this.surface?.addEventListener('pointerleave', this.pointerLeave);
      if (typeof ResizeObserver !== 'undefined') {
        this.observer = new ResizeObserver(this.resize);
        this.observer.observe(this.host.nativeElement);
      }
      try {
        this.gl = this.canvas.nativeElement.getContext('webgl2', {
          alpha: false, antialias: false, depth: true, powerPreference: 'low-power', preserveDrawingBuffer: false,
        });
        this.initialize();
      } catch {
        this.release(); // El gradiente CSS permanece disponible sin WebGL2.
      }
      this.resize();
    });
  }

  /** Compila y verifica shaders; ante fallo libera tambien los objetos parciales. */
  private compile(type: number, source: string): WebGLShader {
    const gl = this.gl!;
    const shader = gl.createShader(type);
    if (!shader) throw new Error('No se pudo reservar el shader.');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      throw new Error('No se pudo compilar el terreno decorativo.');
    }
    return shader;
  }

  /** Crea el programa y la malla procedural de WebGL2; no crea contextos adicionales. */
  private initialize(): void {
    const gl = this.gl;
    if (!gl || this.destroyed || this.lost) return;
    let vertex: WebGLShader | undefined;
    let fragment: WebGLShader | undefined;
    try {
      vertex = this.compile(gl.VERTEX_SHADER, TERRAIN_VERTEX);
      fragment = this.compile(gl.FRAGMENT_SHADER, TERRAIN_FRAGMENT);
      this.program = gl.createProgram();
      if (!this.program) throw new Error('No se pudo reservar el programa.');
      gl.attachShader(this.program, vertex);
      gl.attachShader(this.program, fragment);
      gl.linkProgram(this.program);
      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error('No se pudo enlazar el programa.');
      this.vao = gl.createVertexArray();
      gl.enable(gl.DEPTH_TEST);
      for (const name of ['Time','Elevation','Tilt','Aspect','Direction','Pointer','Pulse','Color','Lines','Width','Glow','Fog','Focus','Foreground','Grid']) {
        this.uniforms.set(name, gl.getUniformLocation(this.program, `u${name}`));
      }
    } catch {
      this.release();
    } finally {
      if (vertex) gl.deleteShader(vertex);
      if (fragment) gl.deleteShader(fragment);
    }
  }

  /** Limita DPR y pixeles segun CPU/pantalla; ResizeObserver no cambia el tamano CSS. */
  private readonly resize = (): void => {
    if (this.destroyed || !this.program || this.lost) return;
    const rect = this.host.nativeElement.getBoundingClientRect();
    const limited = (navigator.hardwareConcurrency || 4) <= 4;
    const budget = limited ? 700_000 : 1_300_000;
    const ratio = Math.min(window.devicePixelRatio || 1, limited ? 1 : 1.5,
      Math.sqrt(budget / Math.max(1, rect.width * rect.height)));
    this.canvas.nativeElement.width = Math.max(1, Math.floor(rect.width * ratio));
    this.canvas.nativeElement.height = Math.max(1, Math.floor(rect.height * ratio));
    this.syncAnimation();
  };

  /** Pausa al ocultar la pestaña; movimiento reducido dibuja solo un fotograma estatico. */
  private readonly syncAnimation = (): void => {
    this.stop();
    if (this.destroyed || this.lost || !this.program || document.hidden) return;
    this.render();
    if (!this.motion?.matches) this.frame = requestAnimationFrame(this.animate);
  };

  /** Un unico bucle, limitado a 30 dibujos/segundo y sin saltos al recuperar visibilidad. */
  private readonly animate = (now: number): void => {
    this.frame = 0;
    if (this.destroyed || this.lost || document.hidden || this.motion?.matches || !this.program) return;
    if (!this.previous) this.previous = now;
    const delta = now - this.previous;
    if (delta >= 1000 / 30) {
      const seconds = Math.min(delta / 1000, 0.1);
      this.elapsed += seconds;
      this.time += seconds * Math.max(0, this.config.speed);
      this.previous = now;
      this.render();
    }
    this.frame = requestAnimationFrame(this.animate);
  };

  /** Camara inclinada y curvas iluminadas se calculan en GPU con una sola llamada de dibujo. */
  private render(): void {
    const gl = this.gl;
    if (!gl || !this.program || this.lost) return;
    const config = this.config;
    // Malla acotada por el dispositivo y por la configuracion de la vista.
    const grid = Math.round(Math.max(64, Math.min((navigator.hardwareConcurrency || 4) <= 4 ? 128 : 192, config.detail ?? 128)));
    gl.viewport(0, 0, this.canvas.nativeElement.width, this.canvas.nativeElement.height);
    gl.clearColor(0.008, 0.016, 0.009, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    const values: Record<string, number> = {
      Time: this.time, Elevation: config.elevation, Tilt: config.tilt,
      Aspect: this.canvas.nativeElement.width / this.canvas.nativeElement.height,
      Direction: config.direction === 'forward' ? -1 : 1, Lines: config.lineCount, Width: config.lineWidth,
      Glow: config.glow, Fog: config.fog, Focus: config.depthOfField, Foreground: config.foreground,
      Grid: grid,
    };
    for (const [key, value] of Object.entries(values)) gl.uniform1f(this.uniforms.get(key)!, value);
    const hex = /^#[0-9a-f]{6}$/i.test(config.color) ? config.color : '#858521';
    gl.uniform3f(this.uniforms.get('Color')!, parseInt(hex.slice(1,3),16)/255, parseInt(hex.slice(3,5),16)/255, parseInt(hex.slice(5,7),16)/255);
    gl.uniform3f(this.uniforms.get('Pointer')!, this.pointer.x, this.pointer.y, this.motion?.matches ? 0 : this.pointer.active);
    gl.uniform3f(this.uniforms.get('Pulse')!, this.pulse.x, this.pulse.y, this.elapsed - this.pulseAt);
    gl.drawArrays(gl.TRIANGLES, 0, grid * grid * 6);
  }

  /** Ignora controles del formulario; las interacciones no previenen ni capturan sus eventos. */
  private accepts(event: PointerEvent): boolean {
    return !this.motion?.matches && !(event.target as Element).closest('form, input, button, a, select, textarea, [role="button"]');
  }
  /** Proyecta el puntero al plano del terreno para elevarlo suavemente. */
  private readonly pointerMove = (event: PointerEvent): void => {
    if (!this.accepts(event)) { this.pointer.active = 0; return; }
    const rect = this.host.nativeElement.getBoundingClientRect();
    this.pointer = { x: ((event.clientX-rect.left)/Math.max(1,rect.width)-0.5)*24,
      y: (1-(event.clientY-rect.top)/Math.max(1,rect.height))*22,
      active: this.config.hoverEffect === 'lift' ? 1 : 0 };
  };
  /** Un pulso radial con decaimiento temporal, solo en las zonas libres. */
  private readonly pointerDown = (event: PointerEvent): void => {
    if (!this.accepts(event) || this.config.clickEffect !== 'pulse') return;
    this.pointerMove(event);
    this.pulse = { ...this.pointer };
    this.pulseAt = this.elapsed;
  };
  private readonly pointerLeave = (): void => { this.pointer.active = 0; };

  /** Evita el comportamiento por defecto para permitir restaurar el mismo contexto. */
  contextLost(event: Event): void {
    event.preventDefault();
    this.lost = true;
    this.stop();
    this.program = null;
    this.vao = null;
    this.uniforms.clear();
  }
  /** Recupera los recursos del contexto existente sin duplicar listeners ni animacion. */
  contextRestored(): void {
    if (this.destroyed) return;
    this.zone.runOutsideAngular(() => { this.lost = false; this.initialize(); this.resize(); });
  }
  private stop(): void { if (this.frame) cancelAnimationFrame(this.frame); this.frame = 0; this.previous = 0; }
  /** Libera programa y VAO; la malla no reserva buffers ni texturas. */
  private release(): void {
    if (this.gl && !this.lost) {
      if (this.vao) this.gl.deleteVertexArray(this.vao);
      if (this.program) this.gl.deleteProgram(this.program);
    }
    this.program = null; this.vao = null; this.uniforms.clear();
  }
  /** Detiene GPU y observadores al navegar fuera del login. */
  ngOnDestroy(): void {
    this.destroyed = true; this.stop(); this.observer?.disconnect();
    this.motion?.removeEventListener('change', this.syncAnimation);
    document.removeEventListener('visibilitychange', this.syncAnimation);
    window.removeEventListener('resize', this.resize);
    this.surface?.removeEventListener('pointermove', this.pointerMove);
    this.surface?.removeEventListener('pointerdown', this.pointerDown);
    this.surface?.removeEventListener('pointerleave', this.pointerLeave);
    this.release();
    this.gl?.getExtension('WEBGL_lose_context')?.loseContext();
    this.gl = null;
  }
}
