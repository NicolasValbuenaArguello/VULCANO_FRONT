declare module 'three/examples/jsm/loaders/MTLLoader.js' {
  import * as THREE from 'three';

  export interface MaterialCreator {
    preload(): void;
  }

  export class MTLLoader {
    constructor(manager?: THREE.LoadingManager);
    setPath(path: string): this;
    setResourcePath(path: string): this;
    load(
      url: string,
      onLoad: (materials: MaterialCreator) => void,
      onProgress?: (event: ProgressEvent<EventTarget>) => void,
      onError?: (error: unknown) => void,
    ): void;
  }
}

declare module 'three/examples/jsm/loaders/OBJLoader.js' {
  import * as THREE from 'three';
  import type { MaterialCreator } from 'three/examples/jsm/loaders/MTLLoader.js';

  export class OBJLoader {
    constructor(manager?: THREE.LoadingManager);
    setPath(path: string): this;
    setMaterials(materials: MaterialCreator): this;
    load(
      url: string,
      onLoad: (object: THREE.Group) => void,
      onProgress?: (event: ProgressEvent<EventTarget>) => void,
      onError?: (error: unknown) => void,
    ): void;
  }
}

declare module 'three/examples/jsm/controls/OrbitControls.js' {
  import * as THREE from 'three';

  export class OrbitControls {
    constructor(object: THREE.Camera, domElement: HTMLElement);
    enabled: boolean;
    enableDamping: boolean;
    enableZoom: boolean;
    enablePan: boolean;
    enableRotate: boolean;
    minDistance: number;
    maxDistance: number;
    target: THREE.Vector3;
    update(): void;
    dispose(): void;
  }
}

declare module 'three/examples/jsm/loaders/GLTFLoader.js' {
  import * as THREE from 'three';

  export interface GLTF {
    scene: THREE.Group;
  }

  export class GLTFLoader {
    constructor(manager?: THREE.LoadingManager);
    setPath(path: string): this;
    load(
      url: string,
      onLoad: (gltf: GLTF) => void,
      onProgress?: (event: ProgressEvent<EventTarget>) => void,
      onError?: (error: unknown) => void,
    ): void;
  }
}
