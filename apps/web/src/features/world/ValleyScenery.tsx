import { memo } from 'react';
import * as THREE from 'three';
import { millrace, siteFootprints } from '../../net/demoMap';
import { terrainSurfaceHeight } from './landscape';

const blockGeometry = new THREE.BoxGeometry();
const materials = new Map<string, THREE.MeshStandardMaterial>();
function Block({ position, scale, color, rotation = 0 }: {
  position: [number, number, number]; scale: [number, number, number]; color: string; rotation?: number;
}) {
  if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.95 }));
  return <mesh position={position} scale={scale} rotation={[0, rotation, 0]} geometry={blockGeometry} material={materials.get(color)} dispose={null} castShadow receiveShadow />;
}

function Fence({ points, stone = false }: { points: readonly (readonly number[])[]; stone?: boolean }) {
  return <>{points.slice(1).flatMap((b, i) => {
    const a = points[i], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const count = Math.ceil(length / (stone ? 0.8 : 2));
    return Array.from({ length: count }, (_, j) => {
      const t = (j + 0.5) / count, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
      return <group key={`${i}:${j}`} position={[x, terrainSurfaceHeight(x, z), z]} rotation={[0, Math.atan2(b[0] - a[0], b[1] - a[1]), 0]}>
        {stone ? <Block position={[0, 0.38, 0]} scale={[0.4, 0.76, length / count + 0.035]} color={j % 2 ? '#a4ad98' : '#929e8c'} /> : <>
          <Block position={[0, 0.48, -length / count / 2]} scale={[0.12, 0.96, 0.12]} color="#ad8c5b" />
          {[0.35, 0.7].map(y => <Block key={y} position={[0, y, 0]} scale={[0.075, 0.09, length / count]} color="#c4a477" />)}
        </>}
      </group>;
    });
  })}</>;
}

/** Landmarks belong to a route, shoreline, grazing area or working yard. */
export const ValleyScenery = memo(function ValleyScenery() {
  return <>
    {siteFootprints.filter(s => s.id === 'copper' || s.id === 'gold').map(site => <group key={site.id}>
      <group position={[site.position[0], site.elevation, site.position[1]]}>
        <Block position={[0, 0.014, 2]} scale={[14, 0.028, 6.7]} color="#c2b69a" />
        {[-6.7, 7.6].map(x => <group key={x}>
          {Array.from({ length: 8 }, (_, i) => <Block key={i} position={[x, 0.48, -5.9 + i * 0.7]} scale={[0.42, 0.96, 0.66]} color={i % 2 ? '#9fa899' : '#8f9d8c'} />)}
        </group>)}
        {[-5.7, 5.7].map(x => <group key={x} position={[x, 0, 5.3]}>
          <Block position={[0, 0.65, 0]} scale={[0.12, 1.3, 0.12]} color="#957451" />
          <Block position={[0, 1.1, 0]} scale={[0.7, 0.4, 0.08]} color="#e4bd68" />
          <Block position={[0, 1.1, 0.055]} scale={[0.4, 0.07, 0.03]} color="#645c46" />
        </group>)}
      </group>
    </group>)}

    {/* A small millrace feeds the existing wheel, then returns to the river. */}
    {millrace.slice(1).map((b, i) => {
      const a = millrace[i], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      return <group key={i} position={[(a[0] + b[0]) / 2, 0.69, (a[1] + b[1]) / 2]} rotation={[0, Math.atan2(b[0] - a[0], b[1] - a[1]), 0]}>
        {[-0.64, 0.64].map(x => <Block key={x} position={[x, 0.08, 0]} scale={[0.22, 0.48, length]} color="#a5b0a0" />)}
      </group>;
    })}

    {/* The path from the south village street ends at a lakeside landing. */}
    <group position={[-10.5, 0.98, 25]} rotation={[0, Math.PI / 4, 0]}>
      {Array.from({ length: 12 }, (_, i) => <Block key={i} position={[0, 0, i * 0.27]} scale={[1.5, 0.12, 0.25]} color={i % 2 ? '#bda276' : '#a98b60'} />)}
      {[-0.67, 0.67].flatMap(x => [0.2, 2.8].map(z => <Block key={`${x}:${z}`} position={[x, -0.43, z]} scale={[0.14, 1.05, 0.14]} color="#8c7552" />))}
      <Block position={[-0.7, 0.4, 1.55]} scale={[0.08, 0.08, 3.2]} color="#8c7552" />
    </group>
    <Fence points={[[-26, 29], [-26, 34], [-15, 34], [-15, 24], [-18, 24]]} />
    <Fence points={[[25.8, 7.5], [27.5, 12], [27.5, 19], [23, 20.5]]} stone />

    {/* Simple remote shelters anchor the hiking trails outside the active town. */}
    {[[-49, 42], [38, 38]].map(([x, z], i) => <group key={i} position={[x, terrainSurfaceHeight(x, z), z]}>
      <Block position={[0, 0.85, 0]} scale={[2.5, 1.7, 2.1]} color="#ab8e65" />
      <mesh position={[0, 2, 0]} rotation={[0, Math.PI / 4, 0]} castShadow><coneGeometry args={[2.3, 1.2, 4]} /><meshStandardMaterial color={i ? '#8f7359' : '#9c6852'} /></mesh>
      <Block position={[0, 0.6, 1.06]} scale={[0.65, 1.2, 0.06]} color="#665b47" />
      <Block position={[-0.9, 2.25, -0.45]} scale={[0.28, 1.1, 0.28]} color="#9da593" />
      <Block position={[2.5, 0.47, 1]} scale={[1.65, 0.14, 0.45]} color="#a48a61" />
      {[-0.55, 0.55].map(dx => <Block key={dx} position={[2.5 + dx, 0.2, 1]} scale={[0.13, 0.5, 0.35]} color="#8e7854" />)}
    </group>)}
  </>;
});
