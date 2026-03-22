import React, { useMemo } from 'react';
import * as THREE from 'three';
import { RobotState, getBackbonePoints, CABLE_DISTANCE } from '../kinematics';

interface SpiRobsModelProps {
  state: RobotState;
  l1: number;
  l2: number;
  l3: number;
}

export const SpiRobsModel: React.FC<SpiRobsModelProps> = ({ state, l1, l2, l3 }) => {
  const backbonePoints = useMemo(() => getBackbonePoints(state), [state]);
  const curve = useMemo(() => {
    const vectors = backbonePoints.map(p => new THREE.Vector3(...p));
    return new THREE.CatmullRomCurve3(vectors);
  }, [backbonePoints]);

  // Helper to calculate cable points
  const getCablePoints = (cableIndex: number) => {
    const phi_i = (cableIndex * 2 * Math.PI) / 3;
    const d = CABLE_DISTANCE;
    const segments = 50;
    const points: THREE.Vector3[] = [];

    const { phi } = state;

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const p = curve.getPoint(t);
      const tangent = curve.getTangent(t);
      
      // Create a parallel transport frame or simple coordinate system
      const up = new THREE.Vector3(0, 1, 0);
      let normal = new THREE.Vector3().crossVectors(tangent, up).normalize();
      if (normal.length() < 0.01) normal.set(1, 0, 0);
      const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();
      
      const offset = new THREE.Vector3()
        .addScaledVector(normal, d * Math.cos(phi_i - phi))
        .addScaledVector(binormal, d * Math.sin(phi_i - phi));
      
      points.push(p.clone().add(offset));
    }
    return points;
  };

  const c1Points = useMemo(() => getCablePoints(0), [curve, state]);
  const c2Points = useMemo(() => getCablePoints(1), [curve, state]);
  const c3Points = useMemo(() => getCablePoints(2), [curve, state]);

  return (
    <group>
      {/* Base Plate */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[CABLE_DISTANCE + 5, CABLE_DISTANCE + 5, 2, 32]} />
        <meshStandardMaterial color="#333" />
      </mesh>

      {/* Backbone Spiral (Simplified as a thick tube for now) */}
      <mesh>
        <tubeGeometry args={[curve, 64, 2, 8, false]} />
        <meshStandardMaterial color="#4488ff" transparent opacity={0.6} />
      </mesh>

      {/* Spiral Wire Visualization */}
      {/* @ts-ignore */}
      <line>
        <bufferGeometry attach="geometry">
          <float32BufferAttribute
            attach="attributes-position"
            count={backbonePoints.length}
            array={new Float32Array(backbonePoints.flat())}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial attach="material" color="#00ffff" linewidth={2} />
      </line>

      {/* Cables */}
      <CableLine points={c1Points} color="#ff4444" />
      <CableLine points={c2Points} color="#44ff44" />
      <CableLine points={c3Points} color="#ffff44" />

      {/* End Effector Plate */}
      <group position={new THREE.Vector3(...backbonePoints[backbonePoints.length - 1])}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[CABLE_DISTANCE + 5, CABLE_DISTANCE + 5, 2, 32]} />
          <meshStandardMaterial color="#333" />
        </mesh>
      </group>

      {/* Grid and Axis */}
      <gridHelper args={[200, 20, 0x888888, 0x444444]} position={[0, -1, 0]} />
      <axesHelper args={[50]} />
    </group>
  );
};

const CableLine: React.FC<{ points: THREE.Vector3[]; color: string }> = ({ points, color }) => {
  const geometry = useMemo(() => {
    return new THREE.BufferGeometry().setFromPoints(points);
  }, [points]);

  return (
    /* @ts-ignore */
    <line geometry={geometry}>
      <lineBasicMaterial attach="material" color={color} linewidth={3} />
    </line>
  );
};
