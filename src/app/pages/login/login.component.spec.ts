import { loginFixture } from '../../core/auth/auth-test.fixture';
import { AuthService } from '../../core/auth/auth.service';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { LoginComponent } from './login.component';
import { authInterceptor } from '../../core/interceptors/auth.interceptor';
import { errorInterceptor } from '../../core/interceptors/error.interceptor';

describe('Login submission', () => {
  it('sends one request while pending and allows retry after a 401', () => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    const fixture = TestBed.createComponent(LoginComponent);
    const component = fixture.componentInstance;
    const http = TestBed.inject(HttpTestingController);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    component['form'].patchValue({ usuario: 'tester', password: 'wrong' });
    component['login']();
    component['login']();
    const request = http.expectOne('/api/auth/token');
    expect(component['isSubmitting']()).toBe(true);
    request.flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(component['loginError']()).toBe('Usuario o contrasena incorrectos.');
    expect(component['isSubmitting']()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    http.verify();
    component['login']();
    http.expectOne('/api/auth/token').flush({}, { status: 401, statusText: 'Unauthorized' });
    http.verify();
    fixture.destroy();
    localStorage.clear();
    vi.restoreAllMocks();
  });
  it.each([422, 500, 0, 200])('shows safe errors and keeps the form usable for status %s', status => {
    TestBed.configureTestingModule({ imports: [LoginComponent], providers: [
      provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
    ] });
    const fixture = TestBed.createComponent(LoginComponent), c = fixture.componentInstance;
    const http = TestBed.inject(HttpTestingController);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    c['form'].patchValue({ usuario: 'tester', password: 'password' }); c['login']();
    const req = http.expectOne('/api/auth/token');
    if (status === 0) req.error(new ProgressEvent('error'));
    else req.flush({ detail: 'sensitive-server-detail' }, { status, statusText: 'Error' });
    expect(c['loginError']()).toBeTruthy();
    expect(c['loginError']()).not.toContain('sensitive-server-detail');
    expect(c['isSubmitting']()).toBe(false); expect(navigate).not.toHaveBeenCalled();
    expect(TestBed.inject(AuthService).isAuthenticated()).toBe(false);
    http.verify(); fixture.destroy(); vi.restoreAllMocks();
  });
  it('navigates normally after the new response is validated', () => {
    TestBed.configureTestingModule({ imports: [LoginComponent], providers: [
      provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
    ] });
    const fixture = TestBed.createComponent(LoginComponent), c = fixture.componentInstance;
    const http = TestBed.inject(HttpTestingController);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    c['form'].patchValue({ usuario: 'tester', password: 'password' }); c['login']();
    http.expectOne('/api/auth/token').flush(loginFixture());
    expect(navigate).toHaveBeenCalledWith('/home');
    expect(c['loginError']()).toBeNull();
    http.verify(); fixture.destroy(); vi.restoreAllMocks();
  });

});
