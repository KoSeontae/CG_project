import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let scene, camera, renderer, controls;
let modelPivot, modelRoot;
let initialCameraPosition, initialTarget;
let isDragging = false;
const previousMousePosition = { x: 0, y: 0 };
const rotationSpeed = 0.02;

let mixer, slowAction, fastAction, stomachAction, intestineAction, clock;
let currentNerveType = null;

const routes = {};
const glitters = {};

init();
loadModel();
animate();

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x222222);

  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const dirLight = new THREE.DirectionalLight(0xffffff, 1);
  dirLight.position.set(5, 10, 7.5);
  scene.add(dirLight);

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 2, 6);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableRotate = false;
  controls.enablePan = false;

  initialCameraPosition = camera.position.clone();
  initialTarget = controls.target.clone();

  clock = new THREE.Clock();

  // lil-gui
  const gui = new window.lilgui();
  gui.domElement.style.position = 'absolute';
  gui.domElement.style.top = '10px';
  gui.domElement.style.left = '10px';

  const nerveFolder = gui.addFolder('신경 유형 선택');
  nerveFolder.add({ '교감 활성화': activateSympathetic }, '교감 활성화');
  nerveFolder.add({ '부교감 활성화': activateParasympathetic }, '부교감 활성화');

  const organFolder = gui.addFolder('기관 선택');
  organFolder.add({ 심장: () => animateRoute('heart') }, '심장');
  organFolder.add({ 소화계: () => animateRoute('digestive') }, '소화계');

  window.addEventListener('resize', onWindowResize);
  window.addEventListener('keydown', onKeyDown);

  const canvas = renderer.domElement;
  canvas.addEventListener('mousedown', e => {
    isDragging = true;
    previousMousePosition.x = e.clientX;
    previousMousePosition.y = e.clientY;
  });
  canvas.addEventListener('mousemove', e => {
    if (!isDragging || !modelPivot) return;
    const deltaMove = {
      x: e.clientX - previousMousePosition.x,
      y: e.clientY - previousMousePosition.y
    };
    const deltaQuat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        deltaMove.y * rotationSpeed,
        deltaMove.x * rotationSpeed,
        0,
        'XYZ'
      )
    );
    modelPivot.quaternion.multiplyQuaternions(deltaQuat, modelPivot.quaternion);
    previousMousePosition.x = e.clientX;
    previousMousePosition.y = e.clientY;
  });
  canvas.addEventListener('mouseup', () => isDragging = false);
}

function loadModel() {
  const loader = new GLTFLoader();
  loader.load(
    'test_animation.glb',
    gltf => {
      const sceneBB = new THREE.Box3().setFromObject(gltf.scene);
      const center = sceneBB.getCenter(new THREE.Vector3());

      modelPivot = new THREE.Group();
      modelPivot.position.copy(center);
      scene.add(modelPivot);

      gltf.scene.position.sub(center);
      modelPivot.add(gltf.scene);
      modelRoot = gltf.scene;

      controls.target.copy(center);
      controls.update();
      initialTarget.copy(center);

      // ✳️ 기관별 경로 및 신경 타입 설정
      const nodeSets = {
        heart: {
          type: ['sympathetic', 'parasympathetic'],
          nodes: [
            'Hypothalamusr_grp1091',
            'Spinal_dura003_BezierCurve458',
            'Heart_Generated_Mesh_From_X3D787']
        },
        digestive: {
          type: ['sympathetic', 'parasympathetic'],
          nodes: [
            'Hypothalamusr_grp1091',
            'Spinal_dura003_BezierCurve458',
            'Oesophagus_Generated_Mesh_From_X3D731',
            'Stomach001_grp1846',
            'Small_intestine_grp11973',
            'Ascending_colon_grp1480', 
            'Transverse_colon_grp1455', 
            'Descending_colon_grp1280']
        }
      };

      scene.updateMatrixWorld(true);
      for (const organ in nodeSets) {
        const nodeNames = nodeSets[organ].nodes;
        const waypoints = nodeNames.map(name => {
          const obj = modelRoot.getObjectByName(name);
          if (!obj) {
            console.warn(`⚠️ 노드 없음: ${name}`);
            return null;
          }
          const box = new THREE.Box3().setFromObject(obj);
          return box.getCenter(new THREE.Vector3()).sub(center);
        }).filter(v => v !== null);

        routes[organ] = {
          type: nodeSets[organ].type,
          waypoints
        };

        const gGeo = new THREE.SphereGeometry(0.05, 8, 8);
        const gMat = new THREE.MeshStandardMaterial({
          color: 0xaaaaaa,
          emissive: 0xaaaaaa,
          emissiveIntensity: 1.5,
          transparent: true,
          opacity: 1.0
        });

        const glitter = new THREE.Mesh(gGeo, gMat);
        glitter.visible = false;
        modelPivot.add(glitter);
        glitters[organ] = glitter;
      }

      // 애니메이션
      mixer = new THREE.AnimationMixer(gltf.scene);
      const slowClip = THREE.AnimationClip.findByName(gltf.animations, 'SlowHeartbeat');
      const fastClip = THREE.AnimationClip.findByName(gltf.animations, 'FastHeartbeat');
      const stomachClip = THREE.AnimationClip.findByName(gltf.animations, 'StomachMoving');
      const intestineClip = THREE.AnimationClip.findByName(gltf.animations, 'IntestineMoving');

      if (slowClip) slowAction = mixer.clipAction(slowClip);
      if (fastClip) fastAction = mixer.clipAction(fastClip);
      if (stomachClip) stomachAction = mixer.clipAction(stomachClip);
      if (intestineClip) intestineAction = mixer.clipAction(intestineClip);

      slowAction?.setLoop(THREE.LoopRepeat).play();
      stomachAction?.setLoop(THREE.LoopRepeat).play();
      intestineAction?.setLoop(THREE.LoopRepeat).play();
    },
    undefined,
    error => console.error('GLB 로드 실패:', error)
  );
}

function activateSympathetic() {
  currentNerveType = 'sympathetic';

  for (const glitter of Object.values(glitters)) {
    glitter.material.color.set(0xff3366);
    glitter.material.emissive.set(0xff3366);
  }

  if (!mixer || !slowAction || !fastAction) return;
  slowAction.crossFadeTo(fastAction, 0.5, true);
  stomachAction?.stop();
  intestineAction?.stop();
}

function activateParasympathetic() {
  currentNerveType = 'parasympathetic';

  for (const glitter of Object.values(glitters)) {
    glitter.material.color.set(0x3399ff);
    glitter.material.emissive.set(0x3399ff);
  }

  if (!mixer || !fastAction || !slowAction) return;
  fastAction.crossFadeTo(slowAction, 0.5, true);
  stomachAction?.reset().setLoop(THREE.LoopRepeat).play();
  intestineAction?.reset().setLoop(THREE.LoopRepeat).play();
}

function animateRoute(organ) {
  const route = routes[organ];
  const glitter = glitters[organ];
  if (!route || !glitter) return;

  // type이 배열일 경우, 현재 신경 타입이 포함되어 있으면 통과
  if (
    route.type &&
    Array.isArray(route.type) &&
    !route.type.includes(currentNerveType)
  ) {
    console.warn(`⚠️ ${organ}는 ${route.type} 신경입니다. 현재는 ${currentNerveType} 모드입니다.`);
    return;
  }
  // type이 문자열인 경우(이전 방식 호환)
  if (
    route.type &&
    !Array.isArray(route.type) &&
    route.type !== 'both' &&
    route.type !== currentNerveType
  ) {
    console.warn(`⚠️ ${organ}는 ${route.type} 신경입니다. 현재는 ${currentNerveType} 모드입니다.`);
    return;
  }

  let idx = 0;
  glitter.visible = true;
  dimModel(true);
  const points = route.waypoints;

  const step = () => {
    if (idx >= points.length - 1) {
      glitter.visible = false;
      dimModel(false);
      return;
    }
    const from = points[idx], to = points[idx + 1];
    let t = 0;
    const tick = () => {
      t += 0.1;
      if (t >= 1) {
        idx++;
        return step();
      }
      glitter.position.lerpVectors(from, to, t);
      glitter.material.opacity = 1 - (t * 0.5);
      requestAnimationFrame(tick);
    };
    tick();
  };

  step();
}

function dimModel(dim) {
  if (!modelRoot) return;
  modelRoot.traverse(obj => {
    if (obj.isMesh) {
      obj.material.transparent = true;
      obj.material.opacity = dim ? 0.2 : 1.0;
    }
  });
}

function onKeyDown(e) {
  if (e.code === 'KeyR') {
    camera.position.copy(initialCameraPosition);
    controls.target.copy(initialTarget);
    controls.update();
    if (modelPivot) modelPivot.quaternion.set(0, 0, 0, 1);
  }
  const MOVE_STEP = 0.2;
  // 카메라가 바라보는 방향 벡터 구하기
  const forward = new THREE.Vector3().subVectors(controls.target, camera.position).normalize();
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();

  let move = new THREE.Vector3();
  if (e.code === 'KeyW' || e.code === 'ArrowUp')  move.addScaledVector(up, -1);
  if (e.code === 'KeyS' || e.code === 'ArrowDown') move.add(up);
  if (e.code === 'KeyA' || e.code === 'ArrowRLeft') move.add(right);
  if (e.code === 'KeyD' || e.code === 'ArrowRight') move.addScaledVector(right, -1);

  if (move.lengthSq() > 0) {
    move.normalize().multiplyScalar(MOVE_STEP);
    camera.position.add(move);
    controls.target.add(move);
    controls.update();
}
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  if (mixer) mixer.update(delta);
  controls.update();
  renderer.render(scene, camera);
}
