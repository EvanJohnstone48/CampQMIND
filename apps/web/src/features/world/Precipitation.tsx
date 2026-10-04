import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { hash, terrainHeight } from './landscape';
import type { WeatherView } from './weather';

/** GPU particles follow the presentation clock, including pause and playback speed. */
export function Precipitation({ weather, elapsed }: { weather: WeatherView; elapsed: number }) {
  const snow = weather.kind === 'snow';
  const assets = useMemo(() => {
    const positions: number[] = [], seeds: number[] = [], tips: number[] = [];
    for (let i = 0; i < 1100; i++) {
      const x = -37 + hash(i + 83) * 72, z = -23 + hash(i + 5083) * 64;
      for (let tip = 0; tip < (snow ? 1 : 2); tip++) {
        positions.push(x, terrainHeight(x, z) + 0.2, z); seeds.push(hash(i + 2083)); tips.push(tip);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('seed', new THREE.Float32BufferAttribute(seeds, 1));
    geometry.setAttribute('tip', new THREE.Float32BufferAttribute(tips, 1));
    const material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { time: { value: elapsed }, snow: { value: snow ? 1 : 0 } },
      vertexShader: `attribute float seed; attribute float tip; uniform float time; uniform float snow; varying float alpha;
        void main() {
          float phase = fract(seed - time * mix(.43, .055, snow));
          vec3 p = position; p.y += phase * 28. + tip * .65;
          p.x += sin(time * .5 + seed * 90.) * snow * 1.2 + phase * mix(3., 1., snow) + tip * .08;
          vec4 view = modelViewMatrix * vec4(p, 1.);
          alpha = smoothstep(0., .08, phase) * (1. - smoothstep(.92, 1., phase));
          gl_Position = projectionMatrix * view;
          gl_PointSize = clamp(130. / max(1., -view.z), 1.5, 6.);
        }`,
      fragmentShader: `uniform float snow; varying float alpha;
        void main() { float shape = 1.;
          ${snow ? 'shape = 1. - smoothstep(.25, .5, length(gl_PointCoord - .5));' : ''}
          gl_FragColor = vec4(mix(vec3(.65,.81,.85),vec3(.98,.99,1.),snow), alpha * shape * mix(.5,.85,snow)); }`,
    });
    return { geometry, material };
    // Geometry changes only when switching particle shape.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snow]);
  useEffect(() => () => { assets.geometry.dispose(); assets.material.dispose(); }, [assets]);
  useFrame(() => { assets.material.uniforms.time.value = elapsed; });
  if (weather.kind !== 'rain' && !snow) return null;
  return snow ? <points {...assets} frustumCulled={false} raycast={() => {}} /> : <lineSegments {...assets} frustumCulled={false} raycast={() => {}} />;
}
