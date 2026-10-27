import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VerPiezas } from './ver-piezas';

describe('VerPiezas', () => {
  let component: VerPiezas;
  let fixture: ComponentFixture<VerPiezas>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VerPiezas],
    }).compileComponents();

    fixture = TestBed.createComponent(VerPiezas);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
