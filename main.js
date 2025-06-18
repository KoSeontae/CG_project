import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let scene, camera, renderer, controls;
let modelPivot, modelRoot;
let initialCameraPosition, initialTarget;
let isDragging = false;
const previousMousePosition = { x: 0, y: 0 };
const rotationSpeed = 0.02;

let mixer,
    slowAction,
    fastAction,
    stomachAction,
    intestineAction,
    clock,
    lungAction,
    lungFastAction;
let currentNerveType = null;

let currentWaveRAF = null;
let currentWaveFadeInterval = null;
let currentParticles = [];

const routes = {};
const glitterParticles = {};
const PARTICLE_COUNT = 10;
const PARTICLE_SIZE = 0.025;

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

    camera = new THREE.PerspectiveCamera(
        60,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
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
    gui.domElement.style.position = "absolute";
    gui.domElement.style.top = "10px";
    gui.domElement.style.left = "10px";

    const nerveFolder = gui.addFolder("신경 유형 선택");
    nerveFolder.add({ "교감 활성화": activateSympathetic }, "교감 활성화");
    nerveFolder.add(
        { "부교감 활성화": activateParasympathetic },
        "부교감 활성화"
    );

    const organFolder = gui.addFolder("기관 선택");
    organFolder.add({ 심장: () => animateRoute("heart") }, "심장");
    organFolder.add({ 소화계: () => animateRoute("digestive") }, "소화계");
    organFolder.add({ 동공: () => animateRoute("pupil") }, "동공");
    organFolder.add({ 폐: () => animateRoute("lung") }, "폐");

    window.addEventListener("resize", onWindowResize);
    window.addEventListener("keydown", onKeyDown);

    const canvas = renderer.domElement;
    canvas.addEventListener("mousedown", (e) => {
        isDragging = true;
        previousMousePosition.x = e.clientX;
        previousMousePosition.y = e.clientY;
    });
    canvas.addEventListener("mousemove", (e) => {
        if (!isDragging || !modelPivot) return;
        const deltaMove = {
            x: e.clientX - previousMousePosition.x,
            y: e.clientY - previousMousePosition.y,
        };
        const deltaQuat = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(
                deltaMove.y * rotationSpeed,
                deltaMove.x * rotationSpeed,
                0,
                "XYZ"
            )
        );
        modelPivot.quaternion.multiplyQuaternions(
            deltaQuat,
            modelPivot.quaternion
        );
        previousMousePosition.x = e.clientX;
        previousMousePosition.y = e.clientY;
    });
    canvas.addEventListener("mouseup", () => (isDragging = false));
}

function loadModel() {
    const loader = new GLTFLoader();
    loader.load(
        "test_animation.glb",
        (gltf) => {
            const sceneBB = new THREE.Box3().setFromObject(gltf.scene);
            const center = sceneBB.getCenter(new THREE.Vector3());

            const animations = gltf.animations;
            animations.forEach((clip, index) => {
                console.log(`  ${index + 1}. ${clip.name}`);
            });

            modelPivot = new THREE.Group();
            modelPivot.position.copy(center);
            scene.add(modelPivot);

            gltf.scene.position.sub(center);
            modelPivot.add(gltf.scene);
            modelRoot = gltf.scene;

            controls.target.copy(center);
            controls.update();
            initialTarget.copy(center);

            // nodeSets 정의 (각 기관별 노드명)
            const nodeSets = {
                heart: {
                    type: ["sympathetic", "parasympathetic"],
                    nodes: [
                        "Hypothalamusr_grp1091",
                        "Spinal_dura003_BezierCurve458",
                        "Heart_Generated_Mesh_From_X3D787",
                    ],
                },
                digestive: {
                    type: ["sympathetic", "parasympathetic"],
                    nodes: [
                        "Hypothalamusr_grp1091",
                        "Spinal_dura003_BezierCurve458",
                        "Oesophagus_Generated_Mesh_From_X3D731",
                        "Stomach001_grp1846",
                        "Small_intestine_grp11973",
                        "Ascending_colon_grp1480",
                        "Transverse_colon_grp1455",
                        "Descending_colon_grp1280",
                    ],
                },
                pupil: {
                    type: ["sympathetic", "parasympathetic"],
                    common: [
                        "Hypothalamusr_grp1091",
                        "Midbrainl_grp1067",
                        "Optic_chiasml_grp1061",
                    ],
                    left: [
                        "Optic_nerve_(II)l_BezierCurve494",
                        "Iris-l_grp1077",
                    ],
                    right: [
                        "Optic_nerve_(II)r_BezierCurve494",
                        "Iris-r_grp1077",
                    ],
                },
                lung: {
                    type: ["sympathetic", "parasympathetic"],
                    nodes: [
                        "Hypothalamusr_grp1091",
                        "Spinal_dura003_BezierCurve458",
                        "Trachea_Generated_Mesh_From_X3D829",
                        //"Superior_lobe_of_right_lung_Generated_Mesh_From_X3D814"
                        "4th_ribr_Generated_Mesh_From_X3D860",
                    ],
                },
            };

            // 모든 organ 반복
            scene.updateMatrixWorld(true);
            for (const organ in nodeSets) {
                // === pupil만 분기 구조 적용 ===
                if (organ === "pupil") {
                    // 공통/좌/우 node 이름 배열 준비
                    const commonNames = nodeSets.pupil.common;
                    const leftNames = nodeSets.pupil.left;
                    const rightNames = nodeSets.pupil.right;

                    // 공통 경로 waypoints
                    const waypointsCommon = commonNames
                        .map((name) => {
                            const obj = modelRoot.getObjectByName(name);
                            if (!obj) {
                                console.warn(`⚠️ 노드 없음: ${name}`);
                                return null;
                            }
                            const box = new THREE.Box3().setFromObject(obj);
                            return box
                                .getCenter(new THREE.Vector3())
                                .sub(center);
                        })
                        .filter((v) => v !== null);

                    // 좌/우 분기 경로(공통+분기)
                    const waypointsLeft = [
                        ...waypointsCommon,
                        ...leftNames
                            .map((name) => {
                                const obj = modelRoot.getObjectByName(name);
                                if (!obj) {
                                    console.warn(`⚠️ 노드 없음: ${name}`);
                                    return null;
                                }
                                const box = new THREE.Box3().setFromObject(obj);
                                return box
                                    .getCenter(new THREE.Vector3())
                                    .sub(center);
                            })
                            .filter((v) => v !== null),
                    ];
                    const waypointsRight = [
                        ...waypointsCommon,
                        ...rightNames
                            .map((name) => {
                                const obj = modelRoot.getObjectByName(name);
                                if (!obj) {
                                    console.warn(`⚠️ 노드 없음: ${name}`);
                                    return null;
                                }
                                const box = new THREE.Box3().setFromObject(obj);
                                return box
                                    .getCenter(new THREE.Vector3())
                                    .sub(center);
                            })
                            .filter((v) => v !== null),
                    ];

                    // 경로 저장
                    routes["pupil"] = {
                        type: nodeSets.pupil.type,
                        common: waypointsCommon,
                        left: waypointsLeft,
                        right: waypointsRight,
                    };

                    // glitter 파티클도 분기(좌/우) 별도 배열로 생성
                    glitterParticles["pupilLeft"] = [];
                    glitterParticles["pupilRight"] = [];
                    for (let i = 0; i < PARTICLE_COUNT; i++) {
                        glitterParticles["pupilLeft"].push(
                            createGlitterParticle(0xff3366)
                        );
                        glitterParticles["pupilRight"].push(
                            createGlitterParticle(0xff3366)
                        );
                    }
                }
                // === 나머지 organ ===
                else {
                    let nodeNames = nodeSets[organ].nodes;
                    const waypoints = nodeNames
                        .map((name) => {
                            const obj = modelRoot.getObjectByName(name);
                            if (!obj) {
                                console.warn(`⚠️ 노드 없음: ${name}`);
                                return null;
                            }
                            const box = new THREE.Box3().setFromObject(obj);
                            return box
                                .getCenter(new THREE.Vector3())
                                .sub(center);
                        })
                        .filter((v) => v !== null);

                    routes[organ] = {
                        type: nodeSets[organ].type,
                        waypoints,
                    };

                    glitterParticles[organ] = [];
                    for (let i = 0; i < PARTICLE_COUNT; i++) {
                        glitterParticles[organ].push(
                            createGlitterParticle(0xff3366)
                        );
                    }
                }
            }

            // --- Animation Mixer 및 클립(기존 코드 유지) ---
            mixer = new THREE.AnimationMixer(gltf.scene);
            const slowClip = THREE.AnimationClip.findByName(
                gltf.animations,
                "SlowHeartbeat"
            );
            const fastClip = THREE.AnimationClip.findByName(
                gltf.animations,
                "FastHeartbeat"
            );
            const stomachClip = THREE.AnimationClip.findByName(
                gltf.animations,
                "StomachMoving"
            );
            const intestineClip = THREE.AnimationClip.findByName(
                gltf.animations,
                "IntestineMoving"
            );
            const lungClip = THREE.AnimationClip.findByName(
                gltf.animations,
                "LungAnimation"
            );
            const lungFastClip = THREE.AnimationClip.findByName(
                gltf.animations,
                "LungAnimationFast"
            );

            if (slowClip) slowAction = mixer.clipAction(slowClip);
            if (fastClip) fastAction = mixer.clipAction(fastClip);
            if (stomachClip) stomachAction = mixer.clipAction(stomachClip);
            if (intestineClip)
                intestineAction = mixer.clipAction(intestineClip);
            if (lungClip) lungAction = mixer.clipAction(lungClip);
            if (lungFastClip) lungFastAction = mixer.clipAction(lungFastClip);

            slowAction?.setLoop(THREE.LoopRepeat).play();
            stomachAction?.setLoop(THREE.LoopRepeat).play();
            intestineAction?.setLoop(THREE.LoopRepeat).play();
            lungAction?.setLoop(THREE.LoopRepeat).play();
        },
        undefined,
        (error) => console.error("GLB 로드 실패:", error)
    );
}

function createGlitterParticle(colorHex) {
    const geo = new THREE.SphereGeometry(PARTICLE_SIZE, 8, 8);
    const mat = new THREE.MeshStandardMaterial({
        color: colorHex,
        emissive: colorHex,
        emissiveIntensity: 2.0,
        transparent: true,
        opacity: 1.0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    modelPivot.add(mesh);
    return mesh;
}

function setGlitterColorAll(colorHex) {
    for (const key in glitterParticles) {
        for (const p of glitterParticles[key]) {
            p.material.color.set(colorHex);
            p.material.emissive.set(colorHex);
        }
    }
}

function activateSympathetic() {
    currentNerveType = "sympathetic";

    setGlitterColorAll(0xff3366);
    if (!mixer || !slowAction || !fastAction) return;

    fastAction.reset().setLoop(THREE.LoopRepeat).play();
    lungFastAction.reset().setLoop(THREE.LoopRepeat).play();
    lungAction.crossFadeTo(lungFastAction, 0.5, true);
    slowAction.crossFadeTo(fastAction, 0.5, true);
    stomachAction?.stop();
    intestineAction?.stop();
}

function activateParasympathetic() {
    currentNerveType = "parasympathetic";

    setGlitterColorAll(0x3399ff);

    if (!mixer || !fastAction || !slowAction) return;

    slowAction.reset().setLoop(THREE.LoopRepeat).play();
    lungAction.reset().setLoop(THREE.LoopRepeat).play();
    fastAction.crossFadeTo(slowAction, 0.5, true);
    lungFastAction.crossFadeTo(lungAction, 0.5, true);
    stomachAction?.reset().setLoop(THREE.LoopRepeat).play();
    intestineAction?.reset().setLoop(THREE.LoopRepeat).play();
}

function stopCurrentWave() {
    if (currentWaveRAF) {
        cancelAnimationFrame(currentWaveRAF);
        currentWaveRAF = null;
    }
    if (currentWaveFadeInterval) {
        clearInterval(currentWaveFadeInterval);
        currentWaveFadeInterval = null;
    }
    if (currentParticles && currentParticles.length) {
        currentParticles.forEach(p => {
            p.visible = false;
            p.material.opacity = 1.0;
        });
    }
    // pupilLeft/right도 같이 비활성화(겹침방지)
    if (glitterParticles['pupilLeft']) {
        glitterParticles['pupilLeft'].forEach(p => {
            p.visible = false;
            p.material.opacity = 1.0;
        });
    }
    if (glitterParticles['pupilRight']) {
        glitterParticles['pupilRight'].forEach(p => {
            p.visible = false;
            p.material.opacity = 1.0;
        });
    }
}


function interpolateWaypoints(waypoints, spacing = 0.03) {
    const finePath = [];
    if (waypoints.length < 2) return waypoints;
    for (let i = 0; i < waypoints.length - 1; i++) {
        const start = waypoints[i];
        const end = waypoints[i + 1];
        const segVec = new THREE.Vector3().subVectors(end, start);
        const segLen = segVec.length();
        const steps = Math.ceil(segLen / spacing);
        for (let s = 0; s < steps; s++) {
            const t = s / steps;
            const pt = new THREE.Vector3().lerpVectors(start, end, t);
            finePath.push(pt);
        }
    }
    finePath.push(waypoints[waypoints.length - 1]);
    return finePath;
}

function animateRoute(organ) {
    if (currentNerveType == null) {
        console.warn("신경 유형이 선택되지 않았습니다. (중립 상태)");
        return;
    }
    stopCurrentWave();

    let colorHex = 0xff3366;
    if (currentNerveType === "parasympathetic") colorHex = 0x3399ff;

    // pupil 분기 처리
    if (organ === "pupil") {
        const route = routes.pupil;
        if (!route) return;

        // 동공 경로만 빠르게
        const pupilCommonSpeed = 1.2; // 공통 경로 속도
        const pupilBranchSpeed = 1.2; // 분기 후 속도

        const fineCommon = interpolateWaypoints(route.common, 0.03);
        animateGlitterWave(
            fineCommon,
            glitterParticles['pupilLeft'],
            colorHex,
            () => {
                let branchDoneCount = 0;
                const onBranchDone = () => {
                    branchDoneCount++;
                    if (branchDoneCount === 2) {
                        dimModel(false);
                        renderer.render(scene, camera);
                    }
                };

                const fineLeft = interpolateWaypoints(route.left.slice(route.common.length), 0.03);
                const fineRight = interpolateWaypoints(route.right.slice(route.common.length), 0.03);

                animateGlitterWave(
                    fineLeft,
                    glitterParticles['pupilLeft'],
                    colorHex,
                    onBranchDone,
                    false,
                    pupilBranchSpeed, // 분기 후 속도
                    null,
                    true
                );
                animateGlitterWave(
                    fineRight,
                    glitterParticles['pupilRight'],
                    colorHex,
                    onBranchDone,
                    false,
                    pupilBranchSpeed, // 분기 후 속도
                    null,
                    true
                );
            },
            false,
            pupilCommonSpeed, // 공통 경로 속도
            null,
            true
        );
        return;
    }

    // 기타 organ은 기존 방식
    const route = routes[organ];
    if (!route) return;

    const finePath = interpolateWaypoints(route.waypoints, 0.03);
    animateGlitterWave(finePath, glitterParticles[organ], colorHex);
}



function animateGlitterWave(
    waypoints,
    particles,
    colorHex = 0xff3366,
    callback,
    skipTrailFade = false,
    stepTOverride = null,
    holdOverride = null,
    keepDimmed = false // 추가 파라미터: true면 끝나도 dimModel(false) 호출 안함
) {
    for (const p of particles) {
        p.visible = false;
        p.material.color.set(colorHex);
        p.material.emissive.set(colorHex);
        p.material.opacity = 1.0;
        p.material.transparent = true;
    }
    currentParticles = particles;

    let t = 0;
    const N = waypoints.length - 1;
    const stepT = stepTOverride !== null ? stepTOverride : 0.8;
    const gap = 0.5;
    const LAST = 1;
    const HOLD = holdOverride !== null ? holdOverride : 300;
    const FINT = 10;
    let elapsed = 0;

    function step() {
        dimModel(true);

        t += stepT;
        const headIdx = t;

        for (let i = 0; i < particles.length; i++) {
            const idx = headIdx - i * gap;
            if (idx >= 0 && idx <= N) {
                const lo = Math.floor(idx), hi = Math.min(lo + 1, N);
                const alpha = idx - lo;
                particles[i].position.lerpVectors(
                    waypoints[lo],
                    waypoints[hi],
                    alpha
                );
                particles[i].visible = true;
            } else {
                particles[i].visible = false;
            }
        }

        controls.update();
        renderer.render(scene, camera);

        if (headIdx >= N + particles.length * gap) {
            particles.forEach(p => p.visible = false);
            // === 모델 밝기 복구를 콜백 쪽에서만 관리 ===
            if (callback) callback();
            else if (!keepDimmed) dimModel(false); // 기본은 밝기 복구
            renderer.render(scene, camera);
            return;
        }

        currentWaveRAF = requestAnimationFrame(step);
    }

    currentWaveRAF = requestAnimationFrame(step);
}


function dimModel(dim) {
    if (!modelRoot) return;
    modelRoot.traverse(obj => {
        if (obj.isMesh) {
            obj.material.transparent = true;
            obj.material.opacity = dim ? 0.1 : 1.0;
        }
    });
}

function onKeyDown(e) {
    if (e.code === 'KeyR') {
        camera.position.copy(initialCameraPosition);
        controls.target.copy(initialTarget);
        controls.update();
        if (modelPivot) modelPivot.quaternion.set(0, 0, 0, 1);
        return;
    }
    const MOVE_STEP = 0.2;

    // 카메라가 바라보는 방향 벡터
    const forward = new THREE.Vector3().subVectors(controls.target, camera.position).normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, forward).normalize();

    let move = new THREE.Vector3();
    if (e.code === 'KeyW' || e.code === 'ArrowUp')    move.addScaledVector(up, -1);
    if (e.code === 'KeyS' || e.code === 'ArrowDown')  move.add(up);
    if (e.code === 'KeyA' || e.code === 'ArrowLeft')  move.add(right);
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
