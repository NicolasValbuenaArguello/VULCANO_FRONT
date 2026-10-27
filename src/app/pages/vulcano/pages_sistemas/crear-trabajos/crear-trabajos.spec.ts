import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CrearTrabajos } from './crear-trabajos';

describe('CrearTrabajos', () => {
  let component: CrearTrabajos;
  let fixture: ComponentFixture<CrearTrabajos>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CrearTrabajos],
    }).compileComponents();

    fixture = TestBed.createComponent(CrearTrabajos);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
