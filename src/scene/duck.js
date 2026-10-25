import * as THREE from "three";

// A small stand-in for the MicroDuck preset, drawn for the home screen: orange feet, servo legs, a rounded body,
// a bendy neck and a big head with a bill. Units match the rover (about 1.5 tall).
const mat = (color, metalness = 0.15, roughness = 0.55) => new THREE.MeshStandardMaterial({ color, metalness, roughness });
const part = (geometry, material, x = 0, y = 0, z = 0, scale) => {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  if (scale) m.scale.set(...scale);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
};
const ball = (r) => new THREE.SphereGeometry(r, 28, 20);

export function makeDuck() {
  const duck = new THREE.Group();
  const orange = mat("#F2762E"), yellow = mat("#F5C23A"), white = mat("#F4F1EA", 0.05, 0.6), dark = mat("#2B2F3A", 0.25, 0.6), alu = mat("#C9CED6", 0.55, 0.38);

  for (const side of [-1, 1]) {
    const x = side * 0.3;
    duck.add(part(new THREE.BoxGeometry(0.32, 0.06, 0.62), orange, x, 0.03, 0.1)); // foot
    duck.add(part(new THREE.BoxGeometry(0.22, 0.3, 0.2), dark, x, 0.21, 0)); // leg servo
    duck.add(part(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 24), alu, x, 0.265, 0.0)); // hip hub
    duck.add(part(new THREE.CylinderGeometry(0.04, 0.04, 0.2, 12), alu, x, 0.4, 0)); // upper leg
  }
  duck.add(part(ball(0.5), white, 0, 0.72, -0.02, [1.05, 0.62, 0.9])); // body
  const tail = part(new THREE.ConeGeometry(0.12, 0.3, 16), yellow, 0, 0.8, -0.55);
  tail.rotation.x = -Math.PI / 2 - 0.35;
  duck.add(tail);
  duck.add(part(new THREE.CylinderGeometry(0.07, 0.09, 0.3, 16), dark, 0, 1.05, 0.12)); // neck servo

  const head = new THREE.Group();
  head.name = "head";
  head.position.set(0, 1.4, 0.2);
  head.add(part(ball(0.4), orange, 0, 0, 0, [1.12, 0.9, 1]));
  head.add(part(ball(0.3), yellow, 0, -0.1, 0.38, [1, 0.32, 0.9])); // bill
  for (const side of [-1, 1]) {
    head.add(part(ball(0.12), white, side * 0.24, 0.1, 0.3));
    head.add(part(ball(0.06), dark, side * 0.26, 0.1, 0.41));
  }
  duck.add(head);
  return duck;
}
