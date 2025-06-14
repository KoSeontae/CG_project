import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let scene, camera, renderer, controls;
let modelPivot, modelRoot;
let waypoints = [];
let glitter;
let initialCameraPosition, initialTarget;
let isDragging = false;
const previousMousePosition = { x: 0, y: 0 };
const rotationSpeed = 0.02;

// 애니메이션 관련 변수
let mixer, slowAction, fastAction, stomachAction, intestineAction, clock;

init();
loadModel();
animate();

function init() {
  // ——————————————————
  // 1) 기본 씬/카메라/렌더러/컨트롤
  // ——————————————————
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x222222);

  // 조명
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const dirLight = new THREE.DirectionalLight(0xffffff, 1);
  dirLight.position.set(5, 10, 7.5);
  scene.add(dirLight);

  // 카메라
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 2, 6);

  // 렌더러
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  // OrbitControls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableRotate = false;
  controls.enablePan    = false;

  // **초기 상태 저장**
  initialCameraPosition = camera.position.clone();
  initialTarget = controls.target.clone();

  // 애니메이션 클록 생성
  clock = new THREE.Clock();

  // 버튼 추가: 교감/부교감 활성화
  const symBtn = document.createElement('button');
  symBtn.textContent = '교감 활성화';
  symBtn.style = 'position: absolute; top: 10px; left: 10px; z-index: 1;';
  symBtn.onclick = activateSympathetic;
  document.body.appendChild(symBtn);

  const paraBtn = document.createElement('button');
  paraBtn.textContent = '부교감 활성화';
  paraBtn.style = 'position: absolute; top: 40px; left: 10px; z-index: 1;';
  paraBtn.onclick = activateParasympathetic;
  document.body.appendChild(paraBtn);

  // 이벤트 리스너
  window.addEventListener('resize', onWindowResize);
  window.addEventListener('keydown', onKeyDown);

  // 마우스 드래그로 pivot 회전
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
      // 1) 모델의 바운딩 박스와 중심 계산
      const sceneBB = new THREE.Box3().setFromObject(gltf.scene);
      const center  = sceneBB.getCenter(new THREE.Vector3());

      // 2) pivot 그룹 생성 및 scene에 추가
      modelPivot = new THREE.Group();
      modelPivot.position.copy(center);
      scene.add(modelPivot);

      // 3) 모델을 pivot 내부로 이동시키기
      gltf.scene.position.sub(center);
      modelPivot.add(gltf.scene);
      modelRoot = gltf.scene;

      // 4) OrbitControls 타겟 갱신 & 초기 타겟 저장
      controls.target.copy(center);
      controls.update();
      initialTarget.copy(center);

      // 5) waypoints를 pivot 로컬 좌표로 계산
      scene.updateMatrixWorld(true);
      const nodeNames = [
        'Hypothalamusr_grp1091',
        'Spinal_dura003_BezierCurve458',
        'Heart_Generated_Mesh_From_X3D787'
      ];
      waypoints = nodeNames.map(name => {
        const obj = modelRoot.getObjectByName(name);
        if (!obj) {
          console.warn(`⚠️ 노드를 찾을 수 없음: ${name}`);
          return null;
        }
        const box = new THREE.Box3().setFromObject(obj);
        const worldCenter = box.getCenter(new THREE.Vector3());
        return worldCenter.sub(center);
      }).filter(v => v !== null);

      // 6) glitter 메쉬를 pivot의 자식으로 추가
      const gGeo = new THREE.SphereGeometry(0.05, 8, 8);
      const gMat = new THREE.MeshBasicMaterial({ color: 0xffff66, transparent: true });
      glitter = new THREE.Mesh(gGeo, gMat);
      modelPivot.add(glitter);
      glitter.visible = false;

      // 7) AnimationMixer와 Action 설정
      mixer = new THREE.AnimationMixer(gltf.scene);
      const slowClip = THREE.AnimationClip.findByName(gltf.animations, 'SlowHeartbeat');
      const fastClip = THREE.AnimationClip.findByName(gltf.animations, 'FastHeartbeat');
      const stomachClip = THREE.AnimationClip.findByName(gltf.animations, 'StomachMoving');
      const intestineClip = THREE.AnimationClip.findByName(gltf.animations, 'IntestineMoving');

      slowAction = mixer.clipAction(slowClip);
      fastAction = mixer.clipAction(fastClip);
      stomachAction = mixer.clipAction(stomachClip);
      intestineAction = mixer.clipAction(intestineClip);

      // 초기 상태: 부교감 (느린 심장 + 소화 활동)
      slowAction.setLoop(THREE.LoopRepeat).play();
      stomachAction.setLoop(THREE.LoopRepeat).play();
      intestineAction.setLoop(THREE.LoopRepeat).play();
    },
    undefined,
    error => {
      console.error('GLB 로드 실패:', error);
    }
  );
}

// 교감 활성화: 느린 심장 -> 빠른 심장 전환, 소화 정지
function activateSympathetic() {
  if (!mixer) return;
  slowAction.crossFadeTo(fastAction, 0.5, true);
  stomachAction.stop();
  intestineAction.stop();
}

// 부교감 활성화: 빠른 심장 -> 느린 심장 전환, 소화 재시작
function activateParasympathetic() {
  if (!mixer) return;
  fastAction.crossFadeTo(slowAction, 0.5, true);
  stomachAction.reset().setLoop(THREE.LoopRepeat).play();
  intestineAction.reset().setLoop(THREE.LoopRepeat).play();
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
  // ◆ R: 리셋
  if (e.code === 'KeyR') {
    camera.position.copy(initialCameraPosition);
    controls.target.copy(initialTarget);
    controls.update();
    if (modelPivot) modelPivot.quaternion.set(0, 0, 0, 1);
    return;
  }

  // ◆ Space: glitter 애니메이션
  if (e.code === 'Space') {
    if (waypoints.length < 2) return;
    startGlitterAnimation();
    return;
  }

  // ◆ WASD / Q/E / 화살표키: 평행 이동
  const MOVE_STEP = 0.1;
  const forward = new THREE.Vector3().subVectors(controls.target, camera.position).normalize();
  const right   = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  const up      = new THREE.Vector3().crossVectors(right, forward).normalize();

  let move = new THREE.Vector3();
  if (e.code === 'KeyW'   || e.code === 'ArrowUp')    move.add(up);
  if (e.code === 'KeyS'   || e.code === 'ArrowDown')  move.addScaledVector(up, -1);
  if (e.code === 'KeyA'   || e.code === 'ArrowLeft')  move.addScaledVector(right, -1);
  if (e.code === 'KeyD'   || e.code === 'ArrowRight') move.add(right);
  if (e.code === 'KeyQ')                              move.add(forward);
  if (e.code === 'KeyE')                              move.addScaledVector(forward, -1);

  if (move.lengthSq() > 0) {
    move.normalize().multiplyScalar(MOVE_STEP);
    camera.position.add(move);
    controls.target.add(move);
    controls.update();
  }
}

function startGlitterAnimation() {
  dimModel(true);
  glitter.visible = true;
  let idx = 0, speed = 0.1;

  const step = () => {
    if (idx >= waypoints.length - 1) {
      glitter.visible = false;
      dimModel(false);
      return;
    }
    const from = waypoints[idx], to = waypoints[idx + 1];
    let t = 0;
    const tick = () => {
      t += speed;
      if (t >= 1) { idx++; return step(); }
      glitter.position.lerpVectors(from, to, t);
      glitter.material.opacity = 1 - (t * 0.5);
      requestAnimationFrame(tick);
    };
    tick();
  };

  step();
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
