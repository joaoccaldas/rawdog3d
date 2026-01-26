/**
 * 3D Camera Controller
 * Third-person camera with mouse look and smooth following
 */

import * as THREE from 'three';
import { CONFIG } from '../config.js';

export class Camera3D {
    constructor(game) {
        this.game = game;
        
        // Three.js camera
        this.camera = new THREE.PerspectiveCamera(
            70, // FOV
            window.innerWidth / window.innerHeight,
            0.1,
            500 // Far plane
        );
        
        // FOV settings for sprint effect
        this.baseFOV = 70;
        this.sprintFOV = 85;
        this.currentFOV = this.baseFOV;
        this.targetFOV = this.baseFOV;
        this.fovSmoothSpeed = 5;
        
        // Camera control settings
        this.distance = 15; // Distance from player
        this.minDistance = 0; // Allow first-person (0 distance)
        this.maxDistance = 50;
        
        // View mode: 0 = third-person, 1 = first-person, 2 = front-facing
        this.viewMode = 0;
        this.viewModes = [
            { name: 'Third Person', distance: 15 },
            { name: 'First Person', distance: 0 },
            { name: 'Front Facing', distance: 15, facingFront: true }
        ];
        
        this.pitch = -0.5; // Vertical angle (radians, negative = looking down)
        this.yaw = 0; // Horizontal angle (radians)
        
        this.minPitch = -Math.PI / 2 + 0.1; // Almost straight down
        this.maxPitch = Math.PI / 2 - 0.1; // Almost straight up
        
        // Smooth following
        this.targetPosition = new THREE.Vector3();
        this.currentPosition = new THREE.Vector3();
        this.smoothSpeed = 8;
        
        // Swimming bob effect
        this.swimBobTime = 0;
        this.swimBobIntensity = 0;
        
        // Shake effect
        this.shakeIntensity = 0;
        this.shakeDuration = 0;
        this.shakeTimer = 0;
        
        // Mouse control state
        this.isLocked = false;
        this.sensitivity = 0.002;
        
        // Zoom settings
        this.zoomSpeed = 2;
        
        // Initialize
        this.init();
    }
    
    /**
     * Toggle between view modes (F5 key)
     */
    toggleViewMode() {
        this.viewMode = (this.viewMode + 1) % this.viewModes.length;
        const mode = this.viewModes[this.viewMode];
        this.distance = mode.distance;
        
        // Show notification
        if (this.game.ui) {
            this.game.ui.showNotification(mode.name);
        }
        
        console.log('Camera view mode:', mode.name);
    }
    
    /**
     * Check if camera is in first-person mode
     */
    isFirstPerson() {
        return this.viewMode === 1 || this.distance < 1;
    }
    
    /**
     * Check if camera is in front-facing mode
     */
    isFrontFacing() {
        return this.viewMode === 2 && this.viewModes[2].facingFront;
    }
    
    init() {
        // Set initial position
        this.camera.position.set(0, 20, 20);
        this.camera.lookAt(0, 0, 0);
        
        // Pointer lock for mouse look - use the actual 3D canvas
        // Wait a moment for renderer to create the canvas
        const findCanvas = () => {
            // Prefer the actual canvas over the container
            return document.getElementById('game-canvas-3d') || 
                   document.querySelector('#game-container canvas') ||
                   document.getElementById('game-container');
        };
        
        let canvas = findCanvas();
        
        if (!canvas) {
            console.warn('Camera3D: No canvas found, delaying event setup');
            setTimeout(() => this.init(), 100);
            return;
        }
        
        // Store canvas reference for pointer lock checks
        this.canvas = canvas;
        
        // NOTE: Pointer lock request is handled by main3d.js setupPointerLock()
        // We only track lock state here
        
        document.addEventListener('pointerlockchange', () => {
            // Check if locked to our canvas OR any element (for compatibility)
            const lockedElement = document.pointerLockElement;
            this.isLocked = lockedElement === this.canvas || 
                           (lockedElement && lockedElement.id === 'game-canvas-3d');
            console.log('Camera3D: Pointer lock changed, isLocked:', this.isLocked);
        });
        
        document.addEventListener('mousemove', (e) => {
            if (this.isLocked) {
                this.onMouseMove(e);
            }
        });
        
        // Scroll for zoom
        canvas.addEventListener('wheel', (e) => {
            this.onWheel(e);
        });
        
        // Handle resize
        window.addEventListener('resize', () => this.resize());
        
        console.log('Camera3D: Initialized');
    }
    
    onMouseMove(event) {
        const movementX = event.movementX || 0;
        const movementY = event.movementY || 0;
        
        // Update yaw (horizontal rotation)
        this.yaw -= movementX * this.sensitivity;
        
        // Update pitch (vertical rotation)
        this.pitch -= movementY * this.sensitivity;
        this.pitch = Math.max(this.minPitch, Math.min(this.maxPitch, this.pitch));
    }
    
    onWheel(event) {
        // Zoom in/out
        this.distance += event.deltaY * 0.01 * this.zoomSpeed;
        this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, this.distance));
    }
    
    /**
     * Get the direction the camera is facing (for player movement)
     * Returns direction in Three.js coordinates where Z is forward
     * Yaw=0 means looking along +Z (Three.js) which is +Y (World)
     */
    getForwardDirection() {
        // Forward direction based on yaw only (ignore pitch for movement)
        // In our setup: yaw=0 looks towards +Z (Three) = +Y (World)
        // Sin/Cos need to give us the correct forward vector
        return new THREE.Vector3(
            Math.sin(this.yaw),
            0,
            Math.cos(this.yaw)
        ).normalize();
    }
    
    getRightDirection() {
        // Right is 90 degrees from forward (perpendicular)
        // Negated to correct left/right inversion
        return new THREE.Vector3(
            -Math.cos(this.yaw),
            0,
            Math.sin(this.yaw)
        ).normalize();
    }
    
    /**
     * Add screen shake
     */
    addShake(intensity, duration = 0.3) {
        this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
        this.shakeDuration = duration;
        this.shakeTimer = 0;
    }
    
    /**
     * Snap camera to target immediately (no smoothing)
     */
    snapToTarget() {
        if (this.game.player) {
            const player = this.game.player;
            // Convert world coords to Three.js coords
            this.currentPosition.set(player.x, player.z + 1, player.y);
            this.targetPosition.copy(this.currentPosition);
        }
    }
    
    /**
     * Update camera position and rotation
     */
    update(deltaTime) {
        if (!this.game.player) return;
        
        const player = this.game.player;
        
        // Target position (player position in Three.js coords)
        // World: X=right, Y=forward, Z=up
        // Three: X=right, Y=up, Z=forward
        const eyeHeight = this.isFirstPerson() ? 1.6 : 1; // Higher eye level in first person
        this.targetPosition.set(player.x, player.z + eyeHeight, player.y);
        
        // Swimming bob effect
        if (player.isInWater) {
            this.swimBobIntensity = Math.min(this.swimBobIntensity + 2 * deltaTime, 1);
            this.swimBobTime += deltaTime * 2;
            
            // Gentle vertical and horizontal bob
            const bobY = Math.sin(this.swimBobTime) * 0.1 * this.swimBobIntensity;
            const bobX = Math.sin(this.swimBobTime * 0.7) * 0.05 * this.swimBobIntensity;
            
            this.targetPosition.y += bobY;
            this.targetPosition.x += bobX;
        } else {
            this.swimBobIntensity = Math.max(this.swimBobIntensity - 3 * deltaTime, 0);
        }
        
        // Smooth follow (faster in first person for responsiveness)
        const followSpeed = this.isFirstPerson() ? 20 : this.smoothSpeed;
        this.currentPosition.lerp(this.targetPosition, followSpeed * deltaTime);
        
        // Determine effective distance and direction multiplier
        let effectiveDistance = this.distance;
        let directionMultiplier = 1;
        
        if (this.isFrontFacing()) {
            directionMultiplier = -1; // Camera in front of player
        }
        
        // Calculate camera position based on angles and distance
        const offsetX = Math.sin(this.yaw) * Math.cos(this.pitch) * effectiveDistance * directionMultiplier;
        const offsetY = Math.sin(this.pitch) * effectiveDistance;
        const offsetZ = Math.cos(this.yaw) * Math.cos(this.pitch) * effectiveDistance * directionMultiplier;
        
        const cameraPos = new THREE.Vector3(
            this.currentPosition.x - offsetX,
            this.currentPosition.y - offsetY,
            this.currentPosition.z - offsetZ
        );
        
        // Apply screen shake
        if (this.shakeDuration > 0) {
            this.shakeTimer += deltaTime;
            if (this.shakeTimer < this.shakeDuration) {
                const shakeAmount = this.shakeIntensity * (1 - this.shakeTimer / this.shakeDuration);
                cameraPos.x += (Math.random() - 0.5) * shakeAmount;
                cameraPos.y += (Math.random() - 0.5) * shakeAmount;
                cameraPos.z += (Math.random() - 0.5) * shakeAmount;
            } else {
                this.shakeDuration = 0;
                this.shakeIntensity = 0;
            }
        }
        
        // Set camera position and look at target (or forward in first-person)
        this.camera.position.copy(cameraPos);
        
        if (this.isFirstPerson()) {
            // In first person, look in the direction of yaw/pitch
            const lookTarget = new THREE.Vector3(
                this.currentPosition.x + Math.sin(this.yaw) * Math.cos(this.pitch),
                this.currentPosition.y + Math.sin(this.pitch),
                this.currentPosition.z + Math.cos(this.yaw) * Math.cos(this.pitch)
            );
            this.camera.lookAt(lookTarget);
        } else {
            this.camera.lookAt(this.currentPosition);
        }
        
        // Tell renderer to hide/show player model based on view mode
        if (this.game.renderer3d && this.game.renderer3d.playerMesh) {
            this.game.renderer3d.playerMesh.visible = !this.isFirstPerson();
        }
        
        // Update sprint FOV effect
        this.updateSprintFOV(deltaTime);
    }
    
    /**
     * Update FOV based on sprint state for Minecraft-style effect
     */
    updateSprintFOV(deltaTime) {
        // Check if player is sprinting
        const isSprinting = this.game.input?.isSprinting() && 
                           (Math.abs(this.game.player?.vx) > 0.1 || Math.abs(this.game.player?.vy) > 0.1);
        
        this.targetFOV = isSprinting ? this.sprintFOV : this.baseFOV;
        
        // Smooth FOV transition
        this.currentFOV += (this.targetFOV - this.currentFOV) * this.fovSmoothSpeed * deltaTime;
        
        // Apply FOV to camera
        if (Math.abs(this.camera.fov - this.currentFOV) > 0.1) {
            this.camera.fov = this.currentFOV;
            this.camera.updateProjectionMatrix();
        }
    }
    
    resize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
    }
    
    /**
     * Convert screen coordinates to world ray
     * Used for block selection/interaction
     */
    screenToRay(screenX, screenY) {
        const mouse = new THREE.Vector2(
            (screenX / window.innerWidth) * 2 - 1,
            -(screenY / window.innerHeight) * 2 + 1
        );
        
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.camera);
        
        return raycaster;
    }
    
    /**
     * Get the block the player is looking at (center of screen)
     * For third-person camera, we cast from player position in camera direction
     */
    getTargetBlock(maxDistance = 5) {
        if (!this.game.player) return null;
        
        const player = this.game.player;
        
        // Get ray origin from player's eye position (in Three.js coords)
        // World: X=right, Y=forward, Z=up
        // Three: X=right, Y=up, Z=forward
        const eyeHeight = 1.6; // Eye level
        const origin = new THREE.Vector3(
            player.x,
            player.z + eyeHeight,  // Three.Y = World.Z
            player.y               // Three.Z = World.Y
        );
        
        // Get look direction based on camera yaw and pitch
        // The camera offset vector is (sin(yaw)*cos(pitch), sin(pitch), cos(yaw)*cos(pitch)) * distance
        // Camera position = player - offset, so camera looks FROM camera TO player
        // Look direction = offset direction (normalized)
        const direction = new THREE.Vector3(
            Math.sin(this.yaw) * Math.cos(this.pitch),
            Math.sin(this.pitch),  // Same sign as camera offset Y
            Math.cos(this.yaw) * Math.cos(this.pitch)
        ).normalize();
        
        // Debug logging (reduced frequency)
        if (Math.random() < 0.02) { // Only log 2% of calls
            console.log('getTargetBlock: player world pos=', player.x.toFixed(1), player.y.toFixed(1), player.z.toFixed(1));
            console.log('  ray origin (three.js)=', origin.toArray().map(v => v.toFixed(2)));
            console.log('  ray dir=', direction.toArray().map(v => v.toFixed(2)));
        }
        
        // Step along ray to find block
        const stepSize = 0.1;
        let lastEmpty = null;
        
        for (let t = 0.1; t < maxDistance; t += stepSize) {
            const point = origin.clone().add(direction.clone().multiplyScalar(t));
            
            // Convert Three.js coords back to world coords
            const wx = Math.floor(point.x);      // Three.X = World.X
            const wy = Math.floor(point.z);      // Three.Z = World.Y
            const wz = Math.floor(point.y);      // Three.Y = World.Z
            
            const block = this.game.world?.getBlock(wx, wy, wz);
            
            if (block !== undefined && block !== 0 && block !== 5) { // Not air or water
                console.log('getTargetBlock FOUND:', block, 'at world', wx, wy, wz, 't=', t.toFixed(2));
                
                // Calculate face hit based on entry direction
                const localX = point.x - wx;
                const localY = point.z - wy;
                const localZ = point.y - wz;
                
                // Determine which face was hit based on local position
                let face = 'top';
                const threshold = 0.15;
                
                if (localZ < threshold) face = 'bottom';
                else if (localZ > 1 - threshold) face = 'top';
                else if (localX < threshold) face = 'left';
                else if (localX > 1 - threshold) face = 'right';
                else if (localY < threshold) face = 'back';
                else if (localY > 1 - threshold) face = 'front';
                
                return {
                    x: wx,
                    y: wy,
                    z: wz,
                    blockId: block,
                    face: face,
                    distance: t,
                    type: 'block',
                    lastEmpty: lastEmpty
                };
            }
            
            lastEmpty = { x: wx, y: wy, z: wz };
        }
        
        return null;
    }
    
    /**
     * World to screen projection (for UI elements)
     */
    worldToScreen(worldX, worldY, worldZ) {
        // Convert world to Three.js coords
        const pos = new THREE.Vector3(worldX, worldZ, worldY);
        pos.project(this.camera);
        
        return {
            x: (pos.x * 0.5 + 0.5) * window.innerWidth,
            y: (-pos.y * 0.5 + 0.5) * window.innerHeight
        };
    }
    
    /**
     * Legacy compatibility - zoom property
     */
    get zoom() {
        return 15 / this.distance; // Approximate zoom level
    }
    
    set zoom(value) {
        this.distance = 15 / value;
        this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, this.distance));
    }
}
