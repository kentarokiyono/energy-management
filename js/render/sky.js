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
"col+=uSunCol*(smoothstep(0.9995,0.99975,s)*2.0+pow(s,600.0)*0.9+pow(s,90.0)*0.35+pow(s,10.0)*0.14+pow(s,3.0)*0.10*(1.0-h))*(1.0-uNight*0.95);",
"if(d.y>0.03){vec2 cu=d.xz/(d.y+0.35);float ci=fbm(cu*vec2(0.9,3.2)+vec2(uTime*0.0015,0.0)+fbm(cu*0.7)*1.3);",
"col=mix(col,mix(vec3(1.0),uSunCol,0.25)*(0.92+0.25*pow(s,4.0)),smoothstep(0.52,0.86,ci)*0.30*smoothstep(0.03,0.3,d.y)*(1.0-uNight));}",
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
/* ============ 遠くの山並み (地平線の上の稜線。もやで霞む) ============
 視点のまわりの円筒。稜線の形は方角で決まり、走ると少しずつ変わる。高さは土地の起伏 (uHill) に合わせる */
function makeFarRidge(R){
const mat=new THREE.ShaderMaterial({side:THREE.BackSide,transparent:true,depthWrite:false,
uniforms:{uCol:{value:new THREE.Color(0x7a5a48)},uHaze:{value:new THREE.Color(0xbdd7ea)},uHill:{value:0},uShift:{value:0},uR:{value:R}},
vertexShader:[
"uniform float uHill;uniform float uShift;uniform float uR;varying float vT;varying float vH;",
"float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}",
"float vn(vec2 p){vec2 i=floor(p);vec2 f=fract(p);vec2 u=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),u.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),u.x),u.y);}",
"void main(){vec3 p=position;float a=atan(p.z,p.x);vec2 q=vec2(cos(a),sin(a))*3.0;",
"float n=vn(q*1.3+uShift)*0.6+vn(q*3.1+uShift*1.7+7.0)*0.28+vn(q*8.0+uShift*2.3+3.0)*0.12;",
"float gap=smoothstep(0.35,0.6,vn(q*0.7+uShift*0.6+11.0));",   // 山のない方角もある
"float h=uR*0.07*uHill*max(0.0,n-0.28)*gap;vT=uv.y;vH=h;",
"p.y=mix(-uR*0.012,h,uv.y);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);}"].join("\n"),
fragmentShader:[
"uniform vec3 uCol;uniform vec3 uHaze;varying float vT;varying float vH;",
"void main(){if(vH<0.5)discard;vec3 c=mix(uHaze,uCol,0.46+0.12*vT);gl_FragColor=vec4(c,0.95);}"].join("\n")});
const g=new THREE.CylinderGeometry(R,R,1,192,1,true); const m=new THREE.Mesh(g,mat); m.frustumCulled=false; m.renderOrder=-1; return m;
}
