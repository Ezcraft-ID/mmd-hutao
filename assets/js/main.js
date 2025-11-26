// ============================================================
// Import - Menggunakan Import Map
// ============================================================

import * as BABYLON from '@babylonjs/core';
import * as BabylonMMD from 'babylon-mmd';

console.log('📦 BABYLON loaded:', typeof BABYLON);
console.log('📦 BabylonMMD loaded:', typeof BabylonMMD);
console.log('📦 BabylonMMD exports:', Object.keys(BabylonMMD));

const { SdefInjector } = BabylonMMD;

// Cari loader yang tersedia
const PmxLoader = BabylonMMD.PmxLoader || BabylonMMD.default?.PmxLoader;

// ============================================================
// Setup
// ============================================================

const canvas = document.getElementById('renderCanvas');
const loadingDiv = document.getElementById('loading');

if (!canvas) {
    console.error('❌ Canvas not found!');
}

const engine = new BABYLON.Engine(canvas, true, {
    preserveDrawingBuffer: true,
    stencil: true,
    antialias: true
});

// Apply SDEF
if (SdefInjector) {
    SdefInjector.OverrideEngineCreateEffect(engine);
    console.log('✅ SDEF Injector applied');
}

// Register PMX Loader
if (PmxLoader) {
    BABYLON.SceneLoader.RegisterPlugin(new PmxLoader());
    console.log('✅ PMX Loader registered');
} else {
    console.warn('⚠️ PmxLoader not found, trying alternative...');
}

// ============================================================
// Create Scene
// ============================================================

const createScene = async function () {
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.1, 0.1, 0.15, 1);

    // ========== KAMERA ==========
    const camera = new BABYLON.ArcRotateCamera(
        "camera",
        -Math.PI / 2,
        Math.PI / 2.5,
        25,
        new BABYLON.Vector3(0, 10, 0),
        scene
    );
    camera.attachControl(canvas, true);
    camera.minZ = 0.1;
    camera.maxZ = 1000;
    camera.wheelPrecision = 10;
    camera.lowerRadiusLimit = 5;
    camera.upperRadiusLimit = 100;

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
        { width: 50, height: 50 },
        scene
    );
    const groundMaterial = new BABYLON.StandardMaterial("groundMat", scene);
    groundMaterial.diffuseColor = new BABYLON.Color3(0.15, 0.15, 0.2);
    groundMaterial.specularColor = new BABYLON.Color3(0, 0, 0);
    ground.material = groundMaterial;

    // ========== LOAD MMD MODEL ==========
    const modelPath = "assets/model/";
    const modelFile = "model.pmx";

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