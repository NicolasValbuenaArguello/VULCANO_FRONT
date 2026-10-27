import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Piezas } from './piezas';

describe('Piezas', () => {
  let component: Piezas;
  let fixture: ComponentFixture<Piezas>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Piezas],
    }).compileComponents();

    fixture = TestBed.createComponent(Piezas);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
