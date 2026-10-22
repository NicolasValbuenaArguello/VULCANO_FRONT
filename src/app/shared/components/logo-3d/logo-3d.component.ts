import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostBinding,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
  inject,
} from '@angular/core';
import { MTLLoader, type MaterialCreator } from 'three/examples/jsm/loaders/MTLLoader.js';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import * as THREE from 'three';

type PbrTextures = {
  baseColor?: THREE.Texture;
  metallic?: THREE.Texture;
  normal?: THREE.Texture;
  roughness?: THREE.Texture;
};

type ModelLoadContext = {
  model: THREE.Group;
  textures: PbrTextures;
  materials: MaterialCreator | null;
};

type InteractiveOrbitControls = OrbitControls & {
  autoRotate: boolean;
  autoRotateSpeed: number;
};

@Component({
  selector: 'app-logo-3d',
  standalone: true,
  templateUrl: './logo-3d.component.html',
  styleUrl: './logo-3d.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Logo3dComponent implements AfterViewInit, OnChanges, OnDestroy {
  // ======================================================
  // INPUTS
  // ======================================================

  /**
   * Ancho del componente.
   * Puede recibir valores CSS como `180px`, `100%`, `clamp(...)` o `min(...)`.
   */
  @Input() width = '180px';

  /**
   * Alto del componente.
   * Puede recibir valores CSS como `180px`, `100%`, `clamp(...)` o `min(...)`.
   */
  @Input() height = '180px';

  /**
   * Activa la rotación automática sobre el eje Y.
   * Recomendado mantenerlo en `true` para pantallas institucionales.
   */
  @Input() autoRotate = true;

  /**
   * Velocidad de rotación automática sobre el eje Y.
   * Valores recomendados:
   *
   * 0.001 = muy lento
   * 0.003 = lento
   * 0.005 = normal
   * 0.01  = rápido
   */
  @Input() rotationSpeed = 0.003;

  /**
   * Habilita una interacción suave con el mouse y controles de órbita limitados.
   * Cuando está activo, también permite inclinación sutil del modelo.
   */
  @Input() enableMouseInteraction = true;

  /**
   * Permite que el fondo del canvas sea transparente.
   * Ideal para usar el logo sobre fondos, cards o banners.
   */
  @Input() transparentBackground = true;

  /**
   * Distancia de la cámara respecto al modelo.
   * Valores bajos acercan el logo, valores altos lo alejan.
   */
  @Input() cameraDistance = 5;

  /**
   * Escala adicional aplicada al modelo después de centrarlo.
   * Útil para ajustar el tamaño final sin tocar la geometría original.
   */
  @Input() scale = 1;

  /**
   * Rotación inicial en el eje X.
   * Úsalo para corregir modelos que estén acostados o inclinados.
   */
  @Input() initialRotationX = 0;

  /**
   * Rotación inicial en el eje Y.
   * Úsalo para orientar el frente del logo hacia la cámara.
   */
  @Input() initialRotationY = 0;

  /**
   * Rotación inicial en el eje Z.
   * Úsalo para corregir giros laterales del modelo.
   */
  @Input() initialRotationZ = 0;

  /**
   * Habilita el zoom de cámara cuando `enableMouseInteraction` está activo.
   */
  @Input() enableZoom = true;

  /**
   * Habilita el paneo de cámara cuando `enableMouseInteraction` está activo.
   */
  @Input() enablePan = true;

  /**
   * Distancia mínima permitida al acercar con zoom.
   */
  @Input() minZoomDistance = 2;

  /**
   * Distancia máxima permitida al alejar con zoom.
   */
  @Input() maxZoomDistance = 12;

  /**
   * Intensidad de la luz ambiental.
   * Valores mayores suavizan sombras; valores menores generan más contraste.
   */
  @Input() ambientLightIntensity = 1.5;

  /**
   * Intensidad de la luz direccional principal.
   * Ajusta el brillo frontal del logo.
   */
  @Input() directionalLightIntensity = 2;

  /**
   * Ruta del archivo OBJ principal.
   * Por defecto usa el modelo existente dentro de `public/assets/logo.3d/`.
   */
  @Input() modelPath = '/assets/logo.3d/43964ae91bb2acbb84d662aa14da462a.obj';

  /**
   * Ruta del archivo GLB optimizado que se intenta cargar primero.
   * Si se define, se usa como formato principal para mejorar el rendimiento.
   * Déjalo vacío si no tienes un GLB generado todavía.
   */
  @Input() glbPath = '';

  /**
   * Ruta del archivo MTL asociado al OBJ.
   * Debe apuntar al archivo de materiales existente.
   */
  @Input() materialPath = '/assets/logo.3d/material.mtl';

  // ======================================================
  // OUTPUTS
  // ======================================================

  /**
   * Se dispara cuando el modelo terminó de cargar y quedó listo para renderizarse.
   */
  @Output() modelLoaded = new EventEmitter<void>();

  /**
   * Se dispara cuando ocurre un error cargando el modelo o sus recursos.
   */
  @Output() modelError = new EventEmitter<unknown>();

  /**
 * Activa los controles para transformar directamente el modelo.
 */
@Input() enableTransformControls = false;

/**
 * Operación disponible:
 * translate = mover
 * rotate = rotar
 * scale = escalar
 */
@Input() transformMode: 'translate' | 'rotate' | 'scale' = 'translate';

/**
 * Ejes que estarán disponibles.
 */
@Input() transformX = true;
@Input() transformY = true;
@Input() transformZ = true;

/**
 * Tamaño visual del gizmo.
 */
@Input() transformControlSize = 0.8;
  // ======================================================
  // REFERENCIAS DOM
  // ======================================================

  @ViewChild('container', { static: true }) private readonly containerRef!: ElementRef<HTMLDivElement>;
  @ViewChild('canvas', { static: true }) private readonly canvasRef!: ElementRef<HTMLCanvasElement>;

  @HostBinding('style.display') protected readonly hostDisplay = 'block';
  @HostBinding('style.minWidth') protected readonly hostMinWidth = '0';
  @HostBinding('style.minHeight') protected readonly hostMinHeight = '0';
  @HostBinding('style.width')
  protected get hostWidth(): string {
    return this.width;
  }
  @HostBinding('style.height')
  protected get hostHeight(): string {
    return this.height;
  }

  protected loading = true;

  // ======================================================
  // SCENE / CAMERA / RENDERER
  // ======================================================

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly zone = inject(NgZone);
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private controls: InteractiveOrbitControls | null = null;
  private transformControls: TransformControls | null = null;

  // ======================================================
  // LIGHTS
  // ======================================================

  private ambientLight: THREE.AmbientLight | null = null;
  private frontLight: THREE.DirectionalLight | null = null;
  private rimLight: THREE.DirectionalLight | null = null;
  private fillLight: THREE.DirectionalLight | null = null;

  // ======================================================
  // LOADERS / MODEL
  // ======================================================

  private model: THREE.Group | null = null;
  private loadedTextures: THREE.Texture[] = [];
  private resizeObserver: ResizeObserver | null = null;
  private animationFrameId = 0;
  private hasInitialized = false;
  private modelBaseMaxDimension = 1;
  private isComponentVisible = true;
  private isPageVisible = true;
  private intersectionObserver: IntersectionObserver | null = null;
  private readonly baseRotation = new THREE.Euler(0, 0, 0);
  private readonly visibilityHandler = () => {
    this.isPageVisible = document.visibilityState === 'visible';
    this.syncRenderLoopState();
  };

  // ======================================================
  // CICLO DE VIDA
  // ======================================================

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      this.initializeScene();
      this.observeContainerResize();
      this.observeVisibility();
      this.syncInteractionMode();
      void this.loadModel();
      this.hasInitialized = true;
      this.syncRenderLoopState();
    });
  }
private setupTransformControls(): void {

  if (
    !this.enableTransformControls ||
    !this.camera ||
    !this.renderer ||
    !this.scene ||
    !this.model
  ) {
    return;
  }

  this.disposeTransformControls();

  this.transformControls = new TransformControls(
    this.camera,
    this.renderer.domElement
  );

  // Conectar el control al modelo
  this.transformControls.attach(this.model);

  // translate | rotate | scale
  this.transformControls.setMode(this.transformMode);

  // Tamaño del gizmo
  this.transformControls.setSize(
    this.transformControlSize
  );

  // Ejes disponibles
  this.transformControls.showX = this.transformX;
  this.transformControls.showY = this.transformY;
  this.transformControls.showZ = this.transformZ;

  // Muy importante:
  // mientras movemos el modelo, desactivar OrbitControls
  this.transformControls.addEventListener(
    'dragging-changed',
    (event: any) => {

      if (this.controls) {
        this.controls.enabled = !event.value;
      }

    }
  );

  // TransformControls moderno expone un helper visual.
  const helper = this.transformControls.getHelper();

  this.scene.add(helper);
}
private disposeTransformControls(): void {

  if (!this.transformControls) {
    return;
  }

  const helper =
    this.transformControls.getHelper();

  if (this.scene) {
    this.scene.remove(helper);
  }

  this.transformControls.detach();
  this.transformControls.dispose();

  this.transformControls = null;
}
  ngOnChanges(changes: SimpleChanges): void {
    if (!this.hasInitialized) {
      return;
    }

    if (
      changes['enableMouseInteraction'] ||
      changes['enableZoom'] ||
      changes['enablePan'] ||
      changes['minZoomDistance'] ||
      changes['maxZoomDistance']
    ) {
      this.syncInteractionMode();
    }

    if (changes['ambientLightIntensity'] || changes['directionalLightIntensity']) {
      this.syncLights();
    }

    if (changes['cameraDistance']) {
      this.syncCamera();
    }

    if (changes['transparentBackground']) {
      this.syncBackground();
    }

    if (changes['initialRotationX'] || changes['initialRotationY'] || changes['initialRotationZ']) {
      this.baseRotation.set(
        this.initialRotationX,
        this.initialRotationY,
        this.initialRotationZ,
      );

      if (this.model) {
        this.model.rotation.set(
          this.initialRotationX,
          this.initialRotationY,
          this.initialRotationZ,
        );
      }
    }

    if (changes['scale'] && this.model) {
      this.fitModelToCamera(this.model);
    }

    if (changes['modelPath'] || changes['materialPath'] || changes['glbPath']) {
      void this.loadModel();
    }
  }

  ngOnDestroy(): void {
    this.disposeAnimation();
    this.disposeControls();
    this.disposeModel();
    this.disposeScene();
    this.disposeVisibilityObservers();
  }

  // ======================================================
  // INICIALIZACIÓN DE ESCENA
  // ======================================================

  /**
   * Crea la escena Three.js, la cámara, el renderer y la iluminación base.
   */
  private initializeScene(): void {
    const canvas = this.canvasRef.nativeElement;

    THREE.Cache.enabled = true;
    this.scene = new THREE.Scene();
    this.scene.background = this.transparentBackground ? null : new THREE.Color(0x050805);

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    this.camera.position.set(0, 0.05, this.cameraDistance);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: this.transparentBackground,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, this.transparentBackground ? 0 : 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.createLights();
    this.syncCamera();
    this.syncBackground();
  }

  // ======================================================
  // CÁMARA
  // ======================================================

  /**
   * Ajusta la posición de la cámara según la distancia configurable.
   * MODIFICAR AQUÍ SI QUIERE CAMBIAR LA CÁMARA.
   */
  private syncCamera(): void {
    if (!this.camera) {
      return;
    }

    this.camera.position.set(0, 0.05, this.cameraDistance);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
  }

  // ======================================================
  // RENDERER
  // ======================================================

  /**
   * Actualiza el color de limpieza del renderer según el fondo transparente.
   * MODIFICAR AQUÍ SI QUIERE CAMBIAR EL FONDO.
   */
  private syncBackground(): void {
    if (!this.renderer) {
      return;
    }

    const alpha = this.transparentBackground ? 0 : 1;
    this.renderer.setClearColor(0x000000, alpha);

    if (this.scene) {
      this.scene.background = this.transparentBackground ? null : new THREE.Color(0x050805);
    }
  }

  // ======================================================
  // ILUMINACIÓN
  // ======================================================

  /**
   * Crea una iluminación equilibrada para resaltar volumen, relieve y materiales.
   * MODIFICAR AQUÍ SI QUIERE CAMBIAR LA ILUMINACIÓN.
   */
  private createLights(): void {
    if (!this.scene) {
      return;
    }

    this.ambientLight = new THREE.AmbientLight(0xffffff, this.ambientLightIntensity);

    this.frontLight = new THREE.DirectionalLight(0xffffff, this.directionalLightIntensity);
    this.frontLight.position.set(2.5, 3, 5);

    this.rimLight = new THREE.DirectionalLight(0xffffff, 0.7);
    this.rimLight.position.set(-4, 1.5, -2.5);

    this.fillLight = new THREE.DirectionalLight(0xdfe7c0, 0.55);
    this.fillLight.position.set(0, -2, 4);

    this.scene.add(this.ambientLight, this.frontLight, this.rimLight, this.fillLight);
  }

  /**
   * Reaplica intensidades de iluminación sin recrear las luces.
   */
  private syncLights(): void {
    if (this.ambientLight) {
      this.ambientLight.intensity = this.ambientLightIntensity;
    }

    if (this.frontLight) {
      this.frontLight.intensity = this.directionalLightIntensity;
    }
  }

  // ======================================================
  // INTERACCIÓN
  // ======================================================

  /**
   * Activa o desactiva OrbitControls y los eventos de mouse suave.
   * Cuando se habilita, permite zoom/pan sin bloquear el scroll de la página.
   */
  private syncInteractionMode(): void {
    this.disposeControls();
    if (!this.enableMouseInteraction || !this.camera || !this.renderer) {
      return;
    }

    this.controls = new OrbitControls(this.camera, this.renderer.domElement) as InteractiveOrbitControls;
    this.controls.enableDamping = true;
    this.controls.enableZoom = this.enableZoom;
    this.controls.enablePan = this.enablePan;
    this.controls.enableRotate = true;
    this.controls.autoRotate = this.autoRotate;
    this.controls.autoRotateSpeed = Math.max(this.rotationSpeed * 120, 0.15);
    this.controls.minDistance = Math.max(0.5, this.minZoomDistance);
    this.controls.maxDistance = Math.max(this.controls.minDistance + 0.1, this.maxZoomDistance);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  private disposeControls(): void {
    if (this.controls) {
      this.controls.dispose();
      this.controls = null;
    }
  }

  // ======================================================
  // LOADERS
  // ======================================================

  /**
   * Carga primero GLB si existe, y si no cae al flujo OBJ/MTL con texturas PBR.
   */
  private async loadModel(): Promise<void> {
    if (!this.scene || !this.renderer || !this.camera) {
      return;
    }

    this.loading = true;
    this.cdr.markForCheck();

    this.disposeModel();

    try {
      const loadContext = await this.fetchModelContext();
      this.model = loadContext.model;
      this.baseRotation.set(
        this.initialRotationX,
        this.initialRotationY,
        this.initialRotationZ,
      );

      this.prepareLoadedModel(loadContext);
      this.scene.add(this.model);
      this.fitModelToCamera(this.model);
      this.syncInteractionMode();
      this.syncRenderLoopState();

      if (loadContext.materials && !this.glbPath?.trim()) {
        void this.enhanceLoadedModelTextures(loadContext.materials);
      }

      this.loading = false;
      this.cdr.markForCheck();
      this.modelLoaded.emit();
    } catch (error) {
      console.error('Error cargando logo 3D', error);
      this.loading = false;
      this.cdr.markForCheck();
      this.modelError.emit(error);
    }
  }

  /**
   * Ejecuta la carga óptima del modelo:
   * primero GLB si se configuró y luego, como respaldo, OBJ/MTL.
   */
private async fetchModelContext(): Promise<ModelLoadContext> {

  if (this.glbPath?.trim()) {
    try {

      const model = await this.loadGlb(this.glbPath);

      return {
        model,
        textures: {},
        materials: null,
      };

    } catch (error) {

      console.warn(
        'No se pudo cargar GLB. Se utilizará OBJ.',
        error
      );

    }
  }

  const basePath =
    this.getBaseDirectory(this.materialPath);

  const [materialCreator, textures] =
    await Promise.all([

      this.loadMaterials(this.materialPath)
        .catch((error) => {

          console.warn(
            '⚠️ MTL no disponible. Se utilizarán materiales PBR manuales.',
            error
          );

          return null;

        }),

      this.loadPbrTextures(basePath)
        .catch((error) => {

          console.error(
            '❌ Error cargando texturas PBR',
            error
          );

          return {};

        }),

    ]);

  if (materialCreator) {
    materialCreator.preload();
  }

  const model = await this.loadObj(
    this.modelPath,
    materialCreator
  );

  return {
    model,
    textures,          // ✅ IMPORTANTE
    materials: materialCreator,
  };
}

  /**
   * Carga las texturas PBR en segundo plano y las aplica cuando ya existe el modelo.
   */
  private async enhanceLoadedModelTextures(materialCreator: MaterialCreator): Promise<void> {
    if (!this.model || this.glbPath?.trim()) {
      return;
    }

    const textures = await this.loadPbrTextures(this.getBaseDirectory(this.materialPath)).catch(
      (error) => {
        console.error('Error cargando logo 3D', error);
        return null;
      },
    );

    if (!textures || !this.model) {
      return;
    }

    this.applyPbrTexturesToModel(this.model, textures, materialCreator);
    this.cdr.markForCheck();
  }

  /**
   * Carga un GLB optimizado cuando está disponible.
   */
  private loadGlb(path: string): Promise<THREE.Group> {
    return new Promise((resolve, reject) => {
      const loader = new GLTFLoader();
      const basePath = this.getBaseDirectory(path);
      loader.setPath(basePath);
      loader.load(
        path,
        (gltf: GLTF) => resolve(gltf.scene),
        undefined,
        (error: unknown) => reject(error),
      );
    });
  }

  /**
   * Carga el archivo MTL y prepara sus materiales para el OBJLoader.
   */
private loadMaterials(path: string): Promise<MaterialCreator> {
  return new Promise((resolve, reject) => {

    const loader = new MTLLoader();

    const basePath = this.getBaseDirectory(path);
    const fileName = path.split('/').pop() ?? path;

    loader.setPath(basePath);
    loader.setResourcePath(basePath);

    console.log('📁 Ruta MTL:', basePath);
    console.log('📄 Archivo MTL:', fileName);

    loader.load(
      fileName,

      (materials: MaterialCreator) => {

        console.log('✅ MTL cargado correctamente');

        materials.preload();

        resolve(materials);
      },

      undefined,

      (error: unknown) => {

        console.error(
          '❌ Error cargando MTL:',
          `${basePath}${fileName}`,
          error
        );

        reject(error);
      }
    );

  });
}

  /**
   * Carga el OBJ principal del logo.
   */
  private loadObj(path: string, materials: MaterialCreator | null): Promise<THREE.Group> {
    return new Promise((resolve, reject) => {
      const loader = new OBJLoader();

      if (materials) {
        loader.setMaterials(materials);
      }

      loader.load(
        path,
        (object: THREE.Group) => resolve(object),
        undefined,
        (error: unknown) => reject(error),
      );
    });
  }

  /**
   * Carga manualmente las texturas PBR del logo.
   * Si el MTL no soporta mapas PBR, estas texturas se usan como respaldo.
   */
  private async loadPbrTextures(basePath: string): Promise<PbrTextures> {
    const loader = new THREE.TextureLoader();

    const [baseColor, metallic, normal, roughness] = await Promise.all([
      this.loadTexture(loader, `${basePath}texture_pbr_20250901.png`, true),
      this.loadTexture(loader, `${basePath}texture_pbr_20250901_metallic.png`),
      this.loadTexture(loader, `${basePath}texture_pbr_20250901_normal.png`),
      this.loadTexture(loader, `${basePath}texture_pbr_20250901_roughness.png`),
    ]);

    return {
      baseColor,
      metallic,
      normal,
      roughness,
    };
  }

  /**
   * Convierte una carga de textura basada en promesa.
   */
  private loadTexture(
    loader: THREE.TextureLoader,
    path: string,
    isColorTexture = false,
  ): Promise<THREE.Texture> {
    return new Promise((resolve, reject) => {
      loader.load(
        path,
        (texture: THREE.Texture) => {
          if (isColorTexture) {
            texture.colorSpace = THREE.SRGBColorSpace;
          }

          texture.needsUpdate = true;
          this.loadedTextures.push(texture);
          resolve(texture);
        },
        undefined,
        (error: unknown) => reject(error),
      );
    });
  }

  // ======================================================
  // MODELO / MATERIALS
  // ======================================================

  /**
   * Centra el modelo, corrige su escala y aplica materiales PBR.
   * MODIFICAR AQUÍ SI QUIERE CAMBIAR LA POSICIÓN INICIAL.
   */
  private prepareLoadedModel(context: ModelLoadContext): void {
    const { model, textures } = context;
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDimension = Math.max(size.x, size.y, size.z) || 1;

    model.position.sub(center);
    model.rotation.set(
      this.initialRotationX,
      this.initialRotationY,
      this.initialRotationZ,
    );
    this.modelBaseMaxDimension = maxDimension;

    model.traverse((child: THREE.Object3D) => {
      if (!(child instanceof THREE.Mesh)) {
        return;
      }

      child.frustumCulled = true;
    });

    if (textures.baseColor || textures.metallic || textures.normal || textures.roughness) {
      this.applyPbrTexturesToModel(model, textures, context.materials);
    }
  }

  /**
   * Reemplaza los materiales del modelo por una versión PBR cuando ya se cargaron las texturas.
   */
  private applyPbrTexturesToModel(
    model: THREE.Group,
    textures: PbrTextures,
    sourceMaterials: MaterialCreator | null,
  ): void {
    model.traverse((child: THREE.Object3D) => {
      if (!(child instanceof THREE.Mesh)) {
        return;
      }

      const sourceMaterial = this.getFirstMaterial(child.material);
      const pbrMaterial = this.createPbrMaterial(sourceMaterial, textures);

      if (sourceMaterials) {
        pbrMaterial.name = sourceMaterial?.name ?? pbrMaterial.name;
      }

      child.material = pbrMaterial;
      child.frustumCulled = true;
    });
  }

  /**
   * Recalcula el tamaño del logo para mantenerlo centrado y legible en cualquier contenedor.
   */
  private fitModelToCamera(model: THREE.Group): void {
    if (!this.camera) {
      return;
    }

    const bounds = new THREE.Box3().setFromObject(model);
    const center = bounds.getCenter(new THREE.Vector3());
    const scaleFactor = (2.2 / this.modelBaseMaxDimension) * this.scale;

    model.position.sub(center);
    model.scale.setScalar(scaleFactor);

    const distance = Math.max(this.cameraDistance, this.modelBaseMaxDimension * 0.9);
    this.camera.position.set(0, 0.05, distance);
    this.camera.lookAt(0, 0, 0);

    if (this.controls) {
      this.controls.target.set(0, 0, 0);
      this.controls.minDistance = Math.max(0.5, this.minZoomDistance);
      this.controls.maxDistance = Math.max(this.controls.minDistance + 0.1, this.maxZoomDistance);
      this.controls.enableZoom = this.enableZoom;
      this.controls.enablePan = this.enablePan;
      this.controls.enableRotate = this.enableMouseInteraction;
      this.controls.autoRotate = this.autoRotate;
      this.controls.update();
    }
  }

  /**
   * Crea un material PBR moderno para el logo 3D.
   */
  private createPbrMaterial(
    sourceMaterial: THREE.Material | null,
    textures: PbrTextures,
  ): THREE.MeshStandardMaterial {
    const materialSource = sourceMaterial as THREE.Material & {
      color?: THREE.Color;
      map?: THREE.Texture | null;
      opacity?: number;
      transparent?: boolean;
      emissive?: THREE.Color;
    };

    const material = new THREE.MeshStandardMaterial({
      color: materialSource.color?.clone() ?? new THREE.Color(0xffffff),
      map: textures.baseColor ?? materialSource.map ?? null,
      normalMap: textures.normal ?? null,
      roughnessMap: textures.roughness ?? null,
      metalnessMap: textures.metallic ?? null,
      metalness: 1,
      roughness: 1,
      side: THREE.FrontSide,
    });

    if (sourceMaterial) {
      material.name = sourceMaterial.name;
      if (typeof materialSource.opacity === 'number') {
        material.opacity = materialSource.opacity;
        material.transparent = materialSource.transparent ?? false;
      }

      if (materialSource.emissive) {
        material.emissive = materialSource.emissive.clone();
      }
    }

    return material;
  }

  /**
   * Obtiene el primer material cuando el OBJ carga múltiples materiales por malla.
   */
  private getFirstMaterial(
    material: THREE.Material | THREE.Material[] | null,
  ): THREE.Material | null {
    if (!material) {
      return null;
    }

    return Array.isArray(material) ? material[0] ?? null : material;
  }

  // ======================================================
  // RESIZE
  // ======================================================

  /**
   * Observa cambios en el contenedor para ajustar cámara, renderer y proporción.
   * Se usa ResizeObserver para reaccionar también a Grid, Flexbox, sidebar y rotación.
   */
  private observeContainerResize(): void {
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', this.handleWindowResize);
      return;
    }

    this.resizeObserver = new ResizeObserver(() => {
      this.syncSize();
    });

    this.resizeObserver.observe(this.containerRef.nativeElement);
    this.syncSize();
  }

  private readonly handleWindowResize = (): void => {
    this.syncSize();
  };

  /**
   * Ajusta el renderer y la cámara al tamaño real del contenedor.
   */
  private syncSize(): void {
    const container = this.containerRef?.nativeElement;
    const camera = this.camera;
    const renderer = this.renderer;

    if (!container || !camera || !renderer) {
      return;
    }

    const rect = container.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
  }

  // ======================================================
  // VISIBILIDAD
  // ======================================================

  /**
   * Pausa el render cuando el componente sale de pantalla o la pestaña se oculta.
   */
  private observeVisibility(): void {
    document.addEventListener('visibilitychange', this.visibilityHandler);

    if (typeof IntersectionObserver === 'undefined') {
      return;
    }

    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        this.isComponentVisible = !!entry?.isIntersecting && (entry?.intersectionRatio ?? 0) > 0.01;
        this.syncRenderLoopState();
      },
      {
        threshold: [0.01, 0.1],
      },
    );

    this.intersectionObserver.observe(this.containerRef.nativeElement);
  }

  /**
   * Inicia o detiene el loop según la visibilidad real del componente.
   */
  private syncRenderLoopState(): void {
    const shouldAnimate = this.isPageVisible && this.isComponentVisible && !!this.scene && !!this.camera && !!this.renderer;

    if (shouldAnimate) {
      if (!this.animationFrameId) {
        this.startAnimationLoop();
      }
      return;
    }

    this.disposeAnimation();
  }

  // ======================================================
  // ANIMATION
  // ======================================================

  /**
   * Inicia el loop de render único del componente.
   */
  private startAnimationLoop(): void {
    if (!this.scene || !this.camera || !this.renderer) {
      return;
    }

    const tick = () => {
      if (!this.scene || !this.camera || !this.renderer) {
        this.animationFrameId = 0;
        return;
      }

      if (this.controls) {
        this.controls.update();
      }

      this.renderer.render(this.scene, this.camera);
      this.animationFrameId = window.requestAnimationFrame(tick);
    };

    this.animationFrameId = window.requestAnimationFrame(tick);
  }

  // ======================================================
  // MEMORY CLEANUP
  // ======================================================

  /**
   * Cancela el loop de animación.
   */
  private disposeAnimation(): void {
    if (this.animationFrameId) {
      window.cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = 0;
    }
  }

  /**
   * Elimina listeners y observadores que controlan el render por visibilidad.
   */
  private disposeVisibilityObservers(): void {
    document.removeEventListener('visibilitychange', this.visibilityHandler);

    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
      this.intersectionObserver = null;
    }

    this.isComponentVisible = true;
    this.isPageVisible = true;
  }

  /**
   * Libera el modelo, sus materiales y sus geometrías.
   */
  private disposeModel(): void {
    if (!this.scene || !this.model) {
      this.baseRotation.set(this.initialRotationX, this.initialRotationY, this.initialRotationZ);
      return;
    }

    this.scene.remove(this.model);

    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>(this.loadedTextures);

    this.model.traverse((child: THREE.Object3D) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();

        const meshMaterials = Array.isArray(child.material) ? child.material : [child.material];
        meshMaterials.forEach((material: THREE.Material) => {
          if (!material) {
            return;
          }

          materials.add(material);

          for (const value of Object.values(material)) {
            if (value instanceof THREE.Texture) {
              textures.add(value);
            }
          }
        });
      }
    });

    materials.forEach((material) => material.dispose());
    textures.forEach((texture) => texture.dispose());
    this.loadedTextures = [];
    this.model = null;
    this.modelBaseMaxDimension = 1;
    this.baseRotation.set(this.initialRotationX, this.initialRotationY, this.initialRotationZ);
  }

  /**
   * Libera la escena, la cámara y el renderer WebGL.
   */
  private disposeScene(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    } else {
      window.removeEventListener('resize', this.handleWindowResize);
    }

    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss?.();
      this.renderer = null;
    }

    if (this.scene) {
      this.scene.clear();
      this.scene = null;
    }

    this.camera = null;
    this.ambientLight = null;
    this.frontLight = null;
    this.rimLight = null;
    this.fillLight = null;
  }

  // ======================================================
  // UTILIDADES
  // ======================================================

  /**
   * Devuelve la carpeta base de una ruta para resolver recursos relacionados.
   */
  private getBaseDirectory(path: string): string {
    const normalized = path.replace(/\\/g, '/');
    const index = normalized.lastIndexOf('/');
    return index >= 0 ? normalized.slice(0, index + 1) : '';
  }
  
}
