import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { TopographyBackground } from './topography-background';

describe('Topography background lifecycle', () => {
  afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  function setup(reduced = false) {
    const gl = Object.fromEntries(['shaderSource','compileShader','attachShader','linkProgram','deleteShader',
      'enable','viewport','clearColor','clear','useProgram','bindVertexArray','uniform1f','uniform3f',
      'drawArrays','deleteProgram','deleteVertexArray'].map(name => [name, vi.fn()]));
    Object.assign(gl, { createShader: vi.fn(() => ({})), getShaderParameter: () => true,
      createProgram: () => ({}), getProgramParameter: () => true, createVertexArray: () => ({}),
      getUniformLocation: () => ({}), getExtension: () => null });
    const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(gl as any);
    const query = { matches: reduced, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal('matchMedia', vi.fn(() => query));
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(7);
    const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    const fixture = TestBed.createComponent(TopographyBackground);
    fixture.detectChanges();
    return { fixture, gl, context, query, raf, cancel };
  }

  it('uses one context and releases GPU resources and animation on destruction', () => {
    const { fixture, gl, context, raf, cancel } = setup();
    expect(context).toHaveBeenCalledTimes(1);
    expect(context.mock.calls[0][0]).toBe('webgl2');
    expect(raf.mock.calls.filter(call => call[0] === (fixture.componentInstance as any).animate)).toHaveLength(1);
    expect(gl['drawArrays']).toHaveBeenCalled();
    fixture.destroy();
    expect(cancel).toHaveBeenCalledWith(7);
    expect(gl['deleteProgram']).toHaveBeenCalledTimes(1);
    expect(gl['deleteVertexArray']).toHaveBeenCalledTimes(1);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(raf.mock.calls.filter(call => call[0] === (fixture.componentInstance as any).animate)).toHaveLength(1);
  });

  it('renders one still frame for reduced motion and recovers the same lost context', () => {
    const { fixture, context, raf, gl } = setup(true);
    expect(raf.mock.calls.filter(call => call[0] === (fixture.componentInstance as any).animate)).toHaveLength(0);
    expect(gl['drawArrays']).toHaveBeenCalledTimes(1);
    const canvas = fixture.nativeElement.querySelector('canvas') as HTMLCanvasElement;
    const event = new Event('webglcontextlost', { cancelable: true });
    canvas.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(context).toHaveBeenCalledTimes(1);
    expect(gl['drawArrays']).toHaveBeenCalledTimes(2);
    expect(raf.mock.calls.filter(call => call[0] === (fixture.componentInstance as any).animate)).toHaveLength(0);
  });

  it('leaves the CSS fallback without an animation when WebGL2 is unavailable', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    const fixture = TestBed.createComponent(TopographyBackground);
    fixture.detectChanges();
    expect(raf.mock.calls.filter(call => call[0] === (fixture.componentInstance as any).animate)).toHaveLength(0);
    expect(() => fixture.destroy()).not.toThrow();
  });
});
