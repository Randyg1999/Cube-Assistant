// ---------- Scene setup ----------
const viewport = document.getElementById('viewport');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x6b7078);
const cubeVisualGroup = new THREE.Group();
scene.add(cubeVisualGroup);

const camera = new THREE.PerspectiveCamera(40, viewport.clientWidth / viewport.clientHeight, 0.1, 100);
camera.position.set(4.2, 4.0, 5.2);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(viewport.clientWidth, viewport.clientHeight);
viewport.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 4;
controls.maxDistance = 14;
controls.enablePan = false;

scene.add(new THREE.AmbientLight(0xffffff, 0.65));
const key = new THREE.DirectionalLight(0xffffff, 0.9);
key.position.set(5, 8, 6);
scene.add(key);
const fill = new THREE.DirectionalLight(0xffffff, 0.35);
fill.position.set(-6, -3, -4);
scene.add(fill);

window.addEventListener('resize', () => {
  camera.aspect = viewport.clientWidth / viewport.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(viewport.clientWidth, viewport.clientHeight);
});

