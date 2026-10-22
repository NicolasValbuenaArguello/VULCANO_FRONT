import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';

import { Vulcano } from './vulcano';

describe('Vulcano', () => {
  let component: Vulcano;
  let fixture: ComponentFixture<Vulcano>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Vulcano],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(Vulcano);
    component = fixture.componentInstance;
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectNone('/api/demo-points');
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
