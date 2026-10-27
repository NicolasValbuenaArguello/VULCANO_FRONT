import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VerPlanes } from './ver-planes';

describe('VerPlanes', () => {
  let component: VerPlanes;
  let fixture: ComponentFixture<VerPlanes>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VerPlanes],
    }).compileComponents();

    fixture = TestBed.createComponent(VerPlanes);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
