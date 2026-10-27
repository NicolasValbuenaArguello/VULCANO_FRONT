/** Parametros visuales del terreno decorativo; no representan elevaciones reales. */
export interface TopographyConfig {
  color: string; lineCount: number; lineWidth: number; elevation: number;
  foreground: number; tilt: number; speed: number; direction: 'forward' | 'backward';
  glow: number; depthOfField: number; fog: number;
  hoverEffect: 'lift' | 'none'; clickEffect: 'pulse' | 'none';
  /** Opacidad visual y celdas por eje (64-192); ajustes opcionales por pantalla. */
  opacity?: number; detail?: number;
}

export const DEFAULT_TOPOGRAPHY_CONFIG: Readonly<TopographyConfig> = {
  color: '#858521', lineCount: 22, lineWidth: 1.2, elevation: 1, foreground: 0.2,
  tilt: 32, speed: 0.25, direction: 'forward', glow: 0.6, depthOfField: 0.4,
  fog: 0.35, hoverEffect: 'lift', clickEffect: 'pulse',
  opacity: 1, detail: 128,
};

/** Malla de triangulos generada por gl_VertexID: sin texturas, modelos ni descargas. */
export const TERRAIN_VERTEX = `#version 300 es
precision highp float;
uniform float uTime, uElevation, uTilt, uAspect, uDirection, uGrid;
uniform vec3 uPointer;
uniform vec3 uPulse;
out vec3 vWorld;
out float vDepth;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float noise(vec2 p) {
 vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
 return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
// Ruido fractal de cuatro octavas para relieve continuo, sin datos geograficos.
float terrain(vec2 p) {
 float h=0.0, a=0.65;
 for(int i=0;i<4;i++){ h+=a*noise(p); p=mat2(1.6,1.2,-1.2,1.6)*p+2.8; a*=0.48; }
 return h;
}
void main(){
 int cell=gl_VertexID/6, corner=gl_VertexID%6;
 vec2 offset=vec2(0);
 if(corner==1||corner==4||corner==5) offset.x=1.0;
 if(corner==2||corner==3||corner==5) offset.y=1.0;
 int count=int(uGrid);
 vec2 grid=(vec2(cell%count,cell/count)+offset)/uGrid;
 // El plano comienza detras del borde inferior y crece lateralmente con el frustum.
 // Distribucion cuadratica: mas detalle cerca de la camara sin estirar el canvas.
 float z=grid.y*grid.y*100.0-8.0;
 vec2 plane=vec2((grid.x-0.5)*(24.0+(z+8.0)*max(uAspect,1.0)*1.9),z);
 vec2 travel=plane+vec2(0,uTime*uDirection);
 float h=terrain(travel*0.18)*3.6*uElevation;
 float lift=exp(-dot(plane-uPointer.xy,plane-uPointer.xy)*0.09)*uPointer.z*0.85;
 float age=uPulse.z;
 float ring=exp(-pow((length(plane-uPulse.xy)-age*5.0)*2.3,2.0))*exp(-age*1.3);
 h+=lift+ring*0.65;
 vWorld=vec3(plane.x,h,plane.y);
 // Compensa seis grados para mantener el horizonte fuera del encuadre visible.
 float angle=radians(clamp(uTilt+6.0,30.0,65.0)), c=cos(angle), s=sin(angle);
 float depth=(plane.y+7.0)*c-(h-5.0)*s;
 float vertical=(h-5.0)*c+(plane.y+7.0)*s;
 vDepth=depth;
 gl_Position=vec4(plane.x*1.7/uAspect,vertical*1.7,depth*1.002-0.2,depth);
}`;

/** Curvas antialias, normales de superficie, luz, brillo y niebla en una sola pasada. */
export const TERRAIN_FRAGMENT = `#version 300 es
precision highp float;
in vec3 vWorld;
in float vDepth;
uniform vec3 uColor;
uniform float uLines,uWidth,uGlow,uFog,uFocus,uForeground;
out vec4 outColor;
void main(){
 float level=vWorld.y*uLines*0.3;
 float distanceToLine=abs(fract(level-0.5)-0.5);
 float pixel=max(fwidth(level),0.0001);
 float blur=1.0+uFocus*smoothstep(12.0,45.0,vDepth)*2.0;
 float stroke=1.0-smoothstep(pixel*uWidth*0.35,pixel*(uWidth*0.35+blur),distanceToLine);
 float halo=exp(-distanceToLine/max(pixel*5.0,0.003))*uGlow;
 vec3 normal=normalize(cross(dFdx(vWorld),dFdy(vWorld)));
 float light=0.25+0.75*abs(dot(normal,normalize(vec3(-0.6,1.0,-0.3))));
 float visibility=exp(-max(vDepth-3.0,0.0)*(0.035+uFog*0.07));
 float nearFade=mix(1.0,smoothstep(3.0,9.0,vDepth),uForeground);
 vec3 color=vec3(0.008,0.016,0.009)+uColor*(stroke*light+halo*0.4)*visibility*nearFade;
 outColor=vec4(color,1);
}`;
