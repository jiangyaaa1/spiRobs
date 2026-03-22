import React, { useMemo } from 'react';
import * as THREE from 'three';
import { calculateKinematics, getBackbonePoints } from '../kinematics';

interface FingerData {
  l1: number;
  l2: number;
  l3: number;
}

interface SpiRobsModelProps {
  fingers: FingerData[];
  cableDistance: number;
}

export const SpiRobsModel: React.FC<SpiRobsModelProps> = ({ fingers, cableDistance }) => {
  // Base parameters for the 3 fingers' positions on the main base
  const baseRadius = 25;
  const fingerAngles = [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3];

  return (
    <group>
      {/* Main Base - Dark Cylinder */}
      <mesh position={[0, -30, 0]}>
        <cylinderGeometry args={[baseRadius + 10, baseRadius + 10, 60, 32]} />
        <meshStandardMaterial color="#1a1a1a" metalness={0.8} roughness={0.2} />
      </mesh>
      
      {/* Top Cap of the base */}
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[baseRadius + 10, baseRadius + 10, 2, 32]} />
        <meshStandardMaterial color="#333" metalness={0.9} />
      </mesh>

      {/* Render 3 Independent SpiRobs Fingers */}
      {fingers.map((finger, fIdx) => {
        const angle = fingerAngles[fIdx];
        const baseX = baseRadius * Math.cos(angle);
        const baseZ = baseRadius * Math.sin(angle);
        
        // Calculate kinematics for this specific finger
        const state = calculateKinematics(finger.l1, finger.l2, finger.l3, cableDistance);
        const backbonePoints = getBackbonePoints(state, 30);
        const curve = new THREE.CatmullRomCurve3(backbonePoints.map(p => new THREE.Vector3(...p)));
        
        const segments = 20; // Number of beads/segments per finger
        
        return (
          <group key={fIdx} position={[baseX, 0, baseZ]} rotation={[0, -angle, 0]}>
            {/* The "Beaded" look - individual segments along the curve */}
            {Array.from({ length: segments }).map((_, sIdx) => {
              const t = sIdx / (segments - 1);
              const pos = curve.getPoint(t);
              const tangent = curve.getTangent(t);
              const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
              
              // Taper the finger: segments get smaller towards the tip
              const scale = 1.0 - (t * 0.5);
              const radius = 5 * scale;

              return (
                <mesh key={sIdx} position={pos} quaternion={quaternion}>
                  <torusGeometry args={[radius, 1.8, 12, 24]} />
                  <meshStandardMaterial 
                    color="#ffffff" 
                    roughness={0.3} 
                    metalness={0.1}
                  />
                </mesh>
              );
            })}
            
            {/* Inner core of the finger */}
            <mesh>
              <tubeGeometry args={[curve, 40, 1.2, 8, false]} />
              <meshStandardMaterial color="#ddd" metalness={0.5} />
            </mesh>

            {/* Visualize the 3 cables for this finger */}
            {[0, 1, 2].map(cIdx => {
              const phi_i = (cIdx * 2 * Math.PI) / 3;
              const cablePoints: THREE.Vector3[] = [];
              
              for (let i = 0; i <= 20; i++) {
                const t = i / 20;
                const p = curve.getPoint(t);
                const tangent = curve.getTangent(t);
                
                const up = new THREE.Vector3(0, 1, 0);
                let normal = new THREE.Vector3().crossVectors(tangent, up).normalize();
                if (normal.length() < 0.01) normal.set(1, 0, 0);
                const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();
                
                const offset = new THREE.Vector3()
                  .addScaledVector(normal, cableDistance * Math.cos(phi_i))
                  .addScaledVector(binormal, cableDistance * Math.sin(phi_i));
                
                cablePoints.push(p.clone().add(offset));
              }
              
              const cableGeo = new THREE.BufferGeometry().setFromPoints(cablePoints);
              const cableMat = new THREE.LineBasicMaterial({
                color: cIdx === 0 ? "#ff4444" : cIdx === 1 ? "#44ff44" : "#ffff44",
                linewidth: 1,
                transparent: true,
                opacity: 0.6
              });
              const cableLine = new THREE.Line(cableGeo, cableMat);
              
              return (
                <primitive key={cIdx} object={cableLine} />
              );
            })}
          </group>
        );
      })}

      {/* Lighting and Environment */}
      <ambientLight intensity={0.6} />
      <pointLight position={[100, 100, 100]} intensity={1.5} />
      
      <gridHelper args={[400, 40, 0xcccccc, 0xeeeeee]} position={[0, -30, 0]} />
    </group>
  );
};
