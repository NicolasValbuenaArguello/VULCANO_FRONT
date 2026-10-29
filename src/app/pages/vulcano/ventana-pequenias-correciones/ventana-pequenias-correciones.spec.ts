import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VentanaPequeniasCorreciones } from './ventana-pequenias-correciones';

describe('VentanaPequeniasCorreciones', () => {
  let component: VentanaPequeniasCorreciones;
  let fixture: ComponentFixture<VentanaPequeniasCorreciones>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VentanaPequeniasCorreciones],
    }).compileComponents();

    fixture = TestBed.createComponent(VentanaPequeniasCorreciones);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
