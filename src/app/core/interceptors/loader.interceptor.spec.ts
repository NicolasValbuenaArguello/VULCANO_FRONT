import { HttpClient, HttpContext, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { LoaderService } from '../services/loader.service';
import { LOADER_OPERATION, loaderInterceptor } from './loader.interceptor';

describe('Global loader HTTP lifecycle', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [
    provideHttpClient(withInterceptors([loaderInterceptor])), provideHttpClientTesting(),
  ] }));
  afterEach(() => { TestBed.inject(HttpTestingController).verify(); vi.useRealTimers(); });

  const request = (name: string) => TestBed.inject(HttpClient).post('/operation', {}, {
    context: new HttpContext().set(LOADER_OPERATION, name),
  });

  it('releases success, HTTP error and unsubscribe independently', () => {
    const loader = TestBed.inject(LoaderService);
    const http = TestBed.inject(HttpTestingController);
    for (const outcome of ['success', 'error', 'cancel']) {
      const subscription = request(outcome).subscribe({ error: () => {} });
      expect(loader.pendingRequests()).toBe(1);
      expect(loader.activeOperations()).toEqual([outcome]);
      const pending = http.expectOne('/operation');
      if (outcome === 'cancel') subscription.unsubscribe();
      else if (outcome === 'error') pending.flush({}, { status: 500, statusText: 'Error' });
      else pending.flush({});
      expect(loader.pendingRequests()).toBe(0);
      expect(loader.loading()).toBe(false);
    }
  });

  it('keeps concurrent operations visible and releases each token only once', () => {
    const loader = TestBed.inject(LoaderService);
    const trace: string[] = [];
    const original = loader.acquire.bind(loader);
    vi.spyOn(loader, 'acquire').mockImplementation(name => {
      const release = original(name);
      trace.push(`+ ${name} pending=${loader.pendingRequests()}`);
      return () => { release(); trace.push(`- ${name} pending=${loader.pendingRequests()}`); };
    });
    const pdf = loader.acquire('INFORME');
    request('SIMULACION').subscribe();
    expect(loader.pendingRequests()).toBe(2);
    TestBed.inject(HttpTestingController).expectOne('/operation').flush({});
    expect(loader.loading()).toBe(true);
    pdf();
    expect(trace).toEqual(['+ INFORME pending=1', '+ SIMULACION pending=2', '- SIMULACION pending=1', '- INFORME pending=0']);
    pdf();
    expect(loader.pendingRequests()).toBe(0);
  });

  it('does not acquire until subscription and ignores unmarked background HTTP', () => {
    const loader = TestBed.inject(LoaderService);
    request('UNSUBSCRIBED');
    TestBed.inject(HttpClient).get('/background').subscribe();
    expect(loader.pendingRequests()).toBe(0);
    TestBed.inject(HttpTestingController).expectOne('/background').flush({});
  });
});
