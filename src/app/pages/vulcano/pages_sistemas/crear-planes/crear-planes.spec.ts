import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CrearPlanes } from './crear-planes';

describe('CrearPlanes', () => {
  let component: CrearPlanes;
  let fixture: ComponentFixture<CrearPlanes>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CrearPlanes],
    }).compileComponents();

    fixture = TestBed.createComponent(CrearPlanes);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
