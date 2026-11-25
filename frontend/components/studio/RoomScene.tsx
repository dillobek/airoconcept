"use client";

import { Canvas, ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { PlacedItem } from "./catalog";

type Props = {
  items: PlacedItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

function Furniture({ item, selected, onSelect }: { item: PlacedItem; selected: boolean; onSelect: () => void }) {
  const onClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSelect();
  };
  const size: [number, number, number] = [item.width, item.height, item.depth];
  const y = item.height / 2;
  const soft = item.shape === "sofa" ? "#5d8c87" : item.color;
  return (
    <group position={[item.x, 0, item.z]} rotation={[0, item.rotation, 0]} onClick={onClick}>
      <mesh position={[0, y, 0]} castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial color={soft} roughness={0.58} />
      </mesh>
      {item.shape === "cabinet" && <mesh position={[0, item.height * 0.57, item.depth / 2 + 0.006]}><boxGeometry args={[item.width * 0.03, item.height * 0.62, 0.025]} /><meshStandardMaterial color="#d8b987" metalness={0.25} /></mesh>}
      {item.shape === "tall" && <mesh position={[0, item.height * 0.52, item.depth / 2 + 0.006]}><boxGeometry args={[item.width * 0.025, item.height * 0.78, 0.02]} /><meshStandardMaterial color="#d8b987" metalness={0.25} /></mesh>}
      {item.shape === "table" && <mesh position={[0, item.height * 0.93, 0]}><boxGeometry args={[item.width * 1.06, 0.08, item.depth * 1.06]} /><meshStandardMaterial color={item.color} /></mesh>}
      {item.shape === "sofa" && <mesh position={[0, item.height * 0.72, -item.depth * 0.38]}><boxGeometry args={[item.width, item.height * 0.52, item.depth * 0.22]} /><meshStandardMaterial color="#507873" /></mesh>}
      {selected && <mesh position={[0, y, 0]}><boxGeometry args={[item.width + 0.04, item.height + 0.04, item.depth + 0.04]} /><meshBasicMaterial color="#159b8c" wireframe /></mesh>}
    </group>
  );
}

function Shell() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[6.6, 5.2]} /><meshStandardMaterial color="#eaf0ed" roughness={0.9} /></mesh>
      <mesh position={[0, 1.55, -2.6]} receiveShadow><boxGeometry args={[6.6, 3.1, 0.08]} /><meshStandardMaterial color="#f9fbfa" /></mesh>
      <mesh position={[-3.3, 1.55, 0]} receiveShadow><boxGeometry args={[0.08, 3.1, 5.2]} /><meshStandardMaterial color="#f5f7f5" /></mesh>
      <mesh position={[3.3, 1.55, 0]} receiveShadow><boxGeometry args={[0.08, 3.1, 5.2]} /><meshStandardMaterial color="#f5f7f5" /></mesh>
      <mesh position={[-1.55, 1.78, -2.54]}><boxGeometry args={[1.35, 1.05, 0.025]} /><meshStandardMaterial color="#a9ded8" emissive="#4daea2" emissiveIntensity={0.18} /></mesh>
      <mesh position={[2.05, 1.05, -2.54]}><boxGeometry args={[0.82, 2.08, 0.03]} /><meshStandardMaterial color="#b98a63" /></mesh>
    </group>
  );
}

export default function RoomScene({ items, selectedId, onSelect }: Props) {
  return (
    <Canvas shadows camera={{ position: [2.25, 3.6, 5.75], fov: 45 }} dpr={[1, 1.75]}>
      <color attach="background" args={["#d9f1ee"]} />
      <ambientLight intensity={1.2} />
      <directionalLight castShadow intensity={1.45} position={[4, 7, 4]} shadow-mapSize={[1024, 1024]} />
      <Shell />
      {items.map((item) => <Furniture key={item.placementId} item={item} selected={item.placementId === selectedId} onSelect={() => onSelect(item.placementId)} />)}
      <OrbitControls makeDefault target={[0, 0.85, -0.45]} minDistance={3.8} maxDistance={11} maxPolarAngle={Math.PI / 2.08} />
    </Canvas>
  );
}
