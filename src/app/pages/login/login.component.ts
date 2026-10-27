import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../core/auth/auth.service';
import { APP_PATHS } from '../../core/constants/routes.constants';
import { TopographyBackground } from '../../shared/components/topography-background/topography-background';
import { DEFAULT_TOPOGRAPHY_CONFIG } from '../../shared/components/topography-background/topography-shaders';

interface InstitutionalSectionConfig {
  titulo: string;
  codigo: string;
  items: string[];
  pie: string;
  estado: string;
}

interface ObjetivoEstrategico {
  id: number;
  titulo: string;
  descripcion: string;
  estado: string;
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TopographyBackground],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
/** Presenta el formulario existente y delega autenticacion a AuthService; controla envios y errores seguros. */
export class LoginComponent {
  /** Configuracion visual independiente de la autenticacion y sus credenciales. */
  protected readonly topographyConfig = DEFAULT_TOPOGRAPHY_CONFIG;
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected showLogin = false;
  protected showPassword = false;
  protected readonly loginError = signal<string | null>(null);
  protected readonly isSubmitting = signal(false);

  protected readonly missionConfig: InstitutionalSectionConfig = {
    titulo: 'MISIÓN ESTRATÉGICA',
    codigo: 'CAUF-01',
    items: [
      'Proporcionar al Comando Superior y al Centro de Apoyo de Fuegos una plataforma geoespacial segura para la planeación, coordinación y ejecución de la maniobra.',
      'Integrar información táctica y cartográfica en un entorno único para acelerar la toma de decisiones y reducir la fricción operativa.',
      'Garantizar disponibilidad, trazabilidad y soporte institucional para operaciones de artillería a nivel nacional.',
    ],
    pie: 'DOCTRINA & OPERACIONES',
    estado: 'ACTIVA',
  };

  protected readonly visionConfig: InstitutionalSectionConfig = {
    titulo: 'VISIÓN ESTRATÉGICA',
    codigo: 'HORIZONTE 2030',
    items: [
      'Consolidar a VULCANO 3.0 como el estándar soberano de referencia para el apoyo geoespacial de la Fuerza.',
      'Ampliar la interoperabilidad con entornos multifuente y capacidades de análisis en tiempo real.',
      'Fortalecer la resiliencia operacional mediante automatización, seguridad y continuidad de servicio.',
    ],
    pie: 'ESTÁNDAR MULTIENTORNO',
    estado: 'EN DESPLIEGUE',
  };

  protected readonly objetivosConfig = {
    titulo: 'OBJETIVOS ESTRATÉGICOS',
    items: [
      {
        id: 1,
        titulo: 'SUPERIORIDAD CARTOGRÁFICA',
        descripcion: 'Fusionar fuentes geoespaciales, validar referencias y mantener precisión operacional en tiempo real.',
        estado: 'ACTIVO',
      },
      {
        id: 2,
        titulo: 'AUTOMATIZACIÓN BALÍSTICA',
        descripcion: 'Reducir tiempos de cálculo y conectar la cadena de fuego con mecanismos seguros de despliegue.',
        estado: 'ACTIVO',
      },
      {
        id: 3,
        titulo: 'RESILIENCIA Y CRIPTOGRAFÍA',
        descripcion: 'Asegurar confidencialidad, integridad y redundancia táctica para uso institucional continuo.',
        estado: 'ACTIVO',
      },
    ] as ObjetivoEstrategico[],
  };

  protected readonly form = this.fb.group({
    usuario: ['', [Validators.required]],
    password: ['', [Validators.required]],
    recordarUsuario: [true],
  });

  protected openLogin(): void {
    this.loginError.set(null);
    this.showLogin = true;
  }

  protected closeLogin(): void {
    this.loginError.set(null);
    this.showLogin = false;
  }

  protected togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  /** Valida controles, bloquea envios duplicados y navega a Home solo tras bootstrap valido.
   * La suscripcion termina al destruir el componente; finalize libera el estado de envio. */
  protected login(): void {
    if (this.isSubmitting()) {
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const usuario = this.form.controls.usuario.value?.trim() ?? '';
    const password = this.form.controls.password.value ?? '';

    this.loginError.set(null);
    this.isSubmitting.set(true);

    this.authService
      .login(usuario, password)
      .pipe(
        finalize(() => {
          this.isSubmitting.set(false);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          void this.router.navigateByUrl(APP_PATHS.HOME);
        },
        error: (error: unknown) => {
          // Mensajes controlados: no mostrar detalles internos ni contenido arbitrario del servidor.
          const message = error instanceof HttpErrorResponse
            ? error.status === 401 || error.status === 400 ? 'Usuario o contrasena incorrectos.'
              : error.status === 422 ? 'Revisa los datos de inicio de sesion.'
              : 'No fue posible conectar con el servicio de autenticacion. Intenta nuevamente.'
            : 'No fue posible iniciar sesion. La respuesta recibida no es valida o el servicio no esta disponible.';

          this.loginError.set(message);
        },
      });
  }

  protected get usuarioInvalid(): boolean {
    const control = this.form.controls.usuario;
    return control.touched && control.invalid;
  }

  protected get passwordInvalid(): boolean {
    const control = this.form.controls.password;
    return control.touched && control.invalid;
  }

  protected get objetivosCount(): number {
    return this.objetivosConfig.items.length;
  }
}
