import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// 1. 장면, 카메라, 렌더러
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x222222);

const camera = new THREE.PerspectiveCamera(
    60, window.innerWidth / window.innerHeight, 0.1, 1000
);
camera.position.set(0, 2, 6);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

// 2. 조명
scene.add(new THREE.AmbientLight(0xffffff, 1.2));
const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
dirLight.position.set(5, 12, 8);
scene.add(dirLight);

// 3. 컨트롤 (OrbitControls)
const controls = new OrbitControls(camera, renderer.domElement);
controls.enablePan = true;
controls.screenSpacePanning = true;

// 4. 모델 중심 저장용 변수
let modelCenter = new THREE.Vector3(0, 0, 0);

// 5. GLB 모델 로드
const loader = new GLTFLoader();
loader.load(
    'model.glb',
    (gltf) => {
        scene.add(gltf.scene);

        // 모델의 중심 자동 계산
        const box = new THREE.Box3().setFromObject(gltf.scene);
        box.getCenter(modelCenter);
        controls.target.copy(modelCenter); // 최초에만 center로 세팅
        controls.update();

        // (디버그: 모델 중심/크기 로그)
        const size = new THREE.Vector3();
        box.getSize(size);
        console.log('Bounding box:', box);
        console.log('Size:', size);
        console.log('Center:', modelCenter);

        animate(); // 모델이 로드된 뒤에 애니메이션 시작
    },
    undefined,
    (error) => {
        console.error('GLB 로드 실패:', error);
    }
);

// 6. 경로상에 원(파동) 파라미터
const start = new THREE.Vector3(0, 0.86, 0.01);       // 시상하부 위치
const end = new THREE.Vector3(0.2, 1.0, 0.05);        // 기관 위치(예시, 수정 가능)
const NUM_CIRCLES = 20;                               // 원 개수
const circles = [];
const circleParams = []; // 각 원의 애니메이션 상태

function createPathCircles(start, end) {
    circles.forEach(c => scene.remove(c));
    circles.length = 0;
    circleParams.length = 0;

    for (let i = 0; i < NUM_CIRCLES; ++i) {
        const t = i / (NUM_CIRCLES - 1);
        const pos = new THREE.Vector3().lerpVectors(start, end, t);

        const geometry = new THREE.CircleGeometry(0.035, 32);
        const material = new THREE.MeshBasicMaterial({
            color: 0xffe066,
            transparent: true,
            opacity: 0.0,
            depthWrite: false,
            side: THREE.DoubleSide,
        });

        const circle = new THREE.Mesh(geometry, material);
        circle.position.copy(pos);
        circle.position.z += 0.01; // 겹침 방지
        circle.rotateX(-Math.PI / 2);

        scene.add(circle);
        circles.push(circle);

        circleParams.push({
            delay: i * 0.04,   // 시간차(파동처럼 앞에서 뒤로 퍼지도록)
            alpha: 0.0,        // 현재 알파값
            phase: 0,          // 0: 대기, 1: 나타남, 2: 사라짐
            t: 0               // 진행 시간
        });
    }
}

// spacebar로 실행
document.addEventListener('keydown', (e) => {
    // 파동
    if (e.code === 'Space') {
        createPathCircles(start, end);
        pathAnimTime = 0;
        pathAnimationActive = true;
    }

    // ----- 화면 기준 카메라 평행이동 (WASDQE/방향키) -----
    const MOVE_STEP = 0.05;
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);

    // 카메라 → target 방향 (카메라가 바라보는 방향)
    forward.subVectors(controls.target, camera.position).normalize();
    // "우측" 벡터 (forward x up)
    right.crossVectors(forward, up).normalize();
    // "위쪽" 벡터 (오른손 좌표계: right x forward)
    up.crossVectors(right, forward).normalize();

    let move = new THREE.Vector3();
    if (e.code === 'KeyW' || e.code === 'ArrowUp')     move.add(up);
    if (e.code === 'KeyS' || e.code === 'ArrowDown')   move.addScaledVector(up, -1);
    if (e.code === 'KeyA' || e.code === 'ArrowLeft')   move.addScaledVector(right, -1);
    if (e.code === 'KeyD' || e.code === 'ArrowRight')  move.add(right);
    if (e.code === 'KeyQ')                             move.add(forward);
    if (e.code === 'KeyE')                             move.addScaledVector(forward, -1);
    if (move.lengthSq() > 0) {
        move.normalize().multiplyScalar(MOVE_STEP);
        camera.position.add(move);
        controls.target.add(move); // 카메라와 target을 함께 이동
        controls.update();
    }
});

// 7. 파동 애니메이션
let pathAnimationActive = false;
let pathAnimTime = 0;

function animate() {
    requestAnimationFrame(animate);

    // 경로를 따라 원들이 시간차로 나타났다 사라지는 애니메이션
    if (pathAnimationActive) {
        pathAnimTime += 0.02;
        let allDone = true;

        for (let i = 0; i < circles.length; ++i) {
            const c = circles[i];
            const param = circleParams[i];

            if (pathAnimTime < param.delay) {
                c.material.opacity = 0.0;
                param.phase = 0;
                allDone = false;
                continue;
            }
            if (param.phase === 0) {
                param.t = 0;
                param.phase = 1;
            }
            if (param.phase === 1) {
                param.t += 0.04;
                c.material.opacity = Math.min(1, param.t * 2);
                if (c.material.opacity >= 1) {
                    param.phase = 2;
                    param.t = 0;
                }
                allDone = false;
                continue;
            }
            if (param.phase === 2) {
                param.t += 0.03;
                c.material.opacity = Math.max(0, 1 - param.t * 2);
                if (c.material.opacity > 0) allDone = false;
            }
        }
        if (allDone) {
            pathAnimationActive = false;
        }
    }

    // animate에서 controls.target은 고정하지 않음!
    controls.update();

    renderer.render(scene, camera);
}

// 8. 창 크기 대응
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
