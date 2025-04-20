// client/js/graphics.js (Replace the entire file content with this)

// Assumes THREE is global (loaded via <script> tag in index.html)
import { PlayerMesh } from './PlayerMesh.js';
import { ProjectileMesh } from './ProjectileMesh.js';
import { NpcMesh } from './NpcMesh.js';
import { Constants } from './constants.js';

// --- Graphics Preset Configurations ---
const GRAPHICS_PRESETS = {
    low: {
        pixelRatio: 1.0,
        shadowMapSize: 1024, // Smaller shadow map
        shadowMapEnabled: true, // Keep basic shadows
        shadowMapType: THREE.PCFShadowMap, // Basic shadow type
        antialias: false, // Turn off antialiasing
        fogEnabled: false, // Turn off fog
        toneMapping: THREE.NoToneMapping,
    },
    medium: {
        pixelRatio: Math.min(window.devicePixelRatio, 1.5), // Slightly lower pixel ratio cap
        shadowMapSize: 2048, // Medium shadow map
        shadowMapEnabled: true,
        shadowMapType: THREE.PCFSoftShadowMap, // Soft shadows
        antialias: true, // Enable antialiasing
        fogEnabled: true, // Enable fog
        toneMapping: THREE.ACESFilmicToneMapping,
    },
    high: {
        pixelRatio: window.devicePixelRatio, // Native pixel ratio
        shadowMapSize: 4096, // Larger shadow map
        shadowMapEnabled: true,
        shadowMapType: THREE.PCFSoftShadowMap,
        antialias: true,
        fogEnabled: true,
        toneMapping: THREE.ACESFilmicToneMapping,
    }
};
// --- End Graphics Presets ---


/**
 * Manages the Three.js scene, rendering, and visual objects.
 */
export class GraphicsManager {
    constructor(canvasElement) {
        if (!canvasElement) throw new Error("[GraphicsManager] Canvas element missing.");
        this.canvas = canvasElement;

        // Core components
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.dirLight = null; // <<< Reference to directional light
        this.ambientLight = null; // <<< Reference to ambient light
        if (typeof THREE === 'undefined') {
            console.error("FATAL: THREE library not loaded globally before GraphicsManager initialization!");
            throw new Error("THREE library not available.");
        }
        this.clock = new THREE.Clock();

        // Object management Maps
        this.players = new Map();
        this.projectiles = new Map();
        this.npcs = new Map();
        this.obstacles = new Map();

        // Local player state refs
        this.localPlayerId = null;
        this.localPlayerMesh = null;

        // Timing for interpolation
        this.lastNetworkUpdateTime = 0;
        this.serverUpdateRateMs = 1000 / Constants.SERVER_BROADCAST_RATE_HZ;

        // Animation loop
        this.animationFrameId = null;

        // <<< Graphics Setting State >>>
        this.currentGraphicsSetting = 'medium'; // Default setting

        this._initialize();
        console.log("[GraphicsManager] Initialized.");
    }

    /** Sets up scene, camera, renderer, lighting, environment */
    _initialize() {
        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB);
        // Fog setup moved to applyGraphicsSetting

        // Camera
        this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 8, 14);
        this.camera.lookAt(0, 1, 0);

        // Renderer (initial setup)
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas /* antialias handled by settings */ });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        // PixelRatio, ShadowMap, ToneMapping handled by settings

        // Lighting
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.6); // Store reference
        this.scene.add(this.ambientLight);

        this.dirLight = new THREE.DirectionalLight(0xffffff, 1.0); // Store reference
        this.dirLight.position.set(40, 50, 30);
        this.dirLight.castShadow = true;
        // Shadow map size/properties handled by settings
        this.dirLight.shadow.camera.near = 0.5; this.dirLight.shadow.camera.far = 150;
        this.dirLight.shadow.camera.left = -80; this.dirLight.shadow.camera.right = 80;
        this.dirLight.shadow.camera.top = 80; this.dirLight.shadow.camera.bottom = -80;
        this.scene.add(this.dirLight);
        this.scene.add(this.dirLight.target);

        // Apply default graphics settings after renderer and lights are created
        this.applyGraphicsSetting(this.currentGraphicsSetting); // Apply 'medium' initially

        // Ground & Grid
        const groundGeo = new THREE.PlaneGeometry(250, 250);
        const groundMat = new THREE.MeshLambertMaterial({ color: 0x90EE90 });
        const groundMesh = new THREE.Mesh(groundGeo, groundMat);
        groundMesh.rotation.x = -Math.PI / 2; groundMesh.receiveShadow = true;
        this.scene.add(groundMesh);
        const grid = new THREE.GridHelper(250, 50, 0xcccccc, 0xcccccc);
        grid.position.y = 0.01; this.scene.add(grid);

        // Resize Listener
        this._onWindowResize = this._onWindowResize.bind(this);
        window.addEventListener('resize', this._onWindowResize);
    }

    /** Applies graphics settings based on the chosen level */
    applyGraphicsSetting(level = 'medium') {
        if (!this.renderer || !this.scene || !this.dirLight) {
            console.warn("[GraphicsManager] Cannot apply settings: Renderer, Scene or Light not ready.");
            return;
        }
        const settings = GRAPHICS_PRESETS[level] || GRAPHICS_PRESETS.medium;
        this.currentGraphicsSetting = level;
        console.log(`[GraphicsManager] Applying graphics setting: ${level}`, settings);

        // --- Renderer Settings ---
        // Need to recreate renderer for antialias change
        if (this.renderer.antialias !== settings.antialias) {
            console.log("[GraphicsManager] Recreating renderer for antialias change.");
            this.renderer.dispose(); // Dispose old context
            this.renderer = new THREE.WebGLRenderer({
                canvas: this.canvas,
                antialias: settings.antialias // Set new value
            });
            // Reapply size after recreation
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        }
        this.renderer.setPixelRatio(settings.pixelRatio);
        this.renderer.shadowMap.enabled = settings.shadowMapEnabled;
        this.renderer.shadowMap.type = settings.shadowMapType;
        // Performance: only update shadow maps when needed? Requires manual control.
        // this.renderer.shadowMap.autoUpdate = true; // Default: true
        this.renderer.toneMapping = settings.toneMapping;

        // --- Light Settings ---
        this.dirLight.castShadow = settings.shadowMapEnabled; // Enable/disable light casting shadow
        if (settings.shadowMapEnabled) {
            if (this.dirLight.shadow.mapSize.width !== settings.shadowMapSize) {
                this.dirLight.shadow.mapSize.set(settings.shadowMapSize, settings.shadowMapSize);
                // Need to dispose old map and notify material update? Usually Three handles this if map size changes.
                this.dirLight.shadow.map = null; // Force regeneration maybe?
            }
        }

        // --- Scene Settings ---
        if (settings.fogEnabled && !this.scene.fog) {
            this.scene.fog = new THREE.Fog(0x87CEEB, 75, 200); // Add fog if enabled and not present
        } else if (!settings.fogEnabled && this.scene.fog) {
            this.scene.fog = null; // Remove fog if disabled and present
        }

        console.log(`[GraphicsManager] Settings applied for level: ${level}`);
    }


    // --- Rest of GraphicsManager (render loop, object management, etc.) ---
    // ... (Keep the existing _onWindowResize, startRendering, stopRendering methods) ...
    // ... (Keep the existing _renderLoop, _updateCameraPosition methods) ...
    // ... (Keep the existing setLocalPlayerId method) ...
    // ... (Keep the existing addOrUpdatePlayer, removePlayer, updateLocalPlayerPose, triggerPlayerHitEffect methods) ...
    // ... (Keep the existing addOrUpdateProjectile, removeProjectile methods) ...
    // ... (Keep the existing addOrUpdateNpc, removeNpc, triggerNpcHitEffect methods - check NpcMesh class brace) ...
    // ... (Keep the existing createObstacles method) ...
    // ... (Keep the existing processGameStateUpdate method) ...
    // ... (Keep the existing getLocalPlayerMesh, getPlayerCount methods) ...
    // ... (Keep the existing dispose method, ensuring it handles the potential renderer recreation) ...

     /** Handles window resize */
     _onWindowResize() {
        if (!this.camera || !this.renderer) return;
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        // Re-apply pixel ratio in case it changed? Usually not needed on resize.
        // const settings = GRAPHICS_PRESETS[this.currentGraphicsSetting] || GRAPHICS_PRESETS.medium;
        // this.renderer.setPixelRatio(settings.pixelRatio);
        console.log("[GraphicsManager] Window resized.");
    }

    /** Starts rendering loop */
    startRendering() {
        if (this.animationFrameId) return;
        console.log("[GraphicsManager] Starting rendering loop...");
        if (!this.clock.running) this.clock.start();
        if (!this.animationFrameId) {
             this.animationFrameId = requestAnimationFrame(this._renderLoop.bind(this));
        }
    }

    /** Stops rendering loop */
    stopRendering() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
            if (this.clock.running) this.clock.stop();
            console.log("[GraphicsManager] Rendering loop stopped.");
        }
    }

    /** Main render loop */
    _renderLoop() {
        if (!this.renderer || this.animationFrameId === null) return;
        this.animationFrameId = requestAnimationFrame(this._renderLoop.bind(this));
        const deltaTime = this.clock.getDelta();
        const currentTime = performance.now();
        const timeSinceUpdate = currentTime - this.lastNetworkUpdateTime;
        const interpolationAlpha = Math.min(Math.max(0, timeSinceUpdate / this.serverUpdateRateMs), 1.0);

        this.localPlayerMesh?._updateAnimations?.();
        this.players.forEach(p => { if (!p.isLocalPlayer) p.interpolate?.(interpolationAlpha); });
        this.projectiles.forEach(p => p.interpolate?.(interpolationAlpha));
        this.npcs.forEach(n => n.interpolate?.(interpolationAlpha, this.camera)); // Pass camera for billboard
        this._updateCameraPosition(deltaTime);

        if (this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }

    /** Updates camera position to follow local player */
    _updateCameraPosition(deltaTime) {
        if (!this.localPlayerMesh || !this.localPlayerMesh.isAlive || !this.camera || typeof THREE === 'undefined') return;
        try {
            const targetCamPos = new THREE.Vector3();
            const offset = new THREE.Vector3(0, Constants.CAMERA_FOLLOW_HEIGHT, Constants.CAMERA_FOLLOW_DISTANCE);
            offset.applyQuaternion(this.localPlayerMesh.quaternion);
            targetCamPos.copy(this.localPlayerMesh.position).add(offset);
            const lerpFactor = 1.0 - Math.exp(-deltaTime * 5.0);
            this.camera.position.lerp(targetCamPos, lerpFactor);
            const lookAtPos = new THREE.Vector3().copy(this.localPlayerMesh.position);
            lookAtPos.y += 1.0;
            this.camera.lookAt(lookAtPos);
        } catch (e) { console.error("Error in _updateCameraPosition:", e); }
    }

    /** Sets local player ID and updates mesh reference */
    setLocalPlayerId(playerId) {
        this.localPlayerId = playerId;
        console.log(`[GraphicsManager] Local player ID set: ${playerId}`);
        this.localPlayerMesh = this.players.get(playerId) || null;
         this.players.forEach((mesh, id) => {
             if (mesh.localPlayerIndicator) mesh.localPlayerIndicator.visible = (id === playerId);
         });
    }

    /** Adds or updates a player mesh */
    addOrUpdatePlayer(playerData) {
        if (!this.scene || !playerData?.id) return;
        if (this.players.has(playerData.id)) {
            this.players.get(playerData.id)?.updateFromNetwork?.(playerData);
        } else {
            const isLocal = playerData.id === this.localPlayerId;
            console.log(`[GraphicsManager] Adding player mesh: ${playerData.name || playerData.id} (Local: ${isLocal})`);
            try {
                if (typeof PlayerMesh !== 'function') throw new Error("PlayerMesh is not defined or not a constructor");
                const playerMesh = new PlayerMesh(playerData, isLocal);
                this.scene.add(playerMesh);
                this.players.set(playerData.id, playerMesh);
                if (isLocal) this.localPlayerMesh = playerMesh;
            } catch(e) { console.error("Error creating PlayerMesh:", e, "Data:", playerData); }
        }
    }

    /** Removes a player mesh */
    removePlayer(playerId) {
        if (!this.scene || !playerId || !this.players.has(playerId)) return;
        console.log(`[GraphicsManager] Removing player mesh: ${playerId}`);
        const mesh = this.players.get(playerId);
        this.scene.remove(mesh);
        mesh?.dispose?.();
        this.players.delete(playerId);
        if (playerId === this.localPlayerId) this.localPlayerMesh = null;
    }

    /** Updates local player pose directly */
    updateLocalPlayerPose(position, rotation, inputFlags = {}) {
        this.localPlayerMesh?.updateLocalPlayerPose?.(position, rotation, inputFlags);
    }

    /** Triggers hit effect on a player */
    triggerPlayerHitEffect(playerId) {
        this.players.get(playerId)?.triggerHitEffect?.();
    }

    /** Adds or updates a projectile mesh */
    addOrUpdateProjectile(projectileData) {
        if (!this.scene || !projectileData?.id) return;
        if (this.projectiles.has(projectileData.id)) {
             this.projectiles.get(projectileData.id)?.updateFromNetwork?.(projectileData);
        } else {
            try {
                if (typeof ProjectileMesh !== 'function') throw new Error("ProjectileMesh is not defined or not a constructor");
                const projMesh = new ProjectileMesh(projectileData);
                this.scene.add(projMesh);
                this.projectiles.set(projectileData.id, projMesh);
            } catch(e) { console.error("Error creating ProjectileMesh:", e, "Data:", projectileData); }
        }
    }

    /** Removes a projectile mesh */
    removeProjectile(projectileId) {
        if (!this.scene || !projectileId || !this.projectiles.has(projectileId)) return;
        const mesh = this.projectiles.get(projectileId);
        mesh?.onDestroy?.();
        this.scene.remove(mesh);
        mesh?.dispose?.();
        this.projectiles.delete(projectileId);
    }

     /** Adds or updates an NPC mesh */
    addOrUpdateNpc(npcData) {
        if (!this.scene || !npcData?.id) return;
        if (this.npcs.has(npcData.id)) {
            this.npcs.get(npcData.id)?.updateFromNetwork?.(npcData);
        } else {
            console.log(`[GraphicsManager] Adding NPC mesh: ${npcData.id} (${npcData.type || 'Unknown'})`);
             try {
                if (typeof NpcMesh !== 'function') throw new Error("NpcMesh is not defined or not a constructor");
                const npcMesh = new NpcMesh(npcData);
                this.scene.add(npcMesh);
                this.npcs.set(npcData.id, npcMesh);
             } catch(e) { console.error("Error creating NpcMesh:", e, "Data:", npcData); }
        }
    }

    /** Removes an NPC mesh */
    removeNpc(npcId) {
        if (!this.scene || !npcId || !this.npcs.has(npcId)) return;
        console.log(`[GraphicsManager] Removing NPC mesh: ${npcId}`);
        const mesh = this.npcs.get(npcId);
        this.scene.remove(mesh);
        mesh?.dispose?.();
        this.npcs.delete(npcId);
     }

     /** Triggers hit effect on an NPC */
     triggerNpcHitEffect(npcId) {
        this.npcs.get(npcId)?.triggerHitEffect?.();
     }

     /** Creates obstacle meshes based on world data received from server. */
    createObstacles(obstacleData) {
        if (!this.scene || !Array.isArray(obstacleData) || typeof THREE === 'undefined') return;
        console.log(`[GraphicsManager] Creating ${obstacleData.length} obstacles...`);
        this.obstacles.forEach(mesh => { this.scene.remove(mesh); mesh.geometry?.dispose?.(); /* Dispose materials */ });
        this.obstacles.clear();

        obstacleData.forEach(obs => {
            if (!obs?.id || !obs.position || !obs.size || isNaN(obs.position.x) || isNaN(obs.size.x) || obs.size.x <= 0 || obs.size.y <= 0 || obs.size.z <= 0) {
                console.warn("[GraphicsManager] Skipping invalid obstacle data:", obs); return;
            }
            let geometry;
            const size = obs.size;
            const material = new THREE.MeshLambertMaterial({ color: obs.color || 0xaaaaaa });
             if (obs.type === 'cylinder') { // <<< Handle Cylinder Obstacles
                 geometry = new THREE.CylinderGeometry(size.x / 2, size.x / 2, size.y, 16); // Use x for radius
                 geometry.translate(0, size.y / 2, 0); // Align base to ground
             } else { // Default to cube
                 geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
                 geometry.translate(0, size.y / 2, 0); // Align base to ground
             }
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.copy(obs.position);
            mesh.castShadow = true; mesh.receiveShadow = true;
            this.scene.add(mesh);
            this.obstacles.set(obs.id, mesh);
        });
    }

    /** Processes the full game state update received from the server. */
    processGameStateUpdate(payload) {
        if (!payload || !this.scene) return;
        this.lastNetworkUpdateTime = performance.now();

        // Process Players
        const currentPlayerIds = new Set();
        if (Array.isArray(payload.players)) {
            payload.players.forEach(p => { if (p?.id) { currentPlayerIds.add(p.id); this.addOrUpdatePlayer(p); }});
        }
        const playerIdsToRemove = []; this.players.forEach((_, id) => { if (!currentPlayerIds.has(id)) playerIdsToRemove.push(id); });
        playerIdsToRemove.forEach(id => this.removePlayer(id));

        // Process NPCs
        const currentNpcIds = new Set();
        if (Array.isArray(payload.npcs)) {
            payload.npcs.forEach(n => { if (n?.id) { currentNpcIds.add(n.id); this.addOrUpdateNpc(n); }});
        }
        const npcIdsToRemove = []; this.npcs.forEach((_, id) => { if (!currentNpcIds.has(id)) npcIdsToRemove.push(id); });
        npcIdsToRemove.forEach(id => this.removeNpc(id));

        // Process Projectiles
        const currentProjIds = new Set();
        if (Array.isArray(payload.projectiles)) {
            payload.projectiles.forEach(p => { if (p?.id) { currentProjIds.add(p.id); this.addOrUpdateProjectile(p); }});
        }
        const projIdsToRemove = []; this.projectiles.forEach((_, id) => { if (!currentProjIds.has(id)) projIdsToRemove.push(id); });
        projIdsToRemove.forEach(id => this.removeProjectile(id));
    }

    /** Gets the local player's mesh object. */
    getLocalPlayerMesh() { return this.localPlayerMesh; }
    /** Gets the current count of player meshes being managed. */
    getPlayerCount() { return this.players?.size || 0; }

    /** Cleans up Three.js resources and removes event listeners. */
    dispose() {
        console.log("[GraphicsManager] Disposing graphics resources...");
        this.stopRendering();
        window.removeEventListener('resize', this._onWindowResize);
        this.players?.forEach(m => m?.dispose?.()); this.players?.clear();
        this.projectiles?.forEach(m => m?.dispose?.()); this.projectiles?.clear();
        this.npcs?.forEach(m => m?.dispose?.()); this.npcs?.clear();
        this.obstacles?.forEach(m => { this.scene?.remove(m); m?.geometry?.dispose?.(); /* Dispose materials */ }); this.obstacles?.clear();
        this.localPlayerMesh = null; this.localPlayerId = null;
        if (this.scene) {
             const childrenToRemove = [...this.scene.children];
             childrenToRemove.forEach(o => { /* ... dispose geometry/materials/textures ... */ });
        }
        if (this.renderer) { this.renderer.dispose(); this.renderer.forceContextLoss(); this.renderer = null; }
        this.scene = null; this.camera = null; this.clock = null;
        console.log("[GraphicsManager] Disposal complete.");
    }

} // <<< End of GraphicsManager class