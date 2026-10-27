import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MenuSistemas } from './menu-sistemas';

describe('MenuSistemas', () => {
  let component: MenuSistemas;
  let fixture: ComponentFixture<MenuSistemas>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MenuSistemas],
    }).compileComponents();

    fixture = TestBed.createComponent(MenuSistemas);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('keeps six options and emits distinct identities for both TRABAJOS entries', () => {
    const ids: string[] = [];
    component.cambioMenu.subscribe(id => ids.push(id));
    const tabs = fixture.nativeElement.querySelectorAll('[role="tab"]') as NodeListOf<HTMLButtonElement>;
    expect(tabs).toHaveLength(6);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(tabs[3].textContent).toContain('CREAR PLAN');
    tabs[4].click();
    tabs[5].click();
    fixture.detectChanges();
    expect(ids).toEqual(['trabajos-1', 'trabajos-2']);
    expect(fixture.nativeElement.querySelectorAll('[aria-selected="true"]')).toHaveLength(1);
  });

  it('supports keyboard navigation with a single tab stop', () => {
    const tabs = fixture.nativeElement.querySelectorAll('[role="tab"]') as NodeListOf<HTMLButtonElement>;
    tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    fixture.detectChanges();
    expect(component.menuSeleccionado).toBe('trabajos-2');
    expect(fixture.nativeElement.querySelectorAll('[role="tab"][tabindex="0"]')).toHaveLength(1);
    tabs[5].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(component.menuSeleccionado).toBe('graficar-piezas');
  });
});
