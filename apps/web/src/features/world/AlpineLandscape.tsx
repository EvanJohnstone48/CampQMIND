import { memo, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { demoPlaces, demoRoutes } from '../../net/demo';
import { demoHomes, millrace, sceneryClearance, sceneryTrails, streetRoutes } from '../../net/demoMap';
import { hash, lakeDistance, lakeEdgeScale, millraceDistance, riverX, riverY, segmentDistance, terrainHeight, terrainRadii, terrainSegments, terrainSurfaceHeight, terrainVertex } from './landscape';
import { ValleyScenery } from './ValleyScenery';

function MountainMeadow() {
  const geometry = useMemo(() => {
    const points: number[] = []; const colors: number[] = [];
    const color = new THREE.Color();
    const meadow = new THREE.Color('#579b43');
    const sunnyMeadow = new THREE.Color('#88b852');
    function face(vertices: readonly (readonly number[])[], seed: number) {
      const x = vertices.reduce((s, p) => s + p[0], 0) / 3;
      const z = vertices.reduce((s, p) => s + p[2], 0) / 3;
      const y = terrainHeight(x, z);
      const slope = Math.hypot(terrainHeight(x + 0.7, z) - terrainHeight(x - 0.7, z), terrainHeight(x, z + 0.7) - terrainHeight(x, z - 0.7));
      const snowline = 22 + Math.sin(x * 0.2 + z * 0.14) * 2.6;
      if (y > snowline) color.set('#eaf1ee').multiplyScalar(0.95 + Math.sin(x * 0.12 + z * 0.08) * 0.04);
      else if (y > 11 || slope > 2.1) color.set('#80978b').lerp(new THREE.Color('#9bac98'), 0.5 + Math.sin(x * 0.13 + z * 0.07) * 0.45);
      else if (Math.abs(x - riverX(z)) < 2.4 && z > -25 && z < 23) color.set('#b4b49a');
      else color.copy(meadow).lerp(sunnyMeadow, 0.5 + Math.sin(x * 0.09) * 0.22 + Math.cos(z * 0.13) * 0.2);
      color.multiplyScalar(0.97 + hash(seed + 91) * 0.06);
      for (const vertex of vertices) { points.push(...vertex); colors.push(color.r, color.g, color.b); }
    }
    // Concentric rings share their seams. Fine village terrain gives way to
    // coarse mountain faces, and the outer edge lies well beyond the fog.
    const rings = terrainRadii;
    const segments = terrainSegments;
    for (let ring = 1; ring < rings.length; ring++) for (let i = 0; i < segments; i++) {
      const a = terrainVertex(ring - 1, i), b = terrainVertex(ring, i);
      const c = terrainVertex(ring - 1, i + 1), d = terrainVertex(ring, i + 1);
      if (ring > 1) face([a, c, b], ring * 173 + i * 71);
      face([b, c, d], ring * 197 + i * 67);
    }
    const mesh = new THREE.BufferGeometry();
    mesh.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    mesh.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    mesh.computeVertexNormals();
    const normals = mesh.getAttribute('normal');
    // Smooth the active meadow while preserving distant mountain facets.
    for (let i = 0; i < points.length / 3; i++) {
      const x = points[i * 3], z = points[i * 3 + 2];
      if (Math.hypot(x, z) > 43) continue;
      const n = new THREE.Vector3(terrainHeight(x - 0.12, z) - terrainHeight(x + 0.12, z), 0.24,
        terrainHeight(x, z - 0.12) - terrainHeight(x, z + 0.12)).normalize();
      normals.setXYZ(i, n.x, n.y, n.z);
    }
    return mesh;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} receiveShadow castShadow><meshStandardMaterial vertexColors roughness={1} /></mesh>;
}

interface Item { x: number; z: number; size: number; seed: number }
function Instances({ items, geometry, material, y = 0, stretch = [1, 1, 1], colors, shadow = false }: {
  items: readonly Item[]; geometry: THREE.BufferGeometry; material: THREE.Material; y?: number;
  stretch?: readonly [number, number, number]; colors?: string[]; shadow?: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const object = new THREE.Object3D();
    items.forEach((item, i) => {
      object.position.set(item.x, terrainSurfaceHeight(item.x, item.z) + y * item.size, item.z);
      object.rotation.set(0, hash(item.seed + 17) * Math.PI * 2, 0);
      object.scale.set(item.size * stretch[0], item.size * stretch[1], item.size * stretch[2]);
      object.updateMatrix(); ref.current!.setMatrixAt(i, object.matrix);
      if (colors) ref.current!.setColorAt(i, new THREE.Color(colors[Math.floor(hash(item.seed) * colors.length)]));
    });
    ref.current!.instanceMatrix.needsUpdate = true;
    if (ref.current!.instanceColor) ref.current!.instanceColor.needsUpdate = true;
    ref.current!.computeBoundingSphere();
  }, [items, geometry, material, y, stretch, colors]);
  return <instancedMesh ref={ref} args={[geometry, material, items.length]} castShadow={shadow} receiveShadow />;
}

const Vegetation = memo(function Vegetation() {
  const assets = useMemo(() => ({
    trunk: new THREE.CylinderGeometry(0.13, 0.22, 1.6, 5),
    pine: new THREE.ConeGeometry(1.1, 2.3, 12),
    distantPine: new THREE.ConeGeometry(1.1, 2.3, 5),
    leaf: new THREE.IcosahedronGeometry(1, 1),
    flower: new THREE.IcosahedronGeometry(0.12, 0),
    grass: new THREE.ConeGeometry(0.12, 0.55, 3),
    wood: new THREE.MeshStandardMaterial({ color: '#73513b', roughness: 1 }),
    foliage: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, flatShading: true }),
  }), []);
  useEffect(() => () => Object.values(assets).forEach(asset => asset.dispose()), [assets]);
  const items = useMemo(() => {
    const trees: Item[] = []; const flowers: Item[] = []; const grass: Item[] = []; const rocks: Item[] = [];
    const routes = [...Object.values(demoRoutes), ...streetRoutes, ...sceneryTrails];
    for (let i = 0; i < 3400; i++) {
      const x = (hash(i * 3 + 1) - 0.5) * 112;
      const z = (hash(i * 3 + 2) - 0.5) * 106;
      const height = terrainHeight(x, z);
      const stream = z > -25 && z < 35 && Math.abs(x - riverX(z)) < 2.8;
      const lake = lakeDistance(x, z) < 1.25;
      const place = demoPlaces.some(p => Math.hypot(x - p.position[0], z - p.position[1]) < (p.kind === 'town' ? 4 : p.kind === 'farm' ? 8 : 7));
      const home = demoHomes.some(p => Math.abs(x - p.position[0]) < 2.1 && Math.abs(z - p.position[1]) < 2);
      const road = routes.some(route => route.slice(1).some((p, j) => segmentDistance(x, z, route[j], p) < 1.25));
      if (height < 0.65 || stream || lake || road || place || home || sceneryClearance(x, z) || millraceDistance(x, z) < 1.7) continue;
      const item = { x, z, size: 0.7 + hash(i + 105) * 0.85, seed: i };
      const slope = Math.hypot(terrainHeight(x + 1, z) - terrainHeight(x - 1, z), terrainHeight(x, z + 1) - terrainHeight(x, z - 1));
      if (i % 5 === 0 && height < 12 && slope < 1.6) trees.push(item);
      else if (height < 5 && Math.hypot(x, z - 3) < 49) {
        if (i % 3 === 0) grass.push({ ...item, size: item.size * 0.7 });
        else flowers.push({ ...item, size: item.size * 0.9 });
      } else if (i % 11 === 0 && height < 6 && slope < 1) rocks.push({ ...item, size: 0.6 + hash(i) * 1.5 });
    }
    // A denser grove makes the logging trade legible in the landscape.
    for (let i = 0; i < 60; i++) {
      const x = -36 + (hash(i + 601) - 0.5) * 12;
      const z = 27 + (hash(i + 701) - 0.5) * 14;
      if (sceneryClearance(x, z, 2) || routes.some(route => route.slice(1).some((p, j) => segmentDistance(x, z, route[j], p) < 1.4))) continue;
      if (terrainHeight(x, z) > 12) continue;
      trees.push({ x, z, size: 0.9 + hash(i + 501) * 0.5, seed: i + 1000 });
    }
    // Background woodland follows lower slopes in every direction. Instancing
    // keeps thousands of distant firs inexpensive and seats them on the mesh.
    for (let i = 0; i < 7200; i++) {
      const radius = 48 + Math.sqrt(hash(i + 10083)) * 207;
      const angle = hash(i + 19083) * Math.PI * 2;
      const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
      const height = terrainSurfaceHeight(x, z);
      const slope = Math.hypot(terrainSurfaceHeight(x + 1, z) - terrainSurfaceHeight(x - 1, z), terrainSurfaceHeight(x, z + 1) - terrainSurfaceHeight(x, z - 1));
      if (height > 24 || slope > 1.7 || sceneryClearance(x, z, 3)) continue;
      trees.push({ x, z, size: 1.4 + hash(i + 28083) * 1.5, seed: i + 5000 });
    }
    return { trees, nearTrees: trees.filter(t => Math.hypot(t.x, t.z) < 40), farTrees: trees.filter(t => Math.hypot(t.x, t.z) >= 40), flowers, grass, rocks };
  }, []);
  return <>
    <Instances items={items.nearTrees} geometry={assets.trunk} material={assets.wood} y={0.8} shadow />
    <Instances items={items.farTrees} geometry={assets.trunk} material={assets.wood} y={0.8} />
    {[1.6, 2.3, 2.9].map((y, i) => <group key={i}>
      <Instances items={items.nearTrees} geometry={assets.pine} material={assets.foliage} y={y} stretch={[1 - i * 0.22, 1 - i * 0.16, 1 - i * 0.22]} colors={['#256742', '#327d45', '#3e8b4a', '#508c43']} shadow />
      <Instances items={items.farTrees} geometry={assets.distantPine} material={assets.foliage} y={y} stretch={[1 - i * 0.22, 1 - i * 0.16, 1 - i * 0.22]} colors={['#256742', '#327d45', '#3e8b4a', '#508c43']} />
    </group>)}
    <Instances items={items.flowers} geometry={assets.grass} material={assets.foliage} y={0.25} colors={['#3b812f', '#5c9839']} />
    <Instances items={items.flowers} geometry={assets.flower} material={assets.foliage} y={0.52} stretch={[1, 0.65, 1]} colors={['#ffe88a', '#f2ecce', '#bb98dc', '#f28e98', '#ffffff']} />
    <Instances items={items.grass} geometry={assets.grass} material={assets.foliage} y={0.28} stretch={[1.6, 1.2, 1.6]} colors={['#77a944', '#568e31', '#a2bd54']} />
    <Instances items={items.rocks} geometry={assets.leaf} material={assets.foliage} y={0.25} stretch={[1.3, 0.6, 0.85]} colors={['#929f8e', '#b2b5a0', '#7f9385']} shadow />
  </>;
});

function ValleyPaths() {
  const geometry = useMemo(() => {
    const points: number[] = [];
    for (const route of [...Object.values(demoRoutes), ...streetRoutes, ...sceneryTrails]) for (let i = 1; i < route.length; i++) {
      const a = route[i - 1]; const b = route[i];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const width = sceneryTrails.includes(route) ? 0.34 : 0.83;
      const nx = -(b[1] - a[1]) / length * width; const nz = (b[0] - a[0]) / length * width;
      const count = Math.ceil(length / 0.6);
      for (let j = 0; j < count; j++) {
        const sample = (t: number, side: number) => {
          const x = a[0] + (b[0] - a[0]) * t + nx * side;
          const z = a[1] + (b[1] - a[1]) * t + nz * side;
          return [x, terrainSurfaceHeight(x, z) + 0.045, z];
        };
        const p = sample(j / count, -1), q = sample(j / count, 1);
        const r = sample((j + 1) / count, -1), s = sample((j + 1) / count, 1);
        points.push(...p, ...q, ...r, ...q, ...s, ...r);
      }
    }
    const result = new THREE.BufferGeometry(); result.setAttribute('position', new THREE.Float32BufferAttribute(points, 3)); result.computeVertexNormals(); return result;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} receiveShadow><meshStandardMaterial color="#d5c197" side={THREE.DoubleSide} roughness={1} /></mesh>;
}

function AlpineWater({ elapsed }: { elapsed: number }) {
  const geometry = useMemo(() => {
    const points: number[] = [];
    for (let i = 0; i < 160; i++) {
      const a = -25 + i * 58 / 160, b = -25 + (i + 1) * 58 / 160;
      const p = [riverX(a) - 1.05, riverY(a), a], q = [riverX(a) + 1.05, riverY(a), a];
      const r = [riverX(b) - 1.05, riverY(b), b], s = [riverX(b) + 1.05, riverY(b), b];
      points.push(...p, ...q, ...r, ...q, ...s, ...r);
    }
    for (let i = 1; i < millrace.length; i++) {
      const a = millrace[i - 1], b = millrace[i];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const nx = -(b[1] - a[1]) / length * 0.48, nz = (b[0] - a[0]) / length * 0.48;
      const p = [a[0] - nx, 0.69, a[1] - nz], q = [a[0] + nx, 0.69, a[1] + nz];
      const r = [b[0] - nx, 0.69, b[1] - nz], s = [b[0] + nx, 0.69, b[1] + nz];
      points.push(...p, ...q, ...r, ...q, ...s, ...r);
    }
    const result = new THREE.BufferGeometry(); result.setAttribute('position', new THREE.Float32BufferAttribute(points, 3)); result.computeVertexNormals(); return result;
  }, []);
  const lakeGeometry = useMemo(() => {
    const points: number[] = [];
    for (let i = 0; i < 80; i++) {
      const a = i / 80 * Math.PI * 2, b = (i + 1) / 80 * Math.PI * 2;
      points.push(0, 0.64, 32, Math.cos(a) * 13.2 * lakeEdgeScale(a), 0.64, 32 + Math.sin(a) * 11 * lakeEdgeScale(a),
        Math.cos(b) * 13.2 * lakeEdgeScale(b), 0.64, 32 + Math.sin(b) * 11 * lakeEdgeScale(b));
    }
    const result = new THREE.BufferGeometry(); result.setAttribute('position', new THREE.Float32BufferAttribute(points, 3)); result.computeVertexNormals(); return result;
  }, []);
  useEffect(() => () => { geometry.dispose(); lakeGeometry.dispose(); }, [geometry, lakeGeometry]);
  const ripples = useRef<THREE.Group>(null);
  useFrame(() => {
    ripples.current?.children.forEach((child, i) => {
      const z = -24 + ((elapsed * 1.7 + i * 2.2) % 55);
      child.position.set(riverX(z) + Math.sin(i * 7) * 0.5, riverY(z) + 0.025, z);
      child.rotation.z = Math.sin(elapsed + i) * 0.13;
    });
  });
  return <>
    <mesh geometry={geometry} receiveShadow><meshStandardMaterial color="#39b8c1" roughness={0.24} metalness={0.18} side={THREE.DoubleSide} /></mesh>
    <mesh geometry={lakeGeometry} receiveShadow><meshStandardMaterial color="#37b4b6" roughness={0.19} metalness={0.2} side={THREE.DoubleSide} /></mesh>
    <group ref={ripples}>{Array.from({ length: 26 }, (_, i) => <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} raycast={() => {}}>
      <planeGeometry args={[0.45 + hash(i) * 0.55, 0.055]} /><meshBasicMaterial color="#def8ef" transparent opacity={0.55} side={THREE.DoubleSide} />
    </mesh>)}</group>
    {[2.5, 4, 6, 8].map(r => <mesh key={r} position={[-1, 0.65, 32]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => {}}>
      <ringGeometry args={[r, r + 0.035, 72]} /><meshBasicMaterial color="#c4eee2" transparent opacity={0.24} side={THREE.DoubleSide} />
    </mesh>)}
    <group position={[4.9, 1.05, 4]}>
      {Array.from({ length: 17 }, (_, i) => <mesh key={i} position={[-3.3 + i * 0.42, Math.sin(i / 16 * Math.PI) * 0.16, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.4, 0.17, 1.8]} /><meshStandardMaterial color={i % 2 ? '#99764e' : '#b38c5e'} />
      </mesh>)}
      {[-0.9, 0.9].map(z => <mesh key={z} position={[0, 0.7, z]} castShadow><boxGeometry args={[7.2, 0.13, 0.12]} /><meshStandardMaterial color="#85623f" /></mesh>)}
      {[-3.2, -1.6, 0, 1.6, 3.2].flatMap(x => [-0.9, 0.9].map(z => <mesh key={`${x}-${z}`} position={[x, 0.4, z]} castShadow><boxGeometry args={[0.13, 1, 0.13]} /><meshStandardMaterial color="#87633f" /></mesh>))}
    </group>
  </>;
}

function Birds({ elapsed }: { elapsed: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    ref.current?.children.forEach((bird, i) => {
      const angle = elapsed * 0.09 + i * 0.18;
      bird.position.set(Math.cos(angle) * 16, 12 + Math.sin(angle * 2) * 2 + i * 0.22, Math.sin(angle) * 12);
      bird.rotation.y = -angle;
      bird.children.forEach((wing, j) => { wing.rotation.z = (j === 0 ? 1 : -1) * (0.15 + Math.sin(elapsed * 9 + i) * 0.45); });
    });
  });
  return <group ref={ref}>{Array.from({ length: 7 }, (_, i) => <group key={i}>{[-1, 1].map(side => <mesh key={side} position={[side * 0.22, 0, 0]} raycast={() => {}}><boxGeometry args={[0.45, 0.035, 0.15]} /><meshStandardMaterial color="#344d49" /></mesh>)}</group>)}</group>;
}

function MeadowCows({ elapsed }: { elapsed: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => { ref.current?.children.forEach((cow, i) => { cow.rotation.y = i * 1.3 + Math.sin(elapsed * 0.2 + i) * 0.08; }); });
  return <group ref={ref}>{[[-20, 30], [-24, 31], [-18, 27], [-20, 26]].map(([x, z], i) => <group key={i} position={[x, terrainSurfaceHeight(x, z), z]}>
    <mesh position={[0, 0.6, 0]} castShadow><boxGeometry args={[1.35, 0.7, 0.65]} /><meshStandardMaterial color="#f3eada" /></mesh>
    <mesh position={[-0.15, 0.6, 0.34]}><boxGeometry args={[0.5, 0.48, 0.035]} /><meshStandardMaterial color="#5c4438" /></mesh>
    <mesh position={[0.8, 0.58, 0]} castShadow><boxGeometry args={[0.45, 0.42, 0.42]} /><meshStandardMaterial color="#76513c" /></mesh>
    {[-0.45, 0.45].flatMap(lx => [-0.22, 0.22].map(lz => <mesh key={`${lx}-${lz}`} position={[lx, 0.18, lz]}><boxGeometry args={[0.12, 0.38, 0.12]} /><meshStandardMaterial color="#6b5040" /></mesh>))}
    <mesh position={[0.72, 0.3, 0]}><sphereGeometry args={[0.08, 6, 4]} /><meshStandardMaterial color="#cba252" metalness={0.5} roughness={0.5} /></mesh>
  </group>)}</group>;
}

export function AlpineLandscape({ elapsed }: { elapsed: number }) {
  return <><MountainMeadow /><ValleyPaths /><AlpineWater elapsed={elapsed} /><Vegetation /><ValleyScenery /><Birds elapsed={elapsed} /><MeadowCows elapsed={elapsed} /></>;
}
