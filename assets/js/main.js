// ============================================================
// Import - Menggunakan Import Map
// ============================================================

import * as BABYLON from '@babylonjs/core';
import * as BabylonMMD from 'babylon-mmd';

console.log('📦 BABYLON loaded:', typeof BABYLON);
console.log('📦 BabylonMMD loaded:', typeof BabylonMMD);
console.log('📦 BabylonMMD exports:', Object.keys(BabylonMMD));

// ---- Defensive exports detection ----
const { 
    SdefInjector, 
    PmxLoader, 
    MmdRuntime, 
    MmdCamera, 
    VmdLoader, 
    BvmdLoader,
    MmdPlayerControl,
    StreamAudioPlayer
} = BabylonMMD;

// Helper to safely call plugin registration
function tryRegisterPlugin(plugin, name = 'plugin') {
    if (!plugin) return false;
    try {
        const instance = (typeof plugin === 'function') ? new plugin() : plugin;
        BABYLON.SceneLoader.RegisterPlugin(instance);
        console.log(`✅ Registered ${name}`);
        return true;
    } catch (e) {
        console.warn(`⚠️ Failed to register ${name}:`, e);
        return false;
    }
}

// ============================================================
// Setup
// ============================================================

const canvas = document.getElementById('renderCanvas');
const loadingDiv = document.getElementById('loading');

if (!canvas) {
    const msg = 'Canvas element with id "renderCanvas" is missing.';
    console.error('❌', msg);
    if (loadingDiv) updateLoading(msg);
    throw new Error(msg);
}

const engine = new BABYLON.Engine(canvas, true, {
    preserveDrawingBuffer: true,
    stencil: true,
    antialias: true
});

// Apply SDEF
if (SdefInjector) {
    try {
        if (typeof SdefInjector.OverrideEngineCreateEffect === 'function') {
            SdefInjector.OverrideEngineCreateEffect(engine);
            console.log('✅ SDEF Injector applied');
        }
    } catch (e) {
        console.warn('⚠️ Error while applying SdefInjector:', e);
    }
}

// Register PMX Loader
if (PmxLoader) {
    tryRegisterPlugin(PmxLoader, 'PmxLoader');
} else {
    console.warn('⚠️ PmxLoader not found in babylon-mmd exports.');
}

// ============================================================
// Create Scene
// ============================================================

const createScene = async function () {
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.1, 0.1, 0.15, 1);

    // ========== MMD RUNTIME (PENTING!) ==========
    const mmdRuntime = new MmdRuntime(scene);
    mmdRuntime.register(scene);
    console.log('✅ MmdRuntime created and registered');

    // ========== MMD CAMERA (untuk motion) ==========
    const mmdCamera = new MmdCamera("mmdCamera", new BABYLON.Vector3(0, 10, 0), scene);
    mmdCamera.maxZ = 5000;
    mmdCamera.minZ = 0.1;
    mmdCamera.attachControl(canvas, false);
    mmdRuntime.setCamera(mmdCamera);
    console.log('✅ MmdCamera created and set to runtime');

    // ========== FALLBACK CAMERA (untuk kontrol manual) ==========
    const arcCamera = new BABYLON.ArcRotateCamera(
        "arcCamera",
        -Math.PI / 2,
        Math.PI / 2.5,
        25,
        new BABYLON.Vector3(0, 10, 0),
        scene
    );
    arcCamera.minZ = 0.1;
    arcCamera.maxZ = 1000;
    arcCamera.wheelPrecision = 10;
    arcCamera.lowerRadiusLimit = 5;
    arcCamera.upperRadiusLimit = 100;
    // Tidak attach control by default - akan switch jika MMD camera aktif

    // Set MmdCamera sebagai active camera
    scene.activeCamera = mmdCamera;

    // ========== PENCAHAYAAN ==========
    const hemisphericLight = new BABYLON.HemisphericLight(
        "hemisphericLight",
        new BABYLON.Vector3(0, 1, 0),
        scene
    );
    hemisphericLight.intensity = 0.7;
    hemisphericLight.groundColor = new BABYLON.Color3(0.2, 0.2, 0.25);

    const directionalLight = new BABYLON.DirectionalLight(
        "directionalLight",
        new BABYLON.Vector3(-1, -2, 1),
        scene
    );
    directionalLight.intensity = 0.8;

    // ========== GROUND ==========
    const ground = BABYLON.MeshBuilder.CreateGround(
        "ground",
        { width: 100, height: 100 },
        scene
    );
    const groundMaterial = new BABYLON.StandardMaterial("groundMat", scene);
    groundMaterial.diffuseColor = new BABYLON.Color3(0.15, 0.15, 0.2);
    groundMaterial.specularColor = new BABYLON.Color3(0, 0, 0);
    ground.material = groundMaterial;
    ground.receiveShadows = true;

    // ========== LOAD MMD MODEL ==========
    const modelPath = "assets/model/";
    const modelFile = "model.pmx";

    // ========== CAMERA & MOTION MANIFEST ==========
    const camManifestUrl = 'assets/cam_motion/motion.json';
    let camOptions = [];
    let currentMmdModel = null;
    let audioPlayer = null;

    async function loadCamManifest() {
        try {
            const resp = await fetch(camManifestUrl);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            camOptions = data.map(item => ({
                name: item.name,
                audioPlayerFile: item.audioPlayerFile ? normalizePath(item.audioPlayerFile) : null,
                camMotionFile: item.camMotionFile ? normalizePath(item.camMotionFile) : null,
                modelMotionFile: item.modelMotionFile ? normalizePath(item.modelMotionFile) : null
            }));
            console.log('📦 Camera/motion manifest loaded:', camOptions.map(c => c.name));
        } catch (e) {
            console.warn('⚠️ No camera/motion manifest found', e);
            camOptions = [];
        }
    }

    function normalizePath(p) {
        if (!p) return p;
        return p.replace(/^res\//, 'assets/');
    }

    // UI untuk memilih motion
    function createCamSelectorUI(selectCallback) {
        let container = document.getElementById('camMotionUI');
        if (container) container.remove();

        container = document.createElement('div');
        container.id = 'camMotionUI';
        Object.assign(container.style, {
            position: 'fixed',
            right: '12px',
            top: '12px',
            zIndex: '1000',
            background: 'rgba(0,0,0,0.7)',
            color: 'white',
            padding: '12px',
            borderRadius: '8px',
            fontFamily: 'Arial, sans-serif',
            minWidth: '220px'
        });

        const title = document.createElement('div');
        title.textContent = '🎬 Camera / Motion';
        title.style.fontWeight = '700';
        title.style.marginBottom = '8px';
        container.appendChild(title);

        if (!camOptions || camOptions.length === 0) {
            const e = document.createElement('div');
            e.textContent = 'No motion files found';
            container.appendChild(e);
            document.body.appendChild(container);
            return;
        }

        const select = document.createElement('select');
        select.style.width = '100%';
        select.style.padding = '4px';
        camOptions.forEach((opt, idx) => {
            const o = document.createElement('option');
            o.value = String(idx);
            o.textContent = opt.name;
            select.appendChild(o);
        });
        container.appendChild(select);

        const btnContainer = document.createElement('div');
        btnContainer.style.marginTop = '8px';
        btnContainer.style.display = 'flex';
        btnContainer.style.gap = '6px';

        const btnApply = document.createElement('button');
        btnApply.textContent = '▶ Apply';
        btnApply.style.flex = '1';
        btnApply.onclick = () => selectCallback(camOptions[Number(select.value)]);
        btnContainer.appendChild(btnApply);

        const btnPlay = document.createElement('button');
        btnPlay.textContent = '⏵ Play';
        btnPlay.onclick = () => mmdRuntime.playAnimation();
        btnContainer.appendChild(btnPlay);

        const btnPause = document.createElement('button');
        btnPause.textContent = '⏸ Pause';
        btnPause.onclick = () => mmdRuntime.pauseAnimation();
        btnContainer.appendChild(btnPause);

        container.appendChild(btnContainer);

        // Switch camera button
        const btnSwitchCam = document.createElement('button');
        btnSwitchCam.textContent = '📷 Toggle Camera (MMD/Arc)';
        btnSwitchCam.style.marginTop = '8px';
        btnSwitchCam.style.width = '100%';
        btnSwitchCam.onclick = () => {
            if (scene.activeCamera === mmdCamera) {
                scene.activeCamera = arcCamera;
                arcCamera.attachControl(canvas, true);
                mmdCamera.detachControl();
                console.log('📷 Switched to ArcRotateCamera');
            } else {
                scene.activeCamera = mmdCamera;
                mmdCamera.attachControl(canvas, false);
                arcCamera.detachControl();
                console.log('📷 Switched to MmdCamera');
            }
        };
        container.appendChild(btnSwitchCam);

        document.body.appendChild(container);
    }

// ========== APPLY MOTION (FIXED!) ==========
async function applyMotion(chosen) {
    if (!chosen) return false;
    if (!currentMmdModel) {
        console.error('❌ MmdModel not created yet!');
        return false;
    }

    updateLoading('Loading motion files...');

    try {
        // Stop current animation
        mmdRuntime.pauseAnimation();
        mmdRuntime.seekAnimation(0, true);

        // Helper: Try loading with fallback to alternate extension
        async function loadMotionWithFallback(filePath, motionName) {
            if (!filePath) return null;
            
            const isBvmd = filePath.toLowerCase().endsWith('.bvmd');
            const isVmd = filePath.toLowerCase().endsWith('.vmd');
            
            // Try original file first
            try {
                const loader = isBvmd ? new BvmdLoader(scene) : new VmdLoader(scene);
                loader.loggingEnabled = true;
                const animation = await loader.loadAsync(motionName, filePath);
                console.log(`✅ Loaded ${motionName} from:`, filePath);
                return animation;
            } catch (e) {
                console.warn(`⚠️ Failed to load ${filePath}:`, e.exception?.message || e.message || e);
            }

            // Try alternate extension
            let altFile;
            if (isBvmd) {
                altFile = filePath.replace(/\.bvmd$/i, '.vmd');
            } else if (isVmd) {
                altFile = filePath.replace(/\.vmd$/i, '.bvmd');
            }

            if (altFile && altFile !== filePath) {
                console.log(`🔁 Trying alternate file: ${altFile}`);
                try {
                    const altIsBvmd = altFile.toLowerCase().endsWith('.bvmd');
                    const loader = altIsBvmd ? new BvmdLoader(scene) : new VmdLoader(scene);
                    loader.loggingEnabled = true;
                    const animation = await loader.loadAsync(motionName, altFile);
                    console.log(`✅ Loaded ${motionName} from alternate:`, altFile);
                    return animation;
                } catch (e2) {
                    console.warn(`⚠️ Alternate file also failed:`, e2.exception?.message || e2.message || e2);
                }
            }

            return null;
        }

        // Load camera motion
        if (chosen.camMotionFile) {
            console.log('📥 Loading camera motion:', chosen.camMotionFile);
            const cameraAnimation = await loadMotionWithFallback(chosen.camMotionFile, "cameraMotion");
            if (cameraAnimation) {
                mmdCamera.addAnimation(cameraAnimation);
                mmdCamera.setAnimation("cameraMotion");
                console.log('✅ Camera motion applied');
            } else {
                console.warn('⚠️ Could not load camera motion from any source');
            }
        }

        // Load model motion
        if (chosen.modelMotionFile) {
            console.log('📥 Loading model motion:', chosen.modelMotionFile);
            const modelAnimation = await loadMotionWithFallback(chosen.modelMotionFile, "modelMotion");
            if (modelAnimation) {
                currentMmdModel.addAnimation(modelAnimation);
                currentMmdModel.setAnimation("modelMotion");
                console.log('✅ Model motion applied');
            } else {
                console.warn('⚠️ Could not load model motion from any source');
            }
        }

        // Load audio if available
        if (chosen.audioPlayerFile) {
            console.log('📥 Loading audio:', chosen.audioPlayerFile);
            try {
                if (audioPlayer) {
                    audioPlayer.dispose();
                }
                audioPlayer = new StreamAudioPlayer(scene);
                audioPlayer.source = chosen.audioPlayerFile;
                mmdRuntime.setAudioPlayer(audioPlayer);
                console.log('✅ Audio player set');
            } catch (e) {
                console.warn('⚠️ Failed to load audio:', e);
            }
        }

        // Play animation
        mmdRuntime.playAnimation();
        console.log('▶️ Animation started');

        hideLoading();
        return true;

    } catch (error) {
        console.error('❌ Error applying motion:', error);
        updateLoading(`Error: ${error.message}`);
        return false;
    }
}

    // ========== LOAD MODEL ==========
    try {
        updateLoading("Loading MMD Model...");

        const result = await BABYLON.SceneLoader.ImportMeshAsync(
            "",
            modelPath,
            modelFile,
            scene,
            (event) => {
                if (event.lengthComputable) {
                    const percent = Math.round((event.loaded / event.total) * 100);
                    updateLoading(`Loading: ${percent}%`);
                }
            }
        );

        console.log("✅ Model loaded successfully!");
        console.log("📊 Loaded meshes:", result.meshes.length);

        const mmdMesh = result.meshes[0];

        if (mmdMesh) {
            mmdMesh.position.y = 0;
            console.log("📊 Mesh info:");
            console.log("   Name:", mmdMesh.name);

            // ========== PENTING: Buat MmdModel dari mesh ==========
            currentMmdModel = mmdRuntime.createMmdModel(mmdMesh);
            console.log('✅ MmdModel created from mesh');

            // Optional: Setup physics jika diperlukan
            // await mmdRuntime.initializeMmdModelPhysics(currentMmdModel);
        }

        // Load manifest dan buat UI
        await loadCamManifest();
        createCamSelectorUI(async (choice) => {
            console.log('▶️ Applying selection:', choice.name);
            await applyMotion(choice);
        });

        // Auto-apply first option
        if (camOptions && camOptions.length > 0) {
            console.log('▶️ Auto-applying first camera/motion set:', camOptions[0].name);
            await applyMotion(camOptions[0]);
        }

        hideLoading();

    } catch (error) {
        console.error("❌ Error loading model:", error);
        updateLoading(`Error: ${error.message}`);
    }

    return scene;
};

// ============================================================
// Helper Functions
// ============================================================

function updateLoading(text) {
    if (loadingDiv) {
        loadingDiv.textContent = text;
        loadingDiv.style.display = 'block';
    }
    console.log("📊 " + text);
}

function hideLoading() {
    if (loadingDiv) {
        loadingDiv.style.display = 'none';
    }
}

// ============================================================
// Run Application
// ============================================================

createScene().then((scene) => {
    engine.runRenderLoop(() => {
        if (scene && scene.activeCamera) {
            scene.render();
        }
    });
}).catch((error) => {
    console.error("Fatal error:", error);
    updateLoading(`Fatal Error: ${error.message}`);
});

window.addEventListener('resize', () => {
    engine.resize();
});

console.log("🎮 BabylonJS MMD Viewer initialized");