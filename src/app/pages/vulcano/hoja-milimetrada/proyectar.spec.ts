import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { HojaMilimetradaComponent } from './hoja-milimetrada.component';
import { VulcanoApiService } from '../../../core/services/vulcano-api.service';

describe('Modal Proyectar existente', () => {
  const origen = { id: 'origen-test', nombre: 'Origen real', tipo_graficacion: 'Pieza', latitud: 4.65, longitud: -74.05 };
  beforeEach(() => TestBed.configureTestingModule({ imports: [HojaMilimetradaComponent], providers: [provideHttpClient(), provideHttpClientTesting()] }));
  function abrir() {
    const fixture = TestBed.createComponent(HojaMilimetradaComponent);
    fixture.componentRef.setInput('registrosCoordenadas', [origen]);
    fixture.detectChanges();
    const c = fixture.componentInstance;
    c.openElement(new Event('click'), c.elements[0]);
    c.abrirVentanaProyectar(new Event('click'));
    fixture.detectChanges();
    return { fixture, c };
  }
  it('muestra DMS y tipo reales sin modificar el origen', () => {
    const {fixture,c} = abrir();
    expect(c.coordenadasOrigen()[0]).toMatchObject({hemisferio:'N',grados:'4',minutos:'39',segundos:'0.000',decimal:'4.650000'});
    expect(c.coordenadasOrigen()[1]).toMatchObject({hemisferio:'W',grados:'74',minutos:'3',segundos:'0.000',decimal:'-74.050000'});
    expect(fixture.nativeElement.querySelector('.project-point').textContent).toContain(origen.nombre);
    expect(fixture.nativeElement.querySelector('select').textContent).toContain(origen.tipo_graficacion);
    expect(c.elements[0]).toMatchObject({latitud:origen.latitud,longitud:origen.longitud});
    fixture.destroy();
  });
  it('sincroniza input, aguja y direccion para los cuatro cardinales', () => {
    const {fixture,c} = abrir();
    for(const angle of [0,90,180,270]) {
      const input=fixture.nativeElement.querySelector('input[aria-label="Azimut"]');
      input.value=String(angle); input.dispatchEvent(new Event('input')); fixture.detectChanges();
      expect(c.azimutProyeccion).toBe(angle);
      expect(fixture.nativeElement.querySelector('.projection-needle').getAttribute('transform')).toBe(`rotate(${angle} 220 220)`);
      expect(fixture.nativeElement.querySelector('.projection-direction').textContent).toContain(`${angle}.0`);
    }
    const input=fixture.nativeElement.querySelector('input[aria-label="Azimut"]');
    input.value=''; input.dispatchEvent(new Event('input')); fixture.detectChanges();
    expect(c.azimutProyeccion).toBeNull();
    expect(fixture.nativeElement.querySelector('.projection-needle')).toBeNull();
    fixture.destroy();
  });
  it('actualiza el azimut al arrastrar el compas sin mover el modal', () => {
    const {fixture,c}=abrir();
    const svg=fixture.nativeElement.querySelector('.projection-compass');
    svg.getBoundingClientRect=()=>({left:0,top:0,width:440,height:440});
    svg.setPointerCapture=()=>{}; svg.hasPointerCapture=()=>true;
    for(const [x,y,angle] of [[220,0,0],[440,220,90],[220,440,180],[0,220,270]]) {
      c.onCompassPointerDown({button:0,pointerId:1,clientX:x,clientY:y,currentTarget:svg,preventDefault(){},stopPropagation(){}} as unknown as PointerEvent);
      expect(c.azimutProyeccion).toBe(angle);
      expect(c.modalProyectarPosicion()).toEqual({x:0,y:0});
    }
    fixture.destroy();
  });
  it('arrastra solo desde cabecera y cancelar no crea puntos', () => {
    const {fixture,c}=abrir();
    const header=fixture.nativeElement.querySelector('.project-modal-header');
    const event={button:0,pointerId:1,clientX:10,clientY:20,target:header,currentTarget:header,preventDefault(){},stopPropagation(){}} as unknown as PointerEvent;
    c.iniciarDragProyectar(event);
    c.moverDragProyectar({...event,clientX:60,clientY:80} as PointerEvent);
    expect(c.modalProyectarPosicion()).toEqual({x:50,y:60});
    c.terminarDragProyectar(event);
    expect(c.arrastrandoProyectar()).toBe(false);
    const api=TestBed.inject(VulcanoApiService);const spy=vi.spyOn(api,'registrarCoordenadas');
    fixture.nativeElement.querySelector('.projection-cancel').click();fixture.detectChanges();
    expect(c.elementoProyectar()).toBeNull();expect(spy).not.toHaveBeenCalled();expect(c.elements).toHaveLength(1);
    fixture.destroy();
  });
  it('usa la funcion existente y conserva el tipo del registro al proyectar', async () => {
    const {fixture,c}=abrir();
    c.distanciaProyeccion='200';c.actualizarAzimut(90);c.nombreProyeccion='Destino';
    const api=TestBed.inject(VulcanoApiService);
    const spy=vi.spyOn(api,'registrarCoordenadas').mockResolvedValue({ok:true,mensaje:'ok',registro:{...origen,id:'destino-test',nombre:'Destino'}});
    const emit=vi.spyOn(c.coordenadaRegistrada,'emit');
    await c.proyectarElemento();
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({nombre:'Destino',tipo_graficacion:'Pieza'}));
    expect(emit).toHaveBeenCalledOnce();expect(c.elementoProyectar()).toBeNull();
    expect(c.elements[0]).toMatchObject({latitud:origen.latitud,longitud:origen.longitud});
    fixture.destroy();
  });
});
