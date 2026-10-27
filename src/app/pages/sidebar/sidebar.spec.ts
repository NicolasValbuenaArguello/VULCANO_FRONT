import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Sidebar } from './sidebar';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { vi } from 'vitest';

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

  it('renders Salir as an action on desktop and mobile, never as a login link', () => {
    const logout = vi.spyOn(component.authService, 'logout').mockResolvedValue();
    const host: HTMLElement = fixture.nativeElement;
    const actions = [...host.querySelectorAll<HTMLButtonElement>('button')].filter(button => button.textContent?.trim() === 'Salir');
    expect(actions).toHaveLength(2);
    expect([...host.querySelectorAll('a')].some(link => link.textContent?.trim() === 'Salir')).toBe(false);
    for (const action of actions) action.click();
    expect(logout).toHaveBeenCalledTimes(2);
    logout.mockRestore();
  });
});
