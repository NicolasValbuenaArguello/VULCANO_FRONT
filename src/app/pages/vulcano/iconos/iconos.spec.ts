import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Iconos } from './iconos';

describe('Iconos', () => {
  let component: Iconos;
  let fixture: ComponentFixture<Iconos>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Iconos],
    }).compileComponents();

    fixture = TestBed.createComponent(Iconos);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
