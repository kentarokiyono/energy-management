"use strict";
/* ============ スカイドーム(グラデ+太陽+雲+星 / ドローコール1) ============ */
function makeSkyDome(){
const mat=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,
uniforms:{uTop:{value:new THREE.Color(0x2f7fc4)},uHor:{value:new THREE.Color(0xbdd7ea)},
uSunDir:{value:new THREE.Vector3(0,1,0)},uSunCol:{value:new THREE.Color(1.0,0.95,0.8)},
uCover:{value:0.22},uTime:{value:0},uNight:{value:0},uDust:{value:new THREE.Color(0.8,0.7,0.55)}},
vertexShader:"varying vec3 vDir;void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
fragmentShader:[
"uniform vec3 uTop;uniform vec3 uHor;uniform vec3 uSunCol;uniform vec3 uSunDir;",
"uniform float uCover;uniform float uTime;uniform float uNight;uniform vec3 uDust;varying vec3 vDir;",
"float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}",
"float vn(vec2 p){vec2 i=floor(p);vec2 f=fract(p);vec2 u=f*f*(3.0-2.0*f);",
"return mix(mix(hash(i),hash(i+vec2(1.,0.)),u.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),u.x),u.y);}",
"float fbm(vec2 p){float v=0.0;float a=0.5;for(int i=0;i<4;i++){v+=a*vn(p);p*=2.02;a*=0.5;}return v;}",
"void main(){",
"vec3 d=normalize(vDir);float h=clamp(d.y,0.0,1.0);",
"vec3 col=mix(uHor,uTop,pow(h,0.5));",
"if(d.y<0.0)col=uHor*(1.0+d.y*0.6);",
"col=mix(col,uDust,pow(1.0-h,7.0)*0.32*(1.0-uNight));",
"vec3 sd=normalize(uSunDir);float s=clamp(dot(d,sd),0.0,1.0);",
"col+=uSunCol*(smoothstep(0.9995,0.99975,s)*2.0+pow(s,90.0)*0.35+pow(s,10.0)*0.12)*(1.0-uNight*0.95);",
"if(d.y>0.02){vec2 uv=d.xz/(d.y+0.18)*0.9+vec2(uTime*0.006,uTime*0.0025);",
"float cl=fbm(uv*1.5);",
"float m=smoothstep(1.0-uCover,1.22-uCover,cl)*smoothstep(0.02,0.2,d.y);",
"float sh=0.78+0.22*smoothstep(0.0,0.25,cl-(1.0-uCover));",
"vec3 cc=mix(vec3(0.97,0.97,0.98)*sh,uHor,0.15)+uSunCol*pow(s,6.0)*0.15;",
"col=mix(col,cc,m*0.88);}",
"if(uNight>0.01&&d.y>0.0){float st=step(0.998,hash(floor(d.xz/(d.y+0.25)*300.0)));col+=vec3(0.8,0.9,1.0)*st*uNight*0.7;}",
"gl_FragColor=vec4(max(col,vec3(0.0)),1.0);}"
].join("\n")});
return new THREE.Mesh(new THREE.SphereGeometry(2200,32,15),mat);
}
