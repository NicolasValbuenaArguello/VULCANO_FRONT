import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';

import { Vulcano } from './vulcano';
import { DeferBlockState } from '@angular/core/testing';

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

  it('defers the hidden 3D map and retains its instance after first use', async () => {
    expect(fixture.nativeElement.querySelector('app-mapa-tres-d')).toBeNull();
    const [block] = await fixture.getDeferBlocks();
    await block.render(DeferBlockState.Complete);
    const mapHost = fixture.nativeElement.querySelector('app-mapa-tres-d');
    expect(mapHost).toBeTruthy();
    component.vistaActiva = '3d';
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    component.vistaActiva = '2d';
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-mapa-tres-d')).toBe(mapHost);
  });
});
