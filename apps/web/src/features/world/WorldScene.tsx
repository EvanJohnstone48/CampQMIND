import { Component, memo, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode, ElementRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, Line, OrbitControls, Stars } from '@react-three/drei';
import * as THREE from 'three';
import type { BuildingView, MinerView, Place, Point, WorldView } from '../../net/world';
import { pointOnRoute } from '../../net/world';
import { AlpineLandscape } from './AlpineLandscape';
import { hash, terrainHeight, walkHeight } from './landscape';
import { boundedPoint, OVERVIEW } from './camera';
import type { WeatherView } from './weather';
import { Precipitation } from './Precipitation';
import { mineEntrances } from '../../net/demoMap';

const noRaycast = () => {};
const boxGeometry = new THREE.BoxGeometry();
const boxMaterials = new Map<string, THREE.MeshStandardMaterial>();
type Focus = { point: Point; serial: number; overview?: boolean; offset?: readonly [number, number, number] };

function Box({ position, scale, color, rotation = 0, glow = false, shadow = true }: {
  position: [number, number, number]; scale: [number, number, number]; color: string; rotation?: number; glow?: boolean; shadow?: boolean;
}) {
  const key = color + glow;
  if (!boxMaterials.has(key)) boxMaterials.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.9, emissive: glow ? color : '#000', emissiveIntensity: glow ? 0.75 : 0 }));
  return <mesh geometry={boxGeometry} material={boxMaterials.get(key)} dispose={null} position={position} scale={scale} rotation={[0, rotation, 0]} castShadow={shadow} receiveShadow />;
}

const House = memo(function House({ x, z, size = 1, roof = '#b2694e', lit }: { x: number; z: number; size?: number; roof?: string; lit: boolean }) {
  const roofGeometry = useMemo(() => {
    const vertices = [-1.3, 1.8, -1.2, -1.3, 1.8, 1.2, 0, 2.75, 1.2, -1.3, 1.8, -1.2, 0, 2.75, 1.2, 0, 2.75, -1.2,
      0, 2.75, -1.2, 0, 2.75, 1.2, 1.3, 1.8, 1.2, 0, 2.75, -1.2, 1.3, 1.8, 1.2, 1.3, 1.8, -1.2,
      -1.3, 1.8, 1.2, 1.3, 1.8, 1.2, 0, 2.75, 1.2, 1.3, 1.8, -1.2, -1.3, 1.8, -1.2, 0, 2.75, -1.2];
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); g.computeVertexNormals(); return g;
  }, []);
  useEffect(() => () => roofGeometry.dispose(), [roofGeometry]);
  return <group position={[x, 0, z]} scale={size}>
    <Box position={[0, 0.12, 0]} scale={[2.2, 0.24, 1.95]} color="#a8a495" />
    <Box position={[0, 0.82, 0]} scale={[1.95, 1.45, 1.75]} color="#f3e5bf" />
    <Box position={[0, 1.65, 0]} scale={[2, 0.38, 1.8]} color="#875e3e" />
    <mesh geometry={roofGeometry} castShadow receiveShadow>
      <meshStandardMaterial color={roof} side={THREE.DoubleSide} roughness={0.9} />
    </mesh>
    <Box position={[0, 0.45, 0.87]} scale={[0.45, 0.9, 0.05]} color="#725743" />
    <Box position={[0, 0.07, 1.12]} scale={[0.72, 0.14, 0.5]} color="#b7b6a3" />
    <Box position={[0, 0.04, 1.46]} scale={[0.86, 0.08, 0.22]} color="#c3c2ad" />
    {[-0.96, 0.96].map(side => <group key={side}>
      <Box position={[side, 0.95, 0]} scale={[0.035, 0.5, 0.42]} color={lit ? '#ffd785' : '#80bfc5'} glow={lit} shadow={false} />
      <Box position={[side, 1.05, 0]} scale={[0.06, 0.035, 0.44]} color="#efe2be" shadow={false} />
    </group>)}
    {Array.from({ length: 5 }, (_, i) => <Box key={i} position={[0, 1.53 + i * 0.06, -0.92]} scale={[2, 0.023, 0.03]} color="#bc9465" shadow={false} />)}
    {[-0.65, 0.65].map(wx => <group key={wx}>
      <Box position={[wx, 1.05, 0.89]} scale={[0.4, 0.5, 0.06]} color={lit ? '#ffd785' : '#80bfc5'} glow={lit} shadow={false} />
      {[-0.28, 0.28].map(side => <Box key={side} position={[wx + side, 1.05, 0.9]} scale={[0.12, 0.55, 0.06]} color="#467c63" shadow={false} />)}
      <Box position={[wx, 0.75, 1.01]} scale={[0.53, 0.15, 0.23]} color="#8c6147" shadow={false} />
      {[-0.17, 0, 0.17].map(fx => <mesh key={fx} position={[wx + fx, 0.89, 1.05]}><icosahedronGeometry args={[0.1]} /><meshStandardMaterial color={fx === 0 ? '#f2cd66' : '#d7677b'} /></mesh>)}
    </group>)}
    <Box position={[0, 1.42, 1.1]} scale={[2.25, 0.13, 0.5]} color="#9c7550" />
    <Box position={[0, 1.78, 1.32]} scale={[2.25, 0.1, 0.1]} color="#805d3e" shadow={false} />
    {[-0.9, -0.45, 0, 0.45, 0.9].map(bx => <Box key={bx} position={[bx, 1.6, 1.32]} scale={[0.06, 0.4, 0.06]} color="#805d3e" shadow={false} />)}
    <Box position={[-0.7, 2.65, -0.4]} scale={[0.33, 1, 0.33]} color="#b1aa97" />
  </group>;
});

function Chapel({ night }: { night: boolean }) {
  return <group position={[-18, 0, -7]}>
    <Box position={[0, 1.25, 0]} scale={[2.1, 2.5, 3.2]} color="#efe8d2" />
    <mesh position={[0, 2.9, 0]} rotation={[0, Math.PI / 4, 0]} castShadow><coneGeometry args={[2, 1.5, 4]} /><meshStandardMaterial color="#687f83" /></mesh>
    <Box position={[0, 2.5, 1.35]} scale={[1.15, 5, 1.15]} color="#e8dec4" />
    <mesh position={[0, 5.7, 1.35]} rotation={[0, Math.PI / 4, 0]} castShadow><coneGeometry args={[1, 2.2, 4]} /><meshStandardMaterial color="#536c73" /></mesh>
    <mesh position={[0, 4.15, 1.94]}><circleGeometry args={[0.32, 16]} /><meshStandardMaterial color="#f6eac9" emissive="#e7c78b" emissiveIntensity={night ? 0.6 : 0} /></mesh>
    <Box position={[0, 4.24, 1.96]} scale={[0.025, 0.23, 0.015]} color="#5b5948" shadow={false} />
    <Box position={[0.08, 4.15, 1.96]} scale={[0.18, 0.025, 0.015]} color="#5b5948" shadow={false} />
    <Box position={[0, 6.95, 1.35]} scale={[0.08, 0.65, 0.08]} color="#c4ab69" />
    <Box position={[0, 7.03, 1.35]} scale={[0.4, 0.08, 0.08]} color="#c4ab69" />
  </group>;
}

function Waterwheel({ elapsed }: { elapsed: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => { if (ref.current) ref.current.rotation.x = elapsed * 0.42; });
  return <group position={[-4.4, 1, 0]}>
    <group ref={ref}>
      {[-0.3, 0.3].map(x => <mesh key={x} rotation={[0, Math.PI / 2, 0]} position={[x, 0, 0]} castShadow><torusGeometry args={[1.15, 0.12, 4, 16]} /><meshStandardMaterial color="#785535" /></mesh>)}
      {Array.from({ length: 12 }, (_, i) => <group key={i} rotation={[i * Math.PI / 6, 0, 0]}><Box position={[0, 1.12, 0]} scale={[0.85, 0.17, 0.3]} color="#a67c4c" /><Box position={[0, 0.57, 0]} scale={[0.12, 1.1, 0.12]} color="#86623d" /></group>)}
    </group>
    <Box position={[1.4, 0, 0]} scale={[3, 0.18, 0.18]} color="#807663" />
  </group>;
}

function Smoke({ position, elapsed, color = '#e4dfd1', count = 5 }: { position: [number, number, number]; elapsed: number; color?: string; count?: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    ref.current?.children.forEach((child, i) => {
      const progress = ((elapsed * 0.22 + i / count) % 1);
      child.position.set(Math.sin(progress * 3 + i) * progress, progress * 4, Math.cos(i) * progress * 0.4);
      child.scale.setScalar(0.12 + progress * 0.65);
      ((child as THREE.Mesh).material as THREE.MeshStandardMaterial).opacity = (1 - progress) * 0.5;
    });
  });
  return <group ref={ref} position={position}>{Array.from({ length: count }, (_, i) => <mesh key={i} raycast={noRaycast}>
    <dodecahedronGeometry args={[0.7, 0]} /><meshStandardMaterial color={color} transparent depthWrite={false} />
  </mesh>)}</group>;
}

function PlaceModel({ place, night, elapsed }: { place: Place; night: boolean; elapsed: number }) {
  const [x, z] = place.position;
  if (place.kind === 'town') return <group position={[x, terrainHeight(x, z), z]}>
    <Chapel night={night} />
    <mesh position={[0, 0.09, 0]} receiveShadow><cylinderGeometry args={[1.5, 1.6, 0.18, 16]} /><meshStandardMaterial color="#c8bfa3" /></mesh>
    <mesh position={[0, 0.33, 0]}><cylinderGeometry args={[0.6, 0.7, 0.5, 12]} /><meshStandardMaterial color="#a4b6af" /></mesh>
    <mesh position={[0, 0.58, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.52, 16]} /><meshStandardMaterial color="#4aacba" metalness={0.2} roughness={0.3} /></mesh>
    <Box position={[1.9, 1.3, -0.5]} scale={[0.08, 2.6, 0.08]} color="#806849" />
    <Box position={[2.35, 2.2, -0.5]} scale={[0.9, 0.65, 0.035]} color="#d5493f" />
    <Box position={[2.35, 2.2, -0.475]} scale={[0.37, 0.1, 0.018]} color="#fff7e7" shadow={false} />
    <Box position={[2.35, 2.2, -0.475]} scale={[0.1, 0.37, 0.018]} color="#fff7e7" shadow={false} />
    <group position={[2.1, 0, 0]}>
      <Box position={[0, 0.75, 0]} scale={[1.6, 0.12, 0.7]} color="#9c7049" />
      <Box position={[0, 1.5, 0]} scale={[1.9, 0.1, 1]} color="#d99f69" />
      {[-0.75, 0.75].map(sx => <Box key={sx} position={[sx, 0.8, 0]} scale={[0.07, 1.5, 0.07]} color="#86613f" />)}
      {[-0.5, 0, 0.5].map(sx => <mesh key={sx} position={[sx, 0.9, 0]}><dodecahedronGeometry args={[0.17]} /><meshStandardMaterial color="#eabf50" /></mesh>)}
    </group>
  </group>;
  if (place.kind === 'copper' || place.kind === 'gold') return <group position={[x, terrainHeight(x, z), z]}>
    <mesh position={[0, 2.8, -6.7]} scale={[7.3, 3.1, 3.2]} castShadow receiveShadow>
      <icosahedronGeometry args={[1, 1]} /><meshStandardMaterial color="#87998a" flatShading />
    </mesh>
    {mineEntrances.map(side => <MineEntrance key={side} x={side} />)}
    {[-0.42, 0.42].map(rail => <Box key={rail} position={[rail, 0.075, 2.65]} scale={[0.065, 0.065, 1.7]} color="#a6b3a8" />)}
    {Array.from({ length: 4 }, (_, i) => <Box key={i} position={[0, 0.035, 2 + i * 0.55]} scale={[1.1, 0.05, 0.14]} color="#897252" />)}
    <group position={[2.5, 0.4, 1]}>
      <Box position={[0, 0.1, 0]} scale={[1, 0.7, 1.1]} color="#786d5c" />
      {[0, 1, 2].map(i => <mesh key={i} position={[(i - 1) * 0.25, 0.55, 0]}><dodecahedronGeometry args={[0.3]} /><meshStandardMaterial color={place.color} flatShading /></mesh>)}
    </group>
    <Smoke position={[0.6, 0.2, 0.8]} color="#b9a486" elapsed={elapsed * 1.5} count={3} />
    <Box position={[1.7, 1.7, 0.2]} scale={[0.2, 0.25, 0.2]} color="#f8d487" glow />
  </group>;
  if (place.kind === 'smelter') return <group position={[x, terrainHeight(x, z), z]}>
    <Box position={[0, 0.9, 0]} scale={[3, 1.8, 2.5]} color="#b88f72" />
    <Box position={[0, 1.95, 0]} scale={[3.4, 0.3, 2.9]} color="#637673" />
    <Box position={[0.8, 2.7, -0.6]} scale={[0.65, 3.2, 0.65]} color="#927b6a" />
    <Box position={[-0.4, 0.65, 1.28]} scale={[0.95, 0.7, 0.05]} color="#efad5a" glow />
    <pointLight position={[-0.4, 0.65, 1.5]} color="#ffab4a" intensity={night ? 7 : 2} distance={7} />
    <Smoke position={[0.8, 4.3, -0.6]} elapsed={elapsed} />
    <Waterwheel elapsed={elapsed} />
    {[0, 1, 2].map(i => <Box key={i} position={[-2.3, 0.2 + i * 0.22, 0]} scale={[1, 0.2, 0.65]} color="#79a99b" />)}
  </group>;
  if (place.kind === 'farm') return <group position={[x, terrainHeight(x, z), z]}>
    <Box position={[0, 0.015, 0]} scale={[6, 0.1, 5]} color="#997046" />
    {Array.from({ length: 6 }, (_, row) => <group key={row}>
      <Box position={[row - 2.5, 0.07, 0]} scale={[0.65, 0.1, 4.7]} color="#b99d55" />
      {Array.from({ length: 7 }, (_, col) => <mesh key={col} position={[row - 2.5, 0.35, col * 0.6 - 1.8]} rotation={[0, col * 0.5, 0]}>
        <coneGeometry args={[0.18, 0.7, 4]} /><meshStandardMaterial color={row % 2 ? '#a1bb4b' : '#e3c75c'} flatShading />
      </mesh>)}
    </group>)}
    <House x={-1} z={-4} size={1.05} roof="#a45c48" lit={night} />
    {[-3.4, 3.4].map(fx => <group key={fx}>
      {[-2.6, 0, 2.6].map(fz => <Box key={fz} position={[fx, 0.5, fz]} scale={[0.14, 1.1, 0.14]} color="#c4a06b" />)}
      <Box position={[fx, 0.75, 0]} scale={[0.12, 0.13, 5.5]} color="#c4a06b" />
    </group>)}
  </group>;
  return <group position={[x, terrainHeight(x, z), z]}>
    <Box position={[0, 0.5, 0]} scale={[2, 1, 1.4]} color="#ac8760" />
    <Box position={[0, 1.1, 0]} scale={[2.4, 0.2, 1.8]} color="#758463" />
    {[0, 1, 2, 3].map(i => <mesh key={i} position={[2.2, 0.25 + Math.floor(i / 2) * 0.4, (i % 2) * 0.55]} rotation={[0, 0, Math.PI / 2]}>
      <cylinderGeometry args={[0.25, 0.25, 2.1, 6]} /><meshStandardMaterial color="#a5855a" />
    </mesh>)}
  </group>;
}

function MineEntrance({ x }: { x: number }) {
  return <group position={[x, 0, 0]}>
    {/* Lining encloses a genuinely open recess; rock sits above and beside it. */}
    <Box position={[0, 0.015, -1.5]} scale={[2.6, 0.03, 3.2]} color="#928871" />
    <Box position={[0, 1.25, -3.1]} scale={[2.7, 2.5, 0.12]} color="#26332e" />
    {[-1.6, 1.6].map(side => <Box key={side} position={[side, 1.35, -1.6]} scale={[0.48, 2.7, 3.4]} color="#8d9b8e" />)}
    <Box position={[0, 2.7, -1.5]} scale={[3.7, 0.42, 3.6]} color="#879687" />
    <mesh position={[0, 3.55, -2.1]} scale={[1.8, 0.72, 1.3]} castShadow><icosahedronGeometry args={[1, 1]} /><meshStandardMaterial color="#8b9b8c" flatShading /></mesh>
    {[0, -1.3, -2.6].map(depth => <group key={depth} position={[0, 0, depth]}>
      {[-1.28, 1.28].map(side => <Box key={side} position={[side, 1.15, 0]} scale={[0.24, 2.3, 0.24]} color="#a5865c" />)}
      <Box position={[0, 2.34, 0]} scale={[2.8, 0.23, 0.28]} color="#b89a6c" />
    </group>)}
    {[-0.42, 0.42].map(rail => <Box key={rail} position={[rail, 0.075, -0.7]} scale={[0.065, 0.065, 5]} color="#a6b3a8" />)}
    {Array.from({ length: 9 }, (_, i) => <Box key={i} position={[0, 0.035, -2.8 + i * 0.55]} scale={[1.1, 0.05, 0.14]} color="#8b7655" />)}
    <Box position={[1.15, 1.8, -0.55]} scale={[0.14, 0.22, 0.14]} color="#ffde92" glow />
  </group>;
}

function Neighborhood({ homes, night, selectedId, onInspect }: { homes: readonly BuildingView[]; night: boolean; selectedId: string | null; onInspect: (id: string) => void }) {
  return <>{homes.map((home, i) => <group key={home.id} position={[home.position[0], terrainHeight(...home.position), home.position[1]]}
    onClick={e => { e.stopPropagation(); onInspect(home.id); }}>
    <House x={0} z={0} lit={night} size={1.1} roof={['#b55e48', '#607f87', '#9c7450', '#7e8793'][i % 4]} />
    <Box position={[i % 6 === 5 ? -1.8 : 1.8, 0.16, 0]} scale={[0.65, 0.32, 2.3]} color="#a79570" shadow={false} />
    {[0, 1, 2, 3].map(j => <mesh key={j} position={[i % 6 === 5 ? -1.8 : 1.8, 0.41, -0.8 + j * 0.5]}><sphereGeometry args={[0.22, 10, 8]} /><meshStandardMaterial color={i % 2 ? '#9ab958' : '#d6a751'} /></mesh>)}
    <Box position={[i % 6 === 5 ? 1.5 : -1.7, 0.38, 0]} scale={[0.09, 0.76, 2.3]} color="#cfb88a" shadow={false} />
    {selectedId === home.id && <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} raycast={noRaycast}><ringGeometry args={[1.85, 2, 48]} /><meshBasicMaterial color="#ffdb83" side={THREE.DoubleSide} /></mesh>}
  </group>)}
    {[-26.5, -16.5, -6.5].flatMap(x => [-0.9, 12.1, 18.6].map(z => <group key={`${x}:${z}`} position={[x, terrainHeight(x, z), z]}>
      <Box position={[0, 1.2, 0]} scale={[0.08, 2.4, 0.08]} color="#657a69" />
      <Box position={[0, 2.35, 0]} scale={[0.32, 0.4, 0.32]} color={night ? '#ffdb8e' : '#f4e1b0'} glow={night} shadow={false} />
      <Box position={[0, 2.59, 0]} scale={[0.43, 0.08, 0.43]} color="#5d786b" shadow={false} />
    </group>))}
  </>;
}

function IndustrialExtras({ place, elapsed, night }: { place: Place; elapsed: number; night: boolean }) {
  const [x, z] = place.position;
  if (place.kind === 'town') return null;
  return <group position={[x, terrainHeight(x, z), z]}>
    {(place.kind === 'copper' || place.kind === 'gold') && <>
      <group position={[8.6, 0, -4.8]}>
        {[-1.1, 1.1].flatMap(dx => [-0.8, 0.8].map(dz => <Box key={`${dx}:${dz}`} position={[dx, 3.2, dz]} scale={[0.28, 6.4, 0.28]} color="#82765e" />))}
        {[1.5, 3.5, 5.8].map(y => <Box key={y} position={[0, y, 0]} scale={[2.6, 0.24, 2]} color="#9b8762" />)}
        <mesh position={[0, 6.5, 0]} rotation={[0, 0, Math.PI / 2]}><torusGeometry args={[0.7, 0.1, 8, 24]} /><meshStandardMaterial color="#6c807e" /></mesh>
      </group>
      {Array.from({ length: 8 }, (_, i) => <mesh key={i} position={[-5.4 + i % 4 * 0.7, 0.45, 3.6 + Math.floor(i / 4) * 0.7]} castShadow><icosahedronGeometry args={[0.65, 1]} /><meshStandardMaterial color={place.color} roughness={0.9} /></mesh>)}
      <Box position={[-4.5, 0.5, 4.8]} scale={[4.1, 0.15, 1.1]} color="#9c825c" />
    </>}
    {place.kind === 'smelter' && <>
      <Box position={[6, 1.5, -3]} scale={[7, 3, 4.8]} color="#c6aa82" />
      <Box position={[6, 3.15, -3]} scale={[7.4, 0.35, 5.2]} color="#638384" />
      {[-1.7, 0, 1.7].map(dx => <group key={dx} position={[6 + dx, 0, -0.55]}>
        <Box position={[0, 1, 0]} scale={[0.85, 1.3, 0.08]} color={night ? '#ffc879' : '#78aeb6'} glow={night} />
        <Box position={[0, 0.55, 1.3]} scale={[1.2, 0.8, 1.7]} color="#9a8170" />
        <Box position={[0, 0.85, 1.3]} scale={[0.8, 0.08, 1.1]} color="#f2b269" glow />
      </group>)}
      {[4.5, 7.5].map(dx => <group key={dx}>
        <Box position={[dx, 4.3, -4.1]} scale={[0.8, 4, 0.8]} color="#9d8a78" />
        <Smoke position={[dx, 6.3, -4.1]} elapsed={elapsed} />
      </group>)}
      <Box position={[3.4, 0.7, 4.2]} scale={[5, 1.4, 2.4]} color="#9e9174" />
      <Box position={[3.4, 1.5, 4.2]} scale={[5.5, 0.24, 2.8]} color="#698581" />
      {[0, 1, 2, 3].map(i => <Box key={i} position={[1.4 + i * 1.3, 0.2, 6]} scale={[0.85, 0.4, 0.7]} color="#b89962" />)}
    </>}
    {place.kind === 'forest' && <>
      <Box position={[0, 1.5, -3]} scale={[7, 3, 4]} color="#a27d50" />
      <Box position={[0, 3.15, -3]} scale={[7.5, 0.3, 4.5]} color="#667c68" />
      {[-2, 0, 2].map(dx => <Box key={dx} position={[dx, 0.85, -0.96]} scale={[1.35, 1.7, 0.08]} color="#455747" />)}
      {Array.from({ length: 14 }, (_, i) => <mesh key={i} position={[-5, 0.3 + Math.floor(i / 5) * 0.5, -3 + i % 5 * 0.53]} rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[0.25, 0.25, 3.2, 12]} /><meshStandardMaterial color={i % 2 ? '#c09b66' : '#9b7248'} /></mesh>)}
      {[1, 3.5].map(dx => <group key={dx} position={[dx, 0, 3]}>
        <Box position={[0, 0.7, 0]} scale={[1.5, 0.15, 2]} color="#b79b71" />
        <mesh position={[0, 1, 0]} rotation={[0, elapsed * 3, Math.PI / 2]}><cylinderGeometry args={[0.55, 0.55, 0.04, 24]} /><meshStandardMaterial color="#bcc9bf" metalness={0.6} roughness={0.5} /></mesh>
      </group>)}
    </>}
    {place.kind === 'farm' && <>
      <House x={6} z={-3} size={1.6} roof="#805d4e" lit={night} />
      <Box position={[6, 0.04, 3]} scale={[5, 0.12, 4.5]} color="#9b7b48" />
      {Array.from({ length: 7 }, (_, i) => <Box key={i} position={[3.8 + i * 0.7, 0.3, 3]} scale={[0.32, 0.5, 4]} color={i % 2 ? '#a9ba56' : '#d6bd58'} />)}
      {[0, 1, 2, 3].map(i => <mesh key={i} position={[-4.4, 0.55, -3 + i]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.55, 0.55, 0.8, 16]} /><meshStandardMaterial color="#d8bd70" /></mesh>)}
    </>}
  </group>;
}

function Bean({ miner, selected, elapsed, onSelect, paused }: { miner: MinerView; selected: boolean; elapsed: number; onSelect: (id: string) => void; paused: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const tool = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const initialPosition = useRef<[number, number, number]>([miner.position[0], walkHeight(...miner.position), miner.position[1]]);
  const heading = useRef(0);
  const last = useRef(new THREE.Vector3(miner.position[0], walkHeight(...miner.position), miner.position[1]));
  useEffect(() => () => { document.body.style.cursor = ''; }, []);
  useFrame((_, dt) => {
    if (!ref.current) return;
    // Follow the walk every frame when we have one, so movement is smooth between snapshots.
    const m = miner.motion;
    const [px, pz] = m ? pointOnRoute(m.route, Math.min(1, (performance.now() - m.start) / m.duration)) : miner.position;
    const target = new THREE.Vector3(px, walkHeight(px, pz), pz);
    const distance = target.distanceTo(last.current);
    if (distance > 0.003) {
      heading.current = Math.atan2(target.x - last.current.x, target.z - last.current.z);
    }
    ref.current.rotation.y += Math.atan2(Math.sin(heading.current - ref.current.rotation.y), Math.cos(heading.current - ref.current.rotation.y)) * Math.min(dt * 8, 1);
    last.current.copy(target);
    ref.current.position.lerp(target, 1 - Math.exp(-dt * 12));
    ref.current.position.y = walkHeight(ref.current.position.x, ref.current.position.z) + (!miner.working && !paused ? Math.abs(Math.sin(elapsed * 8 + Number(miner.id.replace(/\D/g, '')))) * 0.1 : 0);
    if (tool.current) tool.current.rotation.z = miner.working ? Math.sin(elapsed * 7) * 0.65 : 0.2;
  });
  return <group ref={ref} position={initialPosition.current}
    onClick={e => { e.stopPropagation(); onSelect(miner.id); }}
    onPointerOver={e => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; }}
    onPointerOut={() => { setHovered(false); document.body.style.cursor = ''; }}>
    <mesh position={[0, 0.58, 0]} castShadow scale={[0.42, 0.57, 0.35]}><sphereGeometry args={[1, 16, 12]} /><meshStandardMaterial color={hovered ? '#f5df9c' : miner.color} /></mesh>
    <mesh position={[0, 1.05, 0]}><cylinderGeometry args={[0.33, 0.44, 0.2, 16]} /><meshStandardMaterial color={miner.trade === 'Miner' ? '#e7bc57' : '#e4d5b0'} /></mesh>
    <Box position={[0, 1.13, 0.27]} scale={[0.14, 0.12, 0.1]} color="#fff2bf" glow={miner.trade === 'Miner'} shadow={false} />
    {[-0.13, 0.13].map(x => <mesh key={x} position={[x, 0.76, 0.31]}><sphereGeometry args={[0.045, 6, 6]} /><meshBasicMaterial color="#303c36" /></mesh>)}
    {[-0.16, 0.16].map(x => <Box key={x} position={[x, 0.09, 0]} scale={[0.18, 0.18, 0.3]} color="#655b48" shadow={false} />)}
    {miner.trade === 'Hauler' ? <Box position={[0, 0.55, -0.38]} scale={[0.5, 0.5, 0.3]} color="#947454" shadow={false} /> :
      <group ref={tool} position={[0.43, 0.6, 0.1]}>
        <Box position={[0, 0.18, 0]} scale={[0.07, 0.7, 0.07]} color="#856945" shadow={false} />
        <Box position={[0.03, 0.52, 0]} scale={[0.45, 0.08, 0.12]} color={miner.trade === 'Farmer' ? '#a1ac75' : '#b6c4be'} shadow={false} />
      </group>}
    {(selected || hovered) && <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} raycast={noRaycast}>
      <ringGeometry args={[0.62, 0.76, 32]} /><meshBasicMaterial color={selected ? '#ffde83' : '#eff3d6'} side={THREE.DoubleSide} />
    </mesh>}
    {selected && <Html position={[0, 1.7, 0]} center className="bean-label" zIndexRange={[8, 0]} style={{ pointerEvents: 'none' }}>{miner.name}</Html>}
  </group>;
}

function Clouds({ elapsed, weather }: { elapsed: number; weather: WeatherView }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    ref.current?.children.forEach((cloud, i) => {
      const progress = ((elapsed * weather.wind * (0.25 + i * 0.06) + i * 21) % 130) / 130;
      if (i < 9) cloud.position.set(-65 + progress * 130, 24 + i % 3 * 5 + Math.sin(elapsed * 0.15 + i) * 0.6, -29 + i % 4 * 11 + Math.sin(elapsed * 0.04 + i) * 1.4);
      else {
        const angle = (i - 9) / 16 * Math.PI * 2 + elapsed * weather.wind * 0.002;
        const radius = 94 + i % 3 * 28, x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
        cloud.position.set(x, terrainHeight(x, z) + 15 + Math.sin(elapsed * 0.08 + i) * 1.8, z);
        cloud.scale.setScalar(2.5);
      }
      cloud.rotation.y = Math.sin(elapsed * 0.03 + i) * 0.12;
      cloud.children.forEach((puff, j) => {
        puff.position.y = hash(j * 7 + i + 47) * 1.4 + Math.sin(elapsed * 0.3 + j + i) * 0.35;
        const breathe = 1 + Math.sin(elapsed * 0.18 + j * 2 + i) * 0.08;
        puff.scale.set((1.9 + hash(j + i * 7)) * breathe, (1.15 + hash(j + 15) * 1.1) * breathe, 1.8 * breathe);
        const material = (puff as THREE.Mesh).material as THREE.MeshStandardMaterial;
        material.opacity = (i < 9 ? Math.min(1, progress * 12, (1 - progress) * 12) : 0.7) * (0.72 + weather.overcast * 0.23);
        material.color.set(weather.overcast > 0.4 ? '#b4c6cc' : j % 3 ? '#fff9ee' : '#e7efea');
      });
    });
  });
  return <group ref={ref}>{Array.from({ length: 25 }, (_, i) =>
    <group key={i}>
      {Array.from({ length: i < 9 ? 8 : 5 }, (_, j) => <mesh key={j} position={[(j - (i < 9 ? 3.5 : 2)) * 1.2, 0, Math.sin(j * 3) * 1.1]} raycast={noRaycast}>
        <icosahedronGeometry args={[1, i < 9 ? 1 : 0]} /><meshStandardMaterial color={j % 3 ? '#fff9ee' : '#e7efea'} transparent opacity={0.76} roughness={1} flatShading depthWrite={false} />
      </mesh>)}
    </group>)}</group>;
}

function Atmosphere({ hour, weather }: { hour: number; weather: WeatherView }) {
  const light = useRef<THREE.DirectionalLight>(null);
  const ambient = useRef<THREE.AmbientLight>(null);
  const sun = useRef<THREE.Group>(null);
  const moon = useRef<THREE.Group>(null);
  const sky = useRef<THREE.Mesh>(null);
  const { scene } = useThree();
  const dayColor = useMemo(() => new THREE.Color('#c7e4e2'), []);
  const nightColor = useMemo(() => new THREE.Color('#253f5c'), []);
  const glow = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
    gradient.addColorStop(0, '#fff'); gradient.addColorStop(0.2, '#ffffffb0'); gradient.addColorStop(0.5, '#ffffff28'); gradient.addColorStop(1, '#ffffff00');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(canvas);
  }, []);
  const skyMaterial = useMemo(() => new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { daylight: { value: 1 }, dusk: { value: 0 }, overcast: { value: 0 } },
    vertexShader: `varying vec3 direction; void main() { direction = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `varying vec3 direction; uniform float daylight; uniform float dusk; uniform float overcast;
      void main() { float h = smoothstep(-.12, .7, normalize(direction).y);
        vec3 day = mix(vec3(.77,.90,.89), vec3(.23,.57,.82), h);
        day = mix(day, mix(vec3(1.,.72,.52),vec3(.54,.56,.79),h), dusk * .7);
        vec3 night = mix(vec3(.14,.25,.36),vec3(.025,.065,.14),h);
        vec3 color = mix(night, day, daylight);
        color = mix(color, mix(vec3(.14,.25,.36),vec3(.63,.73,.77),daylight),overcast * .72);
        gl_FragColor = vec4(color,1.); }`,
  }), []);
  useEffect(() => () => { glow.dispose(); skyMaterial.dispose(); }, [glow, skyMaterial]);
  useFrame(({ camera }) => {
    const daylight = THREE.MathUtils.smoothstep(Math.sin((hour - 6) / 24 * Math.PI * 2), -0.15, 0.35);
    const dusk = Math.max(0, 1 - Math.abs(hour - 18) / 3);
    const color = nightColor.clone().lerp(dayColor, daylight);
    color.lerp(new THREE.Color(daylight > 0.5 ? '#a6bec6' : '#253f5c'), weather.overcast * 0.72);
    (scene.background as THREE.Color).copy(color);
    (scene.fog as THREE.Fog).color.copy(color);
    (scene.fog as THREE.Fog).near = weather.kind === 'fog' ? 22 : 75;
    (scene.fog as THREE.Fog).far = weather.fogFar;
    if (sky.current) sky.current.position.copy(camera.position);
    skyMaterial.uniforms.daylight.value = daylight; skyMaterial.uniforms.dusk.value = dusk;
    skyMaterial.uniforms.overcast.value = weather.overcast;
    const angle = (hour - 6) / 12 * Math.PI;
    if (sun.current) { sun.current.position.set(-50 * Math.cos(angle), 42 + Math.sin(angle) * 4, -56); sun.current.visible = hour >= 6 && hour < 19; }
    if (moon.current) { const a = ((hour - 18 + 24) % 24) / 12 * Math.PI; moon.current.position.set(-50 * Math.cos(a), 42 + Math.sin(a) * 4, -56); moon.current.visible = hour < 6 || hour >= 19; }
    if (light.current) { light.current.intensity = 0.28 + daylight * 2.4 * (1 - weather.overcast * 0.7); light.current.color.set(daylight < 0.5 ? '#adc8f5' : dusk > 0.3 ? '#ffd69f' : '#fff2d4'); }
    if (ambient.current) ambient.current.intensity = 0.3 + daylight * 0.5;
  });
  return <>
    <color attach="background" args={['#c7e4e2']} /><fog attach="fog" args={['#c7e4e2', 110, 240]} />
    <mesh ref={sky} material={skyMaterial} renderOrder={-100} raycast={noRaycast}><sphereGeometry args={[540, 32, 16]} /></mesh>
    <ambientLight ref={ambient} intensity={0.8} />
    <directionalLight ref={light} position={[-35, 55, 20]} intensity={2.6} castShadow shadow-mapSize={[2048, 2048]}
      shadow-camera-left={-50} shadow-camera-right={50} shadow-camera-top={50} shadow-camera-bottom={-50} shadow-camera-far={170} shadow-normalBias={0.09} />
    <hemisphereLight args={['#9dd9ec', '#3b673b', 0.65]} />
    <group ref={sun}>
      <mesh raycast={noRaycast}><sphereGeometry args={[2.3, 24, 16]} /><meshBasicMaterial color="#fff0aa" toneMapped={false} fog={false} /></mesh>
      <sprite scale={[15, 15, 1]} raycast={noRaycast}><spriteMaterial map={glow} color="#ffd77b" transparent opacity={0.7} depthWrite={false} toneMapped={false} fog={false} /></sprite>
    </group>
    <group ref={moon}>
      <mesh raycast={noRaycast}><sphereGeometry args={[1.9, 24, 16]} /><meshBasicMaterial color="#e3edee" toneMapped={false} fog={false} /></mesh>
      {[[-0.5, 0.5, 1.75, 0.3], [0.45, -0.5, 1.77, 0.4], [0.55, 0.7, 1.55, 0.18]].map(([x, y, z, r], i) => <mesh key={i} position={[x, y, z]} raycast={noRaycast}><sphereGeometry args={[r, 8, 6]} /><meshBasicMaterial color="#b5c9d2" toneMapped={false} fog={false} /></mesh>)}
      <sprite scale={[10, 10, 1]} raycast={noRaycast}><spriteMaterial map={glow} color="#b3d8f4" transparent opacity={0.3} depthWrite={false} toneMapped={false} fog={false} /></sprite>
    </group>
    {(hour < 6 || hour >= 19) && <Stars radius={170} depth={50} count={1400} factor={2.5} fade speed={0} />}
  </>;
}

/** The opening flight: from high above the clouds down to the valley overview. */
const INTRO_FROM = [OVERVIEW.position[0] * 0.6, 165, OVERVIEW.position[2] * 0.6] as const;
const INTRO_MS = 4200;

function CameraRig({ focus, following, intro }: { focus: Focus; following?: MinerView; intro?: boolean }) {
  const flight = useRef<{ start: number } | null>(intro ? { start: -1 } : null);
  const controls = useRef<ElementRef<typeof OrbitControls>>(null);
  const { camera, size, gl } = useThree();
  const targetPosition = useRef<THREE.Vector3 | null>(null);
  const targetLook = useRef<THREE.Vector3 | null>(null);
  const telemetryTime = useRef(0);
  const lastFocusSerial = useRef(-1);
  useEffect(() => {
    if (camera instanceof THREE.PerspectiveCamera) {
      const framing = Math.max(1, 1.3 / (size.width / size.height));
      camera.fov = Math.min(110, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(OVERVIEW.fov / 2)) * framing)));
      camera.updateProjectionMatrix();
    }
  }, [camera, size.width, size.height]);
  useEffect(() => {
    const focusChanged = lastFocusSerial.current !== focus.serial;
    lastFocusSerial.current = focus.serial;
    if (!following && !focusChanged) { targetPosition.current = null; return; }
    const [x, z] = following?.position ?? focus.point;
    const overview = focus.overview && !following;
    const offset = following ? [12, 12, 15] : focus.offset ?? [12, 12, 15];
    targetLook.current = overview ? new THREE.Vector3(...OVERVIEW.target) : new THREE.Vector3(x, walkHeight(x, z) + 1.5, z);
    targetPosition.current = overview ? new THREE.Vector3(...OVERVIEW.position) : new THREE.Vector3(x + offset[0], walkHeight(x, z) + offset[1], z + offset[2]);
    // Tracking updates below use the latest source position without restarting the flight.
  }, [focus, following?.id]);
  useFrame((_, dt) => {
    if (!controls.current) return;
    if (flight.current) {
      // Ease down through the cloud layer; orbit limits are lifted until we arrive.
      if (flight.current.start < 0) flight.current.start = performance.now();
      const t = Math.min(1, (performance.now() - flight.current.start) / INTRO_MS);
      const e = 1 - Math.pow(1 - t, 3);
      controls.current.maxDistance = 1000;
      camera.position.set(
        INTRO_FROM[0] + (OVERVIEW.position[0] - INTRO_FROM[0]) * e,
        INTRO_FROM[1] + (OVERVIEW.position[1] - INTRO_FROM[1]) * e,
        INTRO_FROM[2] + (OVERVIEW.position[2] - INTRO_FROM[2]) * e,
      );
      controls.current.target.set(...OVERVIEW.target);
      controls.current.update();
      if (t >= 1) { flight.current = null; controls.current.maxDistance = 78; }
      return;
    }
    const blend = 1 - Math.exp(-dt * 4);
    if (following) {
      const [x, z] = following.position;
      const next = new THREE.Vector3(x, walkHeight(x, z) + 1.5, z);
      if (targetPosition.current) targetPosition.current.set(x + 12, walkHeight(x, z) + 12, z + 15);
      else camera.position.add(next.clone().sub(controls.current.target).multiplyScalar(blend));
      targetLook.current = next;
    }
    if (targetLook.current && (following || targetPosition.current)) controls.current.target.lerp(targetLook.current, blend);
    if (targetPosition.current) {
      const bound = boundedPoint(targetPosition.current.x, targetPosition.current.z);
      targetPosition.current.x = bound.x; targetPosition.current.z = bound.z;
      camera.position.lerp(targetPosition.current, blend);
      if (camera.position.distanceTo(targetPosition.current) < 0.06) targetPosition.current = null;
    }
    const target = boundedPoint(controls.current.target.x, controls.current.target.z);
    controls.current.target.x = target.x; controls.current.target.z = target.z;
    controls.current.update();
    // Damped pan offsets are applied by update(), so clamp the target again afterward.
    const settledTarget = boundedPoint(controls.current.target.x, controls.current.target.z);
    controls.current.target.x = settledTarget.x; controls.current.target.z = settledTarget.z;
    const position = boundedPoint(camera.position.x, camera.position.z);
    camera.position.x = position.x; camera.position.z = position.z;
    camera.position.y = Math.max(camera.position.y, terrainHeight(position.x, position.z) + 2);
    telemetryTime.current += dt;
    if (telemetryTime.current > 0.25) {
      // Useful to accessibility tooling and browser QA without exposing scene internals.
      gl.domElement.dataset.cameraPosition = camera.position.toArray().join(',');
      gl.domElement.dataset.cameraTarget = controls.current.target.toArray().join(',');
      telemetryTime.current = 0;
    }
  });
  return <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.08} minDistance={6} maxDistance={78}
    minPolarAngle={0.15} maxPolarAngle={Math.PI / 2.25} target={OVERVIEW.target}
    onStart={() => { targetPosition.current = null; }} />;
}

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <div className="scene-error"><h2>The valley couldn’t open</h2><p>This view needs WebGL. Enable browser graphics acceleration, then reload.</p></div> : this.props.children; }
}

export function WorldScene({ world, selectedId, onSelect, focus, labels, paused, followingId, inspectedId, onInspect, onPlace, weather, routes, intro }: {
  world: WorldView; selectedId: string | null; onSelect: (id: string | null) => void; focus: Focus; labels: boolean; paused: boolean;
  followingId: string | null; inspectedId: string | null; onInspect: (id: string) => void; onPlace: (id: string) => void;
  weather: WeatherView; routes: boolean;
  /** Open with a flight down from above the clouds. */
  intro?: boolean;
}) {
  const night = world.hour < 6 || world.hour >= 19;
  const selected = world.miners.find(m => m.id === selectedId);
  const following = world.miners.find(m => m.id === followingId);
  const route = selected?.route?.map(([x, z]) => [x, walkHeight(x, z) + 0.16, z] as [number, number, number]);
  return <SceneBoundary><Canvas shadows dpr={[1, 1.5]} camera={{ position: intro ? [...INTRO_FROM] : [...OVERVIEW.position], fov: OVERVIEW.fov, near: 0.1, far: 650 }}
    gl={{ antialias: true, powerPreference: 'high-performance' }} onPointerMissed={() => onSelect(null)} fallback={<div className="scene-error">Your browser needs WebGL to show the valley.</div>}>
    <Atmosphere hour={world.hour} weather={weather} /><AlpineLandscape elapsed={world.elapsed} />
    <Neighborhood homes={world.buildings ?? []} night={night} selectedId={inspectedId} onInspect={onInspect} />
    {world.places.map(place => <group key={place.id} onClick={e => { e.stopPropagation(); onPlace(place.id); }}>
      <PlaceModel place={place} night={night} elapsed={world.elapsed} />
      <IndustrialExtras place={place} night={night} elapsed={world.elapsed} />
      {labels && <Html center position={[place.position[0], terrainHeight(...place.position) + 4.3, place.position[1]]} zIndexRange={[5, 0]} className="place-marker" style={{ pointerEvents: 'none' }}>
        <span className="marker-dot" style={{ background: place.color }} />{place.name}
      </Html>}
    </group>)}
    {routes && route && route.length > 1 && <Line points={route} color="#ffe0a0" lineWidth={3} transparent opacity={0.85} raycast={noRaycast} />}
    {world.miners.map(miner => <Bean key={miner.id} miner={miner} selected={miner.id === selectedId} elapsed={world.elapsed} onSelect={onSelect} paused={paused} />)}
    <Clouds elapsed={world.elapsed} weather={weather} /><Precipitation weather={weather} elapsed={world.elapsed} /><CameraRig focus={focus} following={following} intro={intro} />
  </Canvas></SceneBoundary>;
}
