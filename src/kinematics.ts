/**
 * Kinematics for a 3-cable soft robot (SpiRobs).
 * Maps cable lengths to backbone parameters (length, curvature, orientation).
 */

export interface RobotState {
  length: number;      // Total central backbone length (L)
  curvature: number;   // Curvature (kappa)
  phi: number;         // Bending orientation (phi)
  theta: number;       // Bending angle (theta = kappa * L)
}

export const CABLE_DISTANCE = 15; // Distance from center to cable (mm)

export function calculateKinematics(l1: number, l2: number, l3: number): RobotState {
  // Central backbone length is the average of the three cable lengths
  const L = (l1 + l2 + l3) / 3;

  // Intermediate values for curvature calculation
  // Based on the geometric relationship: li = L * (1 + kappa * d * cos(phi - phi_i))
  // where phi_i = [0, 2pi/3, 4pi/3]
  
  const d = CABLE_DISTANCE;
  
  // Curvature kappa
  // From the sum of squares of differences:
  const term = l1 * l1 + l2 * l2 + l3 * l3 - l1 * l2 - l2 * l3 - l3 * l1;
  const kappa = (2 * Math.sqrt(Math.max(0, term))) / (3 * d * L);

  // Bending orientation phi
  const phi = Math.atan2(Math.sqrt(3) * (l2 - l3), 2 * l1 - l2 - l3);

  // Bending angle theta
  const theta = kappa * L;

  return {
    length: L,
    curvature: kappa,
    phi,
    theta,
  };
}

/**
 * Generates points along the backbone for visualization.
 */
export function getBackbonePoints(state: RobotState, segments: number = 50) {
  const { length, curvature, phi, theta } = state;
  const points: [number, number, number][] = [];

  if (curvature < 0.0001) {
    // Straight line
    for (let i = 0; i <= segments; i++) {
      const s = (i / segments) * length;
      points.push([0, s, 0]);
    }
  } else {
    // Constant curvature arc
    const radius = 1 / curvature;
    for (let i = 0; i <= segments; i++) {
      const s = (i / segments) * length;
      const alpha = s * curvature; // Angle along the arc

      // Local coordinates in the bending plane
      const x_local = radius * (1 - Math.cos(alpha));
      const y_local = radius * Math.sin(alpha);

      // Rotate to orientation phi
      const x = x_local * Math.cos(phi);
      const z = x_local * Math.sin(phi);
      const y = y_local;

      points.push([x, y, z]);
    }
  }

  return points;
}
