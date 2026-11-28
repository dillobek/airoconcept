"use client";

import { Suspense } from "react";
import { Canvas, type ThreeElements, type ThreeEvent } from "@react-three/fiber";
import { Clone, OrbitControls, useGLTF } from "@react-three/drei";
import type { RoomScene } from "@ip/core/scene";

// React 19 global JSX namespace'iga React Three Fiber elementlarini bog'laymiz.
declare module "react" {
  namespace JSX {
    interface IntrinsicElements extends ThreeElements {}
  }
}

export interface ItemProduct {
  id: string;
  name: string;
  dimensionsCm: { width: number; depth: number; height: number };
  modelGlbUrl: string | null;
}

interface Props {
  scene: RoomScene;
  products: Map<string, ItemProduct>;
  wallColor: string;
  floorColor: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

function Model({ url }: { url: string }) {
  const gltf = useGLTF(url);
  return <Clone object={gltf.scene} />;
}

/** 3D model yo'q mahsulot uchun real o'lchamdagi o'rinbosar quti */
function Placeholder({ p, selected }: { p: ItemProduct; selected: boolean }) {
  const w = p.dimensionsCm.width / 100;
  const d = p.dimensionsCm.depth / 100;
  const h = p.dimensionsCm.height / 100;
  return (
    <mesh position={[0, h / 2, 0]} castShadow>
      <boxGeometry args={[w, h, d]} />
      <meshStandardMaterial color={selected ? "#2e5e4e" : "#c9b89f"} />
    </mesh>
  );
}

export default function Room3D({ scene, products, wallColor, floorColor, selectedId, onSelect }: Props) {
  const { lengthM: L, widthM: W, heightM: H } = scene.room;
  return (
    <Canvas shadows camera={{ position: [L * 1.1, H * 1.6, W * 1.6], fov: 45 }} onPointerMissed={() => onSelect(null)} style={{ borderRadius: 24, background: "#e9e5dd" }}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[L, H * 2, W]} intensity={1.1} castShadow />
      <group position={[-L / 2, 0, -W / 2]}>
        {/* Pol */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[L / 2, 0, W / 2]} receiveShadow>
          <planeGeometry args={[L, W]} />
          <meshStandardMaterial color={floorColor} />
        </mesh>
        {/* Orqa va chap devor (old devorlar kesilgan — ichi ko'rinadi) */}
        <mesh position={[L / 2, H / 2, 0]}>
          <planeGeometry args={[L, H]} />
          <meshStandardMaterial color={wallColor} />
        </mesh>
        <mesh position={[0, H / 2, W / 2]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[W, H]} />
          <meshStandardMaterial color={wallColor} />
        </mesh>
        {scene.items.map((it) => {
          const p = products.get(it.productId);
          if (!p) return null;
          const selected = it.id === selectedId;
          return (
            <group
              key={it.id}
              position={[it.x, 0, it.z]}
              rotation={[0, (it.rotationDeg * Math.PI) / 180, 0]}
              onClick={(e: ThreeEvent<MouseEvent>) => {
                e.stopPropagation();
                onSelect(it.id);
              }}
            >
              {p.modelGlbUrl ? (
                <Suspense fallback={<Placeholder p={p} selected={selected} />}>
                  <Model url={p.modelGlbUrl} />
                </Suspense>
              ) : (
                <Placeholder p={p} selected={selected} />
              )}
            </group>
          );
        })}
      </group>
      <OrbitControls makeDefault maxPolarAngle={Math.PI / 2.05} minDistance={1.5} maxDistance={25} />
    </Canvas>
  );
}
