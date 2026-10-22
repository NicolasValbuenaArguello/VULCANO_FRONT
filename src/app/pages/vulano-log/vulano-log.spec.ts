import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VulanoLog } from './vulano-log';

describe('VulanoLog', () => {
  let component: VulanoLog;
  let fixture: ComponentFixture<VulanoLog>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VulanoLog],
    }).compileComponents();

    fixture = TestBed.createComponent(VulanoLog);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
