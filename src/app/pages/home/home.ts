import { Component } from '@angular/core';
import { TopographyBackground } from '../../shared/components/topography-background/topography-background';
import { DEFAULT_TOPOGRAPHY_CONFIG } from '../../shared/components/topography-background/topography-shaders';

interface ForoItemMock {
  categoria: string;
  titulo: string;
  autor: string;
  fecha: string;
  respuestas: number;
  destacado?: boolean;
}

interface ChatMessageMock {
  hora: string;
  usuario: string;
  rol: string;
  mensaje: string;
  etiqueta?: string;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [TopographyBackground],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home {
  /** La ruta Home posee un solo fondo; se libera al navegar a los mapas operacionales. */
  readonly topographyConfig = { ...DEFAULT_TOPOGRAPHY_CONFIG, opacity: 0.7, glow: 0.4, detail: 128 };
  readonly foroMock: ForoItemMock[] = [
    { categoria: 'BALISTICA', titulo: 'Optimizacion de tablas de tiro para Obus 155mm Santa Barbara en clima humedo', autor: 'MT. VARGAS', fecha: 'Hace 22 min', respuestas: 14, destacado: true },
    { categoria: 'COMUNICACIONES', titulo: 'Actualizacion de protocolos de seguridad en enlace digital Harris Falcon III', autor: 'CT. MORALES', fecha: 'Hace 1 h', respuestas: 8 },
    { categoria: 'GEOESPACIAL', titulo: 'Integracion de DTM cartografico IGAC con sensores no tripulados (UAV)', autor: 'TC. GOMEZ', fecha: 'Hace 3 h', respuestas: 29 },
    { categoria: 'INVESTIGACION', titulo: 'Ajustes en dispersion balistica segun variacion barometrica en cordillera', autor: 'ST. PEREZ', fecha: 'Ayer', respuestas: 5 },
  ];

  readonly chatMock: ChatMessageMock[] = [
    { hora: '15:52:10Z', usuario: 'MY. RODRIGUEZ', rol: 'COMANDO CAFUE', mensaje: 'Confirmada calibracion de barometro digital en Puesto de Mando Avanzado. Todos los nodos verificar telemetria.', etiqueta: 'ENLACE PRIVADO' },
    { hora: '15:54:30Z', usuario: 'CT. MORALES', rol: 'BATERIA ALFA', mensaje: 'Bateria Alfa sincronizada. Paquete de fuego 04 listo para validacion balistica en sistema.' },
    { hora: '15:58:02Z', usuario: 'SISTEMA VULCANO', rol: 'BOT TACTICO', mensaje: 'ALERTA AUTOMATICA: actualizacion meteorologica registrada para cuadrante UTM 18N. Viento 12 kt / 220 grados. Humedad 78%.', etiqueta: 'ALERTA AUTO' },
    { hora: '16:01:35Z', usuario: 'GM. GOMEZ E.', rol: 'OBSERVADOR ADELANTADO', mensaje: 'Coordenadas de blanco de prueba confirmadas en visor DTM. Aguardando enlace con bateria Omega.', etiqueta: 'WAYPOINT OK' },
  ];

  readonly foroFiltros = ['TODOS', 'BALISTICA', 'PROCEDIMIENTOS CAFUE', 'MATERIAL / PIEZAS', 'LECCIONES'];
  readonly canalesChat = ['GENERAL CAFUE', 'BATERIA OMEGA', 'COORDINACION FUEGOS'];
}
