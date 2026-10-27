import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VerTrabajos } from './ver-trabajos';

describe('VerTrabajos', () => {
  let component: VerTrabajos;
  let fixture: ComponentFixture<VerTrabajos>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VerTrabajos],
    }).compileComponents();

    fixture = TestBed.createComponent(VerTrabajos);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
