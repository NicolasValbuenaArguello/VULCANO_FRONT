import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Sidebar } from './sidebar';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { loginFixture } from '../../core/auth/auth-test.fixture';

describe('Sidebar', () => {
  let component: Sidebar;
  let fixture: ComponentFixture<Sidebar>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Sidebar],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(Sidebar);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('keeps Home first and preserves only the user-area logout on desktop and mobile', () => {
    const logout = vi.spyOn(component.authService, 'logout').mockResolvedValue();
    component.authService.currentUser.set(loginFixture().usuario);
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelector('.navbar-menu > a')?.textContent?.trim()).toBe('Home');
    expect(host.querySelector('.navbar-menu > a')?.getAttribute('href')).toBe('/home');
    expect(host.querySelectorAll('.navbar-menu > button')).toHaveLength(0);
    expect(host.querySelector('.navbar-mobile-panel .mobile-item .mobile-link')?.textContent?.trim()).toBe('Home');
    expect(component.menuItems.map(item => item.name)).toEqual(['Home', 'Usuario', 'Vulcano']);
    const actions = [...host.querySelectorAll<HTMLButtonElement>('.navbar-user__logout')];
    expect(actions).toHaveLength(2);
    expect([...host.querySelectorAll('a')].some(link => link.textContent?.trim() === 'Salir')).toBe(false);
    for (const action of actions) action.click();
    expect(logout).toHaveBeenCalledTimes(2);
    logout.mockRestore();
  });
});
