import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VentanaFijar } from './ventana-fijar';

describe('VentanaFijar', () => {
  let component: VentanaFijar;
  let fixture: ComponentFixture<VentanaFijar>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VentanaFijar],
    }).compileComponents();

    fixture = TestBed.createComponent(VentanaFijar);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
