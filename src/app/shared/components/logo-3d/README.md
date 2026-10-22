# Logo3dComponent

`Logo3dComponent` es un componente Angular standalone y reutilizable para renderizar el logo institucional en 3D usando `Three.js`, `OBJLoader` y `MTLLoader`.

Está pensado para usarse en:
- Login
- Dashboard
- Navbar
- Pantallas institucionales
- Modales
- Pantallas de bienvenida
- Cualquier otro componente Angular

## Ubicación de archivos 3D

El componente usa por defecto estos recursos:

- OBJ: `public/assets/logo.3d/43964ae91bb2acbb84d662aa14da462a.obj`
- MTL: `public/assets/logo.3d/material.mtl`
- Texturas:
  - `texture_pbr_20250901.png`
  - `texture_pbr_20250901_metallic.png`
  - `texture_pbr_20250901_normal.png`
  - `texture_pbr_20250901_roughness.png`

## Uso básico

```html
<app-logo-3d></app-logo-3d>
```

## Uso recomendado con tamaño controlado por el componente padre

```html
<div class="logo-login">
  <app-logo-3d width="100%" height="100%"></app-logo-3d>
</div>
```

```scss
.logo-login {
  width: clamp(90px, 12vw, 180px);
  aspect-ratio: 1;
}
```

Esta es la forma recomendada cuando quieras que el componente se adapte al contenedor del login, sidebar o tarjeta.

## Tabla de configuración

| Propiedad | Tipo | Default | Descripción |
| --- | --- | --- | --- |
| `width` | `string` | `180px` | Ancho del host del componente. |
| `height` | `string` | `180px` | Alto del host del componente. |
| `autoRotate` | `boolean` | `true` | Activa rotación automática. |
| `rotationSpeed` | `number` | `0.003` | Velocidad de rotación sobre el eje Y. |
| `scale` | `number` | `1` | Escala adicional del modelo. |
| `cameraDistance` | `number` | `5` | Distancia de la cámara al modelo. |
| `transparentBackground` | `boolean` | `true` | Fondo transparente del canvas. |
| `enableMouseInteraction` | `boolean` | `false` | Activa interacción suave con el mouse. |
| `enableZoom` | `boolean` | `false` | Permite zoom cuando hay interacción de mouse. |
| `enablePan` | `boolean` | `false` | Permite paneo cuando hay interacción de mouse. |
| `ambientLightIntensity` | `number` | `1.5` | Intensidad de la luz ambiental. |
| `directionalLightIntensity` | `number` | `2` | Intensidad de la luz direccional principal. |
| `modelPath` | `string` | `/assets/logo.3d/43964ae91bb2acbb84d662aa14da462a.obj` | Ruta del archivo OBJ. |
| `materialPath` | `string` | `/assets/logo.3d/material.mtl` | Ruta del archivo MTL. |
| `initialRotationX` | `number` | `0` | Rotación inicial en X. |
| `initialRotationY` | `number` | `0` | Rotación inicial en Y. |
| `initialRotationZ` | `number` | `0` | Rotación inicial en Z. |

## Ejemplos

### Login

```html
<app-logo-3d width="160px" height="160px"></app-logo-3d>
```

### Logo grande

```html
<app-logo-3d
  width="300px"
  height="300px"
  [rotationSpeed]="0.002">
</app-logo-3d>
```

### Sin rotación

```html
<app-logo-3d [autoRotate]="false"></app-logo-3d>
```

### Con interacción

```html
<app-logo-3d
  [autoRotate]="true"
  [enableMouseInteraction]="true">
</app-logo-3d>
```

## Cómo cambiar tamaño

Puedes usar directamente los `@Input()` `width` y `height`, o envolver el componente en un contenedor responsive y pasar `width="100%" height="100%"`.

## Cómo cambiar velocidad

Modifica `rotationSpeed`.

## Cómo detener la rotación

Usa `[autoRotate]="false"`.

## Cómo activar interacción

Usa `[enableMouseInteraction]="true"`.

## Cómo cambiar escala

Usa `[scale]="1.2"` o el valor que necesites.

## Cómo cambiar posición

Usa `initialRotationX`, `initialRotationY` e `initialRotationZ` para ajustar la orientación inicial.

## Cómo cambiar cámara

Usa `cameraDistance`.

## Cómo modificar iluminación

Usa `ambientLightIntensity` y `directionalLightIntensity`.

## Cómo cambiar OBJ

Usa `modelPath` con la ruta al nuevo `.obj`.

## Cómo cambiar MTL

Usa `materialPath` con la ruta al nuevo `.mtl`.

## Cómo cambiar texturas

El componente carga las texturas PBR disponibles desde la misma carpeta del `.mtl`.
Si el `.mtl` no soporta todos los mapas, el componente aplica manualmente:

- `texture_pbr_20250901.png` -> base color
- `texture_pbr_20250901_normal.png` -> normalMap
- `texture_pbr_20250901_roughness.png` -> roughnessMap
- `texture_pbr_20250901_metallic.png` -> metalnessMap

## Cómo cambiar fondo

Usa `transparentBackground`.

## Integración en login

La forma recomendada es envolver el componente en una caja con tamaño responsive:

```html
<div class="login-logo-3d">
  <app-logo-3d width="100%" height="100%"></app-logo-3d>
</div>
```

```scss
.login-logo-3d {
  width: clamp(90px, 11vw, 180px);
  aspect-ratio: 1;
  flex-shrink: 0;
}
```

## Notas técnicas

- Usa un único renderer.
- Usa un único animation loop.
- Ajusta tamaño con `ResizeObserver`.
- Limita `pixelRatio` con `Math.min(window.devicePixelRatio, 2)`.
- Libera geometrías, materiales, texturas, controles y renderer en `ngOnDestroy()`.
- No modifica autenticación, JWT, servicios ni backend.
