/**
 * Enhanced 3D Renderer using Three.js
 * Full-featured voxel renderer with textures, entities, particles, and effects
 */

import * as THREE from 'three';
import { CONFIG, BLOCKS, BLOCK_DATA } from '../config.js';
import { TextureManager3D } from './textures3d.js';

export class Renderer3D {
    constructor(game) {
        this.game = game;
        
        // Create canvas dynamically for 3D
        const container = document.getElementById('game-container');
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'game-canvas-3d';
        container.appendChild(this.canvas);
        
        // Three.js core components
        this.scene = new THREE.Scene();
        this.renderer = new THREE.WebGLRenderer({ 
            canvas: this.canvas,
            antialias: true,
            alpha: false
        });
        
        // Texture manager
        this.textureManager = new TextureManager3D();
        
        // Chunk meshes cache
        this.chunkMeshes = new Map();
        this.waterMeshes = new Map(); // Separate pass for water
        this.entityMeshes = new Map();
        
        // Block textures (will be generated from colors)
        this.blockMaterials = new Map();
        
        // Sprite textures for entities
        this.spriteTextures = new Map();
        
        // Particle systems
        this.particles = [];
        
        // Player model
        this.playerMesh = null;
        
        // Selection highlight
        this.selectionBox = null;
        this.placementPreview = null;
        
        // Mining crack overlay
        this.miningOverlay = null;
        this.miningProgress = 0;
        this.miningTarget = null;
        
        // Point lights for torches
        this.torchLights = new Map();
        
        // Held item display
        this.heldItemMesh = null;
        
        // First-person hand
        this.firstPersonHand = null;
        this.firstPersonItem = null;
        this.handBobTime = 0;
        this.handBobIntensity = 0;
        
        // Sky and environment
        this.skybox = null;
        this.ambientLight = null;
        this.sunLight = null;
        this.hemiLight = null;
        
        // Stars and clouds
        this.stars = null;
        this.clouds = null;
        
        // Underwater effects
        this.underwaterOverlay = null;
        this.isUnderwater = false;
        
        // Entity shadows
        this.entityShadows = new Map();
        
        // Damage effects
        this.damageFlashIntensity = 0;
        this.damageTiltAngle = 0;
        this.lowHealthPulse = 0;
        
        // Mining fatigue effect
        this.miningFatigueOverlay = null;
        this.miningFatigueIntensity = 0;
        
        // Grass decorations (swaying foliage)
        this.grassDecorations = [];
        this.grassSwayTime = 0;
        
        // Torch flicker time
        this.torchFlickerTime = 0;
        
        // Rain particles
        this.rainParticles = [];
        this.maxRainParticles = 500;
        
        // Damage numbers
        this.damageNumbers = [];
        
        // Ready flag
        this.ready = false;
        
        this.init();
    }
    
    async init() {
        // Renderer setup
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        
        // Set clear color (sky)
        this.renderer.setClearColor(0x87CEEB, 1);
        
        // Fog for atmosphere
        this.scene.fog = new THREE.Fog(0x87CEEB, 50, 150);
        
        // Initialize texture manager first
        await this.textureManager.init();
        
        // Lighting
        this.setupLighting();
        
        // Generate block materials and atlas AFTER textures are ready
        this.generateBlockMaterials();
        
        // Selection highlight cube
        this.createSelectionBox();
        this.createPlacementPreview();
        this.createMiningOverlay();
        this.createHeldItemDisplay();
        this.createFirstPersonHand();
        this.createStars();
        this.createClouds();
        this.createUnderwaterOverlay();
        
        // Create player model
        this.createPlayerModel();
        
        // Handle resize
        window.addEventListener('resize', () => this.resize());
        
        this.ready = true;
    }
    
    setupLighting() {
        // Ambient light (base illumination)
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(this.ambientLight);
        
        // Directional sunlight
        this.sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
        this.sunLight.position.set(50, 100, 50);
        this.sunLight.castShadow = true;
        
        // Shadow settings
        this.sunLight.shadow.mapSize.width = 2048;
        this.sunLight.shadow.mapSize.height = 2048;
        this.sunLight.shadow.camera.near = 0.5;
        this.sunLight.shadow.camera.far = 500;
        this.sunLight.shadow.camera.left = -100;
        this.sunLight.shadow.camera.right = 100;
        this.sunLight.shadow.camera.top = 100;
        this.sunLight.shadow.camera.bottom = -100;
        this.sunLight.shadow.bias = -0.0001;
        
        // Shadow target
        this.sunLight.target = new THREE.Object3D();
        this.scene.add(this.sunLight.target);
        this.scene.add(this.sunLight);
        
        // Hemisphere light for sky/ground color bleeding
        this.hemiLight = new THREE.HemisphereLight(0x87CEEB, 0x8B4513, 0.3);
        this.scene.add(this.hemiLight);
    }
    
    generateBlockMaterials() {
        // Create materials for each block type based on BLOCK_DATA colors
        for (const [blockId, data] of Object.entries(BLOCK_DATA)) {
            // Skip air (id 0) and invalid colors
            if (!data.color || data.color === 'transparent' || parseInt(blockId) === BLOCKS.AIR) {
                continue;
            }
            
            const color = new THREE.Color(data.color);
                
            // Different material for different block types
            let material;
            
            if (data.transparent) {
                material = new THREE.MeshLambertMaterial({
                    color: color,
                    transparent: true,
                    opacity: data.name === 'Water' ? 0.6 : 0.8,
                    side: THREE.DoubleSide
                });
            } else if (data.emissive || data.lightLevel > 0) {
                material = new THREE.MeshStandardMaterial({
                    color: color,
                    emissive: color,
                    emissiveIntensity: 0.5
                });
            } else {
                material = new THREE.MeshLambertMaterial({
                    color: color
                });
            }
            
            this.blockMaterials.set(parseInt(blockId), material);
        }
        
        // Default material for unknown blocks
        this.blockMaterials.set(-1, new THREE.MeshLambertMaterial({ color: 0xff00ff }));
        
        // Build texture atlas after textures are ready
        this.buildTextureAtlas();
    }
    
    buildTextureAtlas() {
        const tileSize = this.textureManager.tileSize;
        const tilesPerRow = 16;
        const atlasSize = tilesPerRow * tileSize;
        
        const canvas = document.createElement('canvas');
        canvas.width = atlasSize;
        canvas.height = atlasSize;
        const ctx = canvas.getContext('2d');
        
        // Fill with magenta (debug color)
        ctx.fillStyle = '#FF00FF';
        ctx.fillRect(0, 0, atlasSize, atlasSize);
        
        // Map block IDs to atlas positions
        this.atlasMap = new Map();
        let atlasIndex = 0;
        
        // Copy textures to atlas
        for (const [key, texture] of this.textureManager.textures) {
            const [blockIdStr, face] = key.split('_');
            const blockId = parseInt(blockIdStr);
            
            if (!this.atlasMap.has(blockId)) {
                this.atlasMap.set(blockId, {});
            }
            
            const tileX = (atlasIndex % tilesPerRow) * tileSize;
            const tileY = Math.floor(atlasIndex / tilesPerRow) * tileSize;
            
            // Get the canvas from the texture - use sourceCanvas we stored, or image
            const sourceImage = texture.sourceCanvas || texture.image;
            if (sourceImage) {
                ctx.drawImage(sourceImage, tileX, tileY, tileSize, tileSize);
            } else {
                // Fallback: fill with block color from BLOCK_DATA
                const blockData = BLOCK_DATA[blockId];
                ctx.fillStyle = blockData?.color || '#FF00FF';
                ctx.fillRect(tileX, tileY, tileSize, tileSize);
                console.warn('Renderer3D: No source image for texture', key);
            }
            
            // Store UV coordinates (normalized 0-1)
            this.atlasMap.get(blockId)[face] = {
                u: tileX / atlasSize,
                v: 1 - (tileY + tileSize) / atlasSize, // Flip Y for WebGL
                uSize: tileSize / atlasSize,
                vSize: tileSize / atlasSize
            };
            
            atlasIndex++;
        }
        
        // Create atlas texture
        this.atlasTexture = new THREE.CanvasTexture(canvas);
        this.atlasTexture.magFilter = THREE.NearestFilter;
        this.atlasTexture.minFilter = THREE.NearestFilter;
        this.atlasTexture.colorSpace = THREE.SRGBColorSpace;
        this.atlasTexture.wrapS = THREE.RepeatWrapping;
        this.atlasTexture.wrapT = THREE.RepeatWrapping;
        
        // Create atlas material - use texture without vertex colors for reliable rendering
        this.atlasMaterial = new THREE.MeshLambertMaterial({
            map: this.atlasTexture,
            vertexColors: false // Texture provides all color
        });
        
    }
    
    getBlockUVs(blockId, face) {
        const blockUVs = this.atlasMap?.get(blockId);
        if (!blockUVs) {
            return { u: 0, v: 0, uSize: 1/16, vSize: 1/16 };
        }
        return blockUVs[face] || blockUVs['top'] || { u: 0, v: 0, uSize: 1/16, vSize: 1/16 };
    }
    
    getBlockMaterial(blockId) {
        return this.blockMaterials.get(blockId) || this.blockMaterials.get(-1);
    }
    
    createSelectionBox() {
        const scale = CONFIG.BLOCK_OUTLINE_SCALE || 1.02;
        const geometry = new THREE.BoxGeometry(scale, scale, scale);
        const edges = new THREE.EdgesGeometry(geometry);
        const material = new THREE.LineBasicMaterial({ 
            color: CONFIG.BLOCK_OUTLINE_COLOR || 0x000000, // Black for better visibility
            linewidth: 3
        });
        this.selectionBox = new THREE.LineSegments(edges, material);
        this.selectionBox.visible = false;
        this.scene.add(this.selectionBox);
    }
    
    createPlacementPreview() {
        const geometry = new THREE.BoxGeometry(1.02, 1.02, 1.02); // Slightly larger to avoid z-fighting
        const material = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0.35,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        this.placementPreview = new THREE.Mesh(geometry, material);
        this.placementPreview.visible = false;
        this.placementPreview.renderOrder = 100; // Render after terrain
        this.scene.add(this.placementPreview);
        
        // Create wireframe outline for extra visibility
        const wireGeo = new THREE.BoxGeometry(1.02, 1.02, 1.02);
        const edges = new THREE.EdgesGeometry(wireGeo);
        const wireMat = new THREE.LineBasicMaterial({ 
            color: 0xffffff, 
            transparent: true, 
            opacity: 0.8 
        });
        this.placementWireframe = new THREE.LineSegments(edges, wireMat);
        this.placementWireframe.visible = false;
        this.placementWireframe.renderOrder = 101;
        this.scene.add(this.placementWireframe);
    }
    
    createMiningOverlay() {
        // Create mining crack overlay texture
        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;
        const ctx = canvas.getContext('2d');
        
        // Create crack patterns for different stages
        this.crackTextures = [];
        for (let stage = 0; stage < 10; stage++) {
            const stageCanvas = document.createElement('canvas');
            stageCanvas.width = 16;
            stageCanvas.height = 16;
            const stageCtx = stageCanvas.getContext('2d');
            
            // Draw cracks based on stage
            stageCtx.fillStyle = 'rgba(0,0,0,0)';
            stageCtx.fillRect(0, 0, 16, 16);
            
            const intensity = (stage + 1) / 10;
            const numCracks = Math.floor(3 + stage * 2);
            
            stageCtx.strokeStyle = `rgba(0,0,0,${0.3 + intensity * 0.5})`;
            stageCtx.lineWidth = 1;
            
            for (let i = 0; i < numCracks; i++) {
                const x1 = Math.random() * 16;
                const y1 = Math.random() * 16;
                const x2 = x1 + (Math.random() - 0.5) * 10;
                const y2 = y1 + (Math.random() - 0.5) * 10;
                
                stageCtx.beginPath();
                stageCtx.moveTo(x1, y1);
                stageCtx.lineTo(x2, y2);
                stageCtx.stroke();
            }
            
            const texture = new THREE.CanvasTexture(stageCanvas);
            texture.magFilter = THREE.NearestFilter;
            texture.minFilter = THREE.NearestFilter;
            this.crackTextures.push(texture);
        }
        
        // Create overlay mesh
        const geometry = new THREE.BoxGeometry(1.005, 1.005, 1.005);
        const material = new THREE.MeshBasicMaterial({
            map: this.crackTextures[0],
            transparent: true,
            opacity: 0.8,
            depthWrite: false,
            side: THREE.FrontSide
        });
        this.miningOverlay = new THREE.Mesh(geometry, material);
        this.miningOverlay.visible = false;
        this.miningOverlay.renderOrder = 1;
        this.scene.add(this.miningOverlay);
    }
    
    updateMiningOverlay(x, y, z, progress) {
        if (x !== null && progress > 0) {
            this.miningOverlay.position.set(x + 0.5, z + 0.5, y + 0.5);
            this.miningOverlay.visible = true;
            
            // Update crack texture based on progress (0-1)
            const stage = Math.min(9, Math.floor(progress * 10));
            this.miningOverlay.material.map = this.crackTextures[stage];
            this.miningOverlay.material.needsUpdate = true;
        } else {
            this.miningOverlay.visible = false;
        }
    }
    
    createHeldItemDisplay() {
        // Create a group for the held item (will be positioned relative to camera)
        this.heldItemGroup = new THREE.Group();
        
        // Create a simple block mesh for held item
        const geometry = new THREE.BoxGeometry(0.4, 0.4, 0.4);
        const material = new THREE.MeshLambertMaterial({ color: 0x8B5A2B });
        this.heldItemMesh = new THREE.Mesh(geometry, material);
        this.heldItemMesh.visible = false;
        this.heldItemGroup.add(this.heldItemMesh);
    }
    
    /**
     * Create first-person hand/arm for FPS view
     */
    createFirstPersonHand() {
        // Create hand group that will follow camera
        this.firstPersonHand = new THREE.Group();
        
        // Arm (skin-colored box)
        const armGeo = new THREE.BoxGeometry(0.15, 0.15, 0.5);
        const skinMat = new THREE.MeshLambertMaterial({ color: 0xE0AC69 });
        const arm = new THREE.Mesh(armGeo, skinMat);
        arm.position.set(0, 0, -0.25);
        this.firstPersonHand.add(arm);
        
        // Hand (slightly larger at end)
        const handGeo = new THREE.BoxGeometry(0.18, 0.12, 0.15);
        const hand = new THREE.Mesh(handGeo, skinMat);
        hand.position.set(0, -0.02, -0.52);
        this.firstPersonHand.add(hand);
        
        // Held item block (will be shown when holding item)
        const itemGeo = new THREE.BoxGeometry(0.25, 0.25, 0.25);
        const itemMat = new THREE.MeshLambertMaterial({ color: 0x8B5A2B });
        this.firstPersonItem = new THREE.Mesh(itemGeo, itemMat);
        this.firstPersonItem.position.set(0, 0.1, -0.55);
        this.firstPersonItem.rotation.set(0.2, 0.3, 0);
        this.firstPersonItem.visible = false;
        this.firstPersonHand.add(this.firstPersonItem);
        
        // Base position (lower right of screen)
        this.firstPersonHand.position.set(0.4, -0.3, -0.6);
        this.firstPersonHand.rotation.set(-0.2, -0.4, 0);
        
        // Hand will be added to camera in updateFirstPersonHand
        this.firstPersonHand.visible = false;
    }
    
    /**
     * Update first-person hand position with bob effect
     */
    updateFirstPersonHand(camera, player, deltaTime) {
        if (!this.firstPersonHand || !camera) return;
        
        const isFirstPerson = this.game.camera3d?.isFirstPerson();
        
        if (isFirstPerson) {
            // Ensure hand is in camera
            if (this.firstPersonHand.parent !== camera) {
                camera.add(this.firstPersonHand);
            }
            this.firstPersonHand.visible = true;
            
            // Calculate bob intensity based on movement
            const isMoving = player && (Math.abs(player.vx) > 0.1 || Math.abs(player.vy) > 0.1);
            const isSprinting = this.game.input?.isSprinting() && isMoving;
            
            // Target bob intensity
            const targetIntensity = isMoving ? (isSprinting ? 0.08 : 0.05) : 0;
            this.handBobIntensity += (targetIntensity - this.handBobIntensity) * deltaTime * 8;
            
            // Bob animation
            if (isMoving) {
                const bobSpeed = isSprinting ? 12 : 8;
                this.handBobTime += deltaTime * bobSpeed;
            } else {
                // Slow bob return to center
                this.handBobTime *= 0.95;
            }
            
            // Calculate bob offsets
            const bobX = Math.sin(this.handBobTime * 0.5) * this.handBobIntensity;
            const bobY = Math.abs(Math.sin(this.handBobTime)) * this.handBobIntensity;
            
            // Base position + bob
            this.firstPersonHand.position.set(
                0.4 + bobX,
                -0.3 + bobY,
                -0.6
            );
            
            // Update held item visibility and color
            const selectedItem = player?.getSelectedItem?.();
            if (selectedItem && this.firstPersonItem) {
                this.firstPersonItem.visible = true;
                const color = selectedItem.blockId ? 
                    (BLOCK_DATA[selectedItem.blockId]?.color || '#8B5A2B') : 
                    '#C0C0C0';
                this.firstPersonItem.material.color.set(color);
            } else if (this.firstPersonItem) {
                this.firstPersonItem.visible = false;
            }
        } else {
            // Third person - hide first person hand
            this.firstPersonHand.visible = false;
        }
    }
    
    updateHeldItem(item, camera) {
        if (!item || !this.heldItemMesh) return;
        
        // Position held item in lower right of screen (first-person style)
        // This would need camera attachment for proper FPS view
        // For third-person, we update the player's held item
        if (this.playerMesh && this.playerMesh.userData.rightArm) {
            // Show item in player's hand during third-person
            // Item color based on type
            const color = item.blockId ? 
                (BLOCK_DATA[item.blockId]?.color || '#8B5A2B') : 
                '#C0C0C0';
            this.heldItemMesh.material.color.set(color);
            this.heldItemMesh.visible = true;
        }
    }
    
    // Add/remove torch point lights with flicker
    addTorchLight(x, y, z) {
        const key = `${x},${y},${z}`;
        if (this.torchLights.has(key)) return;
        
        const light = new THREE.PointLight(0xFFAA44, 1, 10);
        light.position.set(x + 0.5, z + 0.5, y + 0.5);
        light.userData.baseIntensity = 1;
        light.userData.flickerOffset = Math.random() * Math.PI * 2;
        light.userData.worldPos = { x, y, z };
        this.scene.add(light);
        this.torchLights.set(key, light);
    }
    
    removeTorchLight(x, y, z) {
        const key = `${x},${y},${z}`;
        const light = this.torchLights.get(key);
        if (light) {
            this.scene.remove(light);
            this.torchLights.delete(key);
        }
    }
    
    // Update sky color based on time of day with enhanced sunrise/sunset glow
    updateSkyColor(timeOfDay) {
        // timeOfDay: 0-1 where 0.5 is noon
        const dayColor = new THREE.Color(0x87CEEB); // Sky blue
        const sunsetColor = new THREE.Color(0xFF7F50); // Coral
        const sunriseColor = new THREE.Color(0xFFB347); // Orange/peach
        const nightColor = new THREE.Color(0x191970); // Midnight blue
        const goldenHour = new THREE.Color(0xFFD700); // Golden tint
        
        let skyColor;
        let sunIntensity;
        let ambientIntensity;
        let sunColor = new THREE.Color(0xffffff);
        
        if (timeOfDay < 0.15) {
            // Deep night
            const t = timeOfDay / 0.15;
            skyColor = nightColor.clone();
            sunIntensity = 0.05;
            ambientIntensity = 0.08;
        } else if (timeOfDay < 0.22) {
            // Night to dawn (sunrise glow begins)
            const t = (timeOfDay - 0.15) / 0.07;
            skyColor = nightColor.clone().lerp(sunriseColor, t);
            sunIntensity = 0.05 + t * 0.35;
            ambientIntensity = 0.08 + t * 0.22;
            sunColor = new THREE.Color(0xFF6B35).lerp(goldenHour, t);
        } else if (timeOfDay < 0.3) {
            // Sunrise golden hour
            const t = (timeOfDay - 0.22) / 0.08;
            skyColor = sunriseColor.clone().lerp(dayColor, t);
            sunIntensity = 0.4 + t * 0.4;
            ambientIntensity = 0.3 + t * 0.1;
            sunColor = goldenHour.clone().lerp(new THREE.Color(0xffffff), t);
        } else if (timeOfDay < 0.7) {
            // Day
            skyColor = dayColor;
            sunIntensity = 0.8;
            ambientIntensity = 0.4;
            sunColor = new THREE.Color(0xffffff);
        } else if (timeOfDay < 0.78) {
            // Day to golden hour (sunset begins)
            const t = (timeOfDay - 0.7) / 0.08;
            skyColor = dayColor.clone().lerp(sunsetColor, t);
            sunIntensity = 0.8 - t * 0.3;
            ambientIntensity = 0.4 - t * 0.1;
            sunColor = new THREE.Color(0xffffff).lerp(goldenHour, t);
        } else if (timeOfDay < 0.85) {
            // Sunset golden hour
            const t = (timeOfDay - 0.78) / 0.07;
            skyColor = sunsetColor.clone().lerp(new THREE.Color(0xFF4500), t);
            sunIntensity = 0.5 - t * 0.25;
            ambientIntensity = 0.3 - t * 0.1;
            sunColor = goldenHour.clone().lerp(new THREE.Color(0xFF6B35), t);
        } else {
            // Dusk to night
            const t = (timeOfDay - 0.85) / 0.15;
            skyColor = new THREE.Color(0xFF4500).lerp(nightColor, t);
            sunIntensity = 0.25 - t * 0.2;
            ambientIntensity = 0.2 - t * 0.12;
            sunColor = new THREE.Color(0xFF6B35).lerp(new THREE.Color(0x444466), t);
        }
        
        // Apply colors
        this.renderer.setClearColor(skyColor);
        this.scene.fog.color = skyColor;
        
        if (this.sunLight) {
            this.sunLight.intensity = sunIntensity;
            this.sunLight.color = sunColor;
            // Move sun position based on time
            const sunAngle = (timeOfDay - 0.25) * Math.PI * 2;
            this.sunLight.position.set(
                Math.cos(sunAngle) * 100,
                Math.sin(sunAngle) * 100 + 50,
                50
            );
        }
        
        if (this.ambientLight) {
            this.ambientLight.intensity = ambientIntensity;
            // Tint ambient during golden hours
            if (timeOfDay > 0.15 && timeOfDay < 0.3) {
                this.ambientLight.color = new THREE.Color(0xFFE4B5); // Warm tint
            } else if (timeOfDay > 0.7 && timeOfDay < 0.85) {
                this.ambientLight.color = new THREE.Color(0xFFD4A0); // Warm sunset tint
            } else {
                this.ambientLight.color = new THREE.Color(0xffffff);
            }
        }
        
        // Update stars visibility (fade in at night)
        if (this.stars) {
            const isNight = timeOfDay < 0.2 || timeOfDay > 0.8;
            const nightAmount = timeOfDay < 0.2 ? (0.2 - timeOfDay) / 0.2 : (timeOfDay - 0.8) / 0.2;
            this.stars.material.opacity = isNight ? Math.min(nightAmount, 0.8) : 0;
            this.stars.visible = isNight;
        }
    }
    
    /**
     * Create starfield for night sky
     */
    createStars() {
        const starsGeometry = new THREE.BufferGeometry();
        const starCount = 2000;
        const positions = new Float32Array(starCount * 3);
        const sizes = new Float32Array(starCount);
        
        for (let i = 0; i < starCount; i++) {
            // Distribute on a sphere
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const radius = 400;
            
            positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = radius * Math.cos(phi); // Y is up
            positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
            
            sizes[i] = Math.random() * 2 + 1;
        }
        
        starsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        starsGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        
        const starsMaterial = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 2,
            transparent: true,
            opacity: 0,
            sizeAttenuation: false
        });
        
        this.stars = new THREE.Points(starsGeometry, starsMaterial);
        this.stars.visible = false;
        this.scene.add(this.stars);
    }
    
    /**
     * Create cloud layer
     */
    createClouds() {
        const cloudGroup = new THREE.Group();
        const cloudCount = 30;
        
        const cloudMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.7,
            side: THREE.DoubleSide
        });
        
        for (let i = 0; i < cloudCount; i++) {
            // Create cloud from multiple overlapping planes
            const cloud = new THREE.Group();
            const puffCount = 3 + Math.floor(Math.random() * 4);
            
            for (let j = 0; j < puffCount; j++) {
                const size = 10 + Math.random() * 20;
                const puffGeo = new THREE.PlaneGeometry(size, size * 0.4);
                const puff = new THREE.Mesh(puffGeo, cloudMaterial);
                puff.position.set(
                    (Math.random() - 0.5) * 15,
                    (Math.random() - 0.5) * 2,
                    (Math.random() - 0.5) * 5
                );
                puff.rotation.x = -Math.PI / 2; // Face up
                cloud.add(puff);
            }
            
            // Position cloud in sky
            cloud.position.set(
                (Math.random() - 0.5) * 400,
                80 + Math.random() * 20, // Y height
                (Math.random() - 0.5) * 400
            );
            
            cloud.userData.speed = 0.5 + Math.random() * 1;
            cloudGroup.add(cloud);
        }
        
        this.clouds = cloudGroup;
        this.scene.add(cloudGroup);
    }
    
    /**
     * Update cloud positions (drift)
     */
    updateClouds(deltaTime) {
        if (!this.clouds) return;
        
        for (const cloud of this.clouds.children) {
            cloud.position.x += cloud.userData.speed * deltaTime;
            
            // Wrap around
            if (cloud.position.x > 200) {
                cloud.position.x = -200;
            }
        }
    }
    
    /**
     * Update chunk fade-in animation
     */
    updateChunkFadeIn(deltaTime) {
        const fadeSpeed = 3; // Chunks fully appear in ~0.3 seconds
        
        for (const mesh of this.chunkMeshes.values()) {
            if (mesh.userData.fadeIn && mesh.userData.fadeProgress < 1) {
                mesh.userData.fadeProgress += deltaTime * fadeSpeed;
                
                if (mesh.userData.fadeProgress >= 1) {
                    mesh.userData.fadeProgress = 1;
                    mesh.userData.fadeIn = false;
                    mesh.material.transparent = false;
                    mesh.material.opacity = 1;
                    mesh.material.needsUpdate = true;
                } else {
                    mesh.material.opacity = mesh.userData.fadeProgress;
                }
            }
        }
    }
    
    /**
     * Create underwater overlay effect
     */
    createUnderwaterOverlay() {
        const overlayGeo = new THREE.PlaneGeometry(2, 2);
        const overlayMat = new THREE.MeshBasicMaterial({
            color: 0x1E90FF, // Dodger blue
            transparent: true,
            opacity: 0,
            depthTest: false,
            depthWrite: false
        });
        
        this.underwaterOverlay = new THREE.Mesh(overlayGeo, overlayMat);
        this.underwaterOverlay.renderOrder = 9998;
        this.underwaterOverlay.frustumCulled = false;
        // Note: This will be positioned in front of camera during render
    }
    
    /**
     * Update underwater effect based on player position
     */
    setUnderwater(isUnderwater) {
        if (this.isUnderwater === isUnderwater) return;
        this.isUnderwater = isUnderwater;
        
        if (isUnderwater) {
            this.underwaterOverlay.material.opacity = 0.3;
            this.scene.fog.near = 5;
            this.scene.fog.far = 30;
            this.scene.fog.color.set(0x1E4D7B);
        } else {
            this.underwaterOverlay.material.opacity = 0;
            this.scene.fog.near = 50;
            this.scene.fog.far = 150;
        }
    }
    
    /**
     * Create a simple circular shadow for an entity
     */
    createEntityShadow(entityId) {
        const shadowGeo = new THREE.CircleGeometry(0.4, 16);
        const shadowMat = new THREE.MeshBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0.3,
            depthWrite: false
        });
        
        const shadow = new THREE.Mesh(shadowGeo, shadowMat);
        shadow.rotation.x = -Math.PI / 2; // Lay flat
        shadow.renderOrder = -1;
        
        this.entityShadows.set(entityId, shadow);
        this.scene.add(shadow);
        return shadow;
    }
    
    /**
     * Update entity shadow position
     */
    updateEntityShadow(entityId, x, y, z) {
        let shadow = this.entityShadows.get(entityId);
        if (!shadow) {
            shadow = this.createEntityShadow(entityId);
        }
        
        // Find ground level below entity
        const groundZ = this.findGroundLevel(x, y, z);
        shadow.position.set(x, groundZ + 0.01, y);
        
        // Scale and fade based on height
        const height = z - groundZ;
        const scale = Math.max(0.3, 1 - height * 0.1);
        const opacity = Math.max(0.1, 0.3 - height * 0.03);
        shadow.scale.set(scale, scale, 1);
        shadow.material.opacity = opacity;
    }
    
    /**
     * Find ground level at position
     */
    findGroundLevel(x, y, z) {
        const world = this.game.world;
        for (let checkZ = Math.floor(z); checkZ >= 0; checkZ--) {
            const block = world.getBlock(Math.floor(x), Math.floor(y), checkZ);
            if (block !== BLOCKS.AIR && block !== BLOCKS.WATER) {
                return checkZ + 1;
            }
        }
        return 0;
    }

    createPlayerModel() {
        // Create a simple humanoid model for the player
        const group = new THREE.Group();
        
        // Body
        const bodyGeo = new THREE.BoxGeometry(0.6, 0.7, 0.3);
        const bodyMat = new THREE.MeshLambertMaterial({ color: 0x8B4513 }); // Brown (leather armor)
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 0.35;
        body.castShadow = true;
        group.add(body);
        
        // Chestplate armor overlay (slightly larger)
        const chestGeo = new THREE.BoxGeometry(0.65, 0.72, 0.35);
        const chestMat = new THREE.MeshLambertMaterial({ color: 0x888888, transparent: true, opacity: 0 });
        const chestplate = new THREE.Mesh(chestGeo, chestMat);
        chestplate.position.y = 0.35;
        group.add(chestplate);
        
        // Head
        const headGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
        const headMat = new THREE.MeshLambertMaterial({ color: 0xFFDBB4 }); // Skin color
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.y = 0.9;
        head.castShadow = true;
        group.add(head);
        
        // Helmet armor overlay
        const helmetGeo = new THREE.BoxGeometry(0.45, 0.42, 0.45);
        const helmetMat = new THREE.MeshLambertMaterial({ color: 0x888888, transparent: true, opacity: 0 });
        const helmet = new THREE.Mesh(helmetGeo, helmetMat);
        helmet.position.y = 0.92;
        group.add(helmet);
        
        // Hair
        const hairGeo = new THREE.BoxGeometry(0.42, 0.2, 0.42);
        const hairMat = new THREE.MeshLambertMaterial({ color: 0x4a3728 }); // Dark brown
        const hair = new THREE.Mesh(hairGeo, hairMat);
        hair.position.y = 1.05;
        group.add(hair);
        
        // Arms
        const armGeo = new THREE.BoxGeometry(0.2, 0.6, 0.2);
        const armMat = new THREE.MeshLambertMaterial({ color: 0xFFDBB4 });
        
        const leftArm = new THREE.Mesh(armGeo, armMat);
        leftArm.position.set(-0.4, 0.35, 0);
        leftArm.castShadow = true;
        group.add(leftArm);
        
        const rightArm = new THREE.Mesh(armGeo, armMat);
        rightArm.position.set(0.4, 0.35, 0);
        rightArm.castShadow = true;
        group.add(rightArm);
        
        // Legs
        const legGeo = new THREE.BoxGeometry(0.25, 0.6, 0.25);
        const legMat = new THREE.MeshLambertMaterial({ color: 0x5D4037 }); // Dark brown pants
        
        const leftLeg = new THREE.Mesh(legGeo, legMat);
        leftLeg.position.set(-0.15, -0.3, 0);
        leftLeg.castShadow = true;
        group.add(leftLeg);
        
        const rightLeg = new THREE.Mesh(legGeo, legMat);
        rightLeg.position.set(0.15, -0.3, 0);
        rightLeg.castShadow = true;
        group.add(rightLeg);
        
        // Leggings armor overlay
        const leggingsGeo = new THREE.BoxGeometry(0.55, 0.62, 0.28);
        const leggingsMat = new THREE.MeshLambertMaterial({ color: 0x888888, transparent: true, opacity: 0 });
        const leggings = new THREE.Mesh(leggingsGeo, leggingsMat);
        leggings.position.y = -0.3;
        group.add(leggings);
        
        // Boots armor overlay
        const bootGeo = new THREE.BoxGeometry(0.27, 0.25, 0.27);
        const bootMat = new THREE.MeshLambertMaterial({ color: 0x888888, transparent: true, opacity: 0 });
        const leftBoot = new THREE.Mesh(bootGeo, bootMat);
        leftBoot.position.set(-0.15, -0.55, 0);
        group.add(leftBoot);
        
        const rightBoot = new THREE.Mesh(bootGeo.clone(), bootMat.clone());
        rightBoot.position.set(0.15, -0.55, 0);
        group.add(rightBoot);
        
        // Store references for animation
        group.userData = {
            body, head, hair, leftArm, rightArm, leftLeg, rightLeg,
            helmet, chestplate, leggings, leftBoot, rightBoot,
            walkCycle: 0,
            swingTime: 0,
            isSwinging: false
        };
        
        this.playerMesh = group;
        this.scene.add(group);
    }
    
    /**
     * Update armor display on player model
     */
    updatePlayerArmor(player) {
        if (!this.playerMesh || !player) return;
        const ud = this.playerMesh.userData;
        
        // Armor color mapping
        const armorColors = {
            leather: 0x8B4513,
            iron: 0xC0C0C0,
            gold: 0xFFD700,
            diamond: 0x00FFFF,
            bone: 0xE8E8E0
        };
        
        // Check each armor slot
        const equippedArmor = player.equippedArmor || {};
        
        // Helmet
        if (ud.helmet) {
            const helm = equippedArmor.helmet || equippedArmor.head;
            if (helm) {
                const tier = this.getArmorTier(helm);
                ud.helmet.material.color.set(armorColors[tier] || 0x888888);
                ud.helmet.material.opacity = 0.9;
                ud.hair.visible = false; // Hide hair when wearing helmet
            } else {
                ud.helmet.material.opacity = 0;
                ud.hair.visible = true;
            }
        }
        
        // Chestplate
        if (ud.chestplate) {
            const chest = equippedArmor.chestplate || equippedArmor.chest;
            if (chest) {
                const tier = this.getArmorTier(chest);
                ud.chestplate.material.color.set(armorColors[tier] || 0x888888);
                ud.chestplate.material.opacity = 0.9;
            } else {
                ud.chestplate.material.opacity = 0;
            }
        }
        
        // Leggings
        if (ud.leggings) {
            const legs = equippedArmor.leggings || equippedArmor.legs;
            if (legs) {
                const tier = this.getArmorTier(legs);
                ud.leggings.material.color.set(armorColors[tier] || 0x888888);
                ud.leggings.material.opacity = 0.9;
            } else {
                ud.leggings.material.opacity = 0;
            }
        }
        
        // Boots
        if (ud.leftBoot && ud.rightBoot) {
            const boots = equippedArmor.boots || equippedArmor.feet;
            if (boots) {
                const tier = this.getArmorTier(boots);
                ud.leftBoot.material.color.set(armorColors[tier] || 0x888888);
                ud.leftBoot.material.opacity = 0.9;
                ud.rightBoot.material.color.set(armorColors[tier] || 0x888888);
                ud.rightBoot.material.opacity = 0.9;
            } else {
                ud.leftBoot.material.opacity = 0;
                ud.rightBoot.material.opacity = 0;
            }
        }
    }
    
    /**
     * Get armor tier from item name
     */
    getArmorTier(item) {
        if (!item) return 'leather';
        const name = (item.name || item.id || '').toLowerCase();
        if (name.includes('diamond')) return 'diamond';
        if (name.includes('gold')) return 'gold';
        if (name.includes('iron')) return 'iron';
        if (name.includes('bone')) return 'bone';
        return 'leather';
    }
    
    /**
     * Trigger arm swing animation (for mining/attacking)
     */
    triggerArmSwing() {
        if (!this.playerMesh) return;
        const ud = this.playerMesh.userData;
        ud.isSwinging = true;
        ud.swingTime = 0;
    }
    
    updatePlayerModel(player, deltaTime) {
        if (!this.playerMesh || !player) return;
        
        // Position (convert coordinates)
        this.playerMesh.position.set(player.x, player.z + 0.6, player.y);
        
        // Rotation based on camera direction
        if (this.game.camera3d) {
            this.playerMesh.rotation.y = -this.game.camera3d.yaw + Math.PI;
        }
        
        const ud = this.playerMesh.userData;
        
        // Arm swing animation (mining/attacking)
        if (ud.isSwinging) {
            ud.swingTime += deltaTime * 15;
            
            // Swing arc: starts up, swings down
            const swingProgress = ud.swingTime;
            if (swingProgress < Math.PI) {
                // Swing motion
                const swingAngle = Math.sin(swingProgress) * 1.5;
                ud.rightArm.rotation.x = -swingAngle;
                ud.rightArm.rotation.z = Math.sin(swingProgress * 0.5) * 0.3;
            } else {
                ud.isSwinging = false;
                ud.swingTime = 0;
            }
        }
        
        // Walk animation
        const isMoving = Math.abs(player.vx) > 0.01 || Math.abs(player.vy) > 0.01;
        
        if (isMoving && !ud.isSwinging) {
            ud.walkCycle += deltaTime * 10;
            const swing = Math.sin(ud.walkCycle) * 0.5;
            
            ud.leftArm.rotation.x = swing;
            ud.rightArm.rotation.x = -swing;
            ud.leftLeg.rotation.x = -swing;
            ud.rightLeg.rotation.x = swing;
        } else if (!ud.isSwinging) {
            // Reset to idle
            ud.leftArm.rotation.x *= 0.9;
            ud.rightArm.rotation.x *= 0.9;
            ud.leftLeg.rotation.x *= 0.9;
            ud.rightLeg.rotation.x *= 0.9;
            ud.rightArm.rotation.z *= 0.9;
        }
        
        // Update armor display
        this.updatePlayerArmor(player);
    }
    
    updateSelectionBox(x, y, z) {
        if (x !== null && y !== null && z !== null) {
            this.selectionBox.position.set(x + 0.5, z + 0.5, y + 0.5);
            this.selectionBox.visible = true;
        } else {
            this.selectionBox.visible = false;
        }
    }
    
    updatePlacementPreview(x, y, z, blockId) {
        if (x !== null && blockId) {
            this.placementPreview.position.set(x + 0.5, z + 0.5, y + 0.5);
            this.placementPreview.visible = true;
            
            // Update wireframe position
            if (this.placementWireframe) {
                this.placementWireframe.position.set(x + 0.5, z + 0.5, y + 0.5);
                this.placementWireframe.visible = true;
            }
            
            // Color based on whether placement is valid
            const blockAtPos = this.game.world.getBlock(x, y, z);
            const isValid = blockAtPos === BLOCKS.AIR;
            
            // Get block color for preview tinting
            const blockData = BLOCK_DATA[blockId];
            if (blockData && blockData.color) {
                const baseColor = new THREE.Color(blockData.color);
                // Mix with green/red validity indicator
                if (isValid) {
                    baseColor.lerp(new THREE.Color(0x00ff00), 0.5);
                } else {
                    baseColor.lerp(new THREE.Color(0xff0000), 0.5);
                }
                this.placementPreview.material.color.copy(baseColor);
            } else {
                this.placementPreview.material.color.set(isValid ? 0x00ff00 : 0xff0000);
            }
            
            // Wireframe color
            if (this.placementWireframe) {
                this.placementWireframe.material.color.set(isValid ? 0xffffff : 0xff8888);
            }
        } else {
            this.placementPreview.visible = false;
            if (this.placementWireframe) {
                this.placementWireframe.visible = false;
            }
        }
    }
    
    /**
     * Build a mesh for a chunk
     * Uses greedy meshing for efficiency
     */
    buildChunkMesh(chunk) {
        const chunkKey = `${chunk.x},${chunk.y}`;
        
        // Remove old meshes if exists
        if (this.chunkMeshes.has(chunkKey)) {
            const oldMesh = this.chunkMeshes.get(chunkKey);
            this.scene.remove(oldMesh);
            oldMesh.geometry.dispose();
        }
        if (this.waterMeshes.has(chunkKey)) {
            const oldWater = this.waterMeshes.get(chunkKey);
            this.scene.remove(oldWater);
            oldWater.geometry.dispose();
        }
        
        // Geometry data arrays
        const positions = [];
        const normals = [];
        const colors = [];
        const uvs = [];
        const indices = [];
        
        // Water geometry (separate for transparency)
        const waterPositions = [];
        const waterNormals = [];
        const waterColors = [];
        const waterUVs = [];
        const waterIndices = [];
        
        let vertexIndex = 0;
        let waterVertexIndex = 0;
        
        const chunkSize = CONFIG.CHUNK_SIZE;
        const worldHeight = CONFIG.WORLD_HEIGHT;
        
        // Offset in world coordinates
        const offsetX = chunk.x * chunkSize;
        const offsetY = chunk.y * chunkSize;
        
        // Iterate through all blocks
        for (let lx = 0; lx < chunkSize; lx++) {
            for (let ly = 0; ly < chunkSize; ly++) {
                for (let lz = 0; lz < worldHeight; lz++) {
                    const block = chunk.getBlock(lx, ly, lz);
                    
                    if (block === BLOCKS.AIR) continue;
                    
                    const blockData = BLOCK_DATA[block];
                    if (!blockData) continue;
                    
                    const wx = offsetX + lx;
                    const wy = offsetY + ly;
                    const wz = lz;
                    
                    // Get block color
                    const color = new THREE.Color(blockData.color || '#ffffff');
                    
                    // Determine if this is water/transparent
                    const isWater = block === BLOCKS.WATER;
                    const isTransparent = blockData.transparent && !isWater;
                    
                    // Skip other transparent blocks (leaves render normally)
                    if (isTransparent && block !== BLOCKS.LEAVES) continue;
                    
                    const targetPos = isWater ? waterPositions : positions;
                    const targetNorm = isWater ? waterNormals : normals;
                    const targetCol = isWater ? waterColors : colors;
                    const targetUV = isWater ? waterUVs : uvs;
                    const targetIdx = isWater ? waterIndices : indices;
                    let vidx = isWater ? waterVertexIndex : vertexIndex;
                    
                    // Check each face for visibility
                    // Top face (+Z)
                    if (this.shouldRenderFace(chunk, lx, ly, lz + 1, block)) {
                        this.addTexturedFace(targetPos, targetNorm, targetCol, targetUV, targetIdx, 
                            wx, wy, wz, 'top', color, vidx, block);
                        vidx += 4;
                    }
                    
                    // Bottom face (-Z)
                    if (this.shouldRenderFace(chunk, lx, ly, lz - 1, block)) {
                        this.addTexturedFace(targetPos, targetNorm, targetCol, targetUV, targetIdx,
                            wx, wy, wz, 'bottom', color, vidx, block);
                        vidx += 4;
                    }
                    
                    // Front face (+Y)
                    if (this.shouldRenderFace(chunk, lx, ly + 1, lz, block)) {
                        this.addTexturedFace(targetPos, targetNorm, targetCol, targetUV, targetIdx,
                            wx, wy, wz, 'front', color, vidx, block);
                        vidx += 4;
                    }
                    
                    // Back face (-Y)
                    if (this.shouldRenderFace(chunk, lx, ly - 1, lz, block)) {
                        this.addTexturedFace(targetPos, targetNorm, targetCol, targetUV, targetIdx,
                            wx, wy, wz, 'back', color, vidx, block);
                        vidx += 4;
                    }
                    
                    // Right face (+X)
                    if (this.shouldRenderFace(chunk, lx + 1, ly, lz, block)) {
                        this.addTexturedFace(targetPos, targetNorm, targetCol, targetUV, targetIdx,
                            wx, wy, wz, 'right', color, vidx, block);
                        vidx += 4;
                    }
                    
                    // Left face (-X)
                    if (this.shouldRenderFace(chunk, lx - 1, ly, lz, block)) {
                        this.addTexturedFace(targetPos, targetNorm, targetCol, targetUV, targetIdx,
                            wx, wy, wz, 'left', color, vidx, block);
                        vidx += 4;
                    }
                    
                    if (isWater) {
                        waterVertexIndex = vidx;
                    } else {
                        vertexIndex = vidx;
                    }
                }
            }
        }
        
        // Create main chunk mesh
        if (positions.length > 0) {
            // Debug: Log vertex count for first few chunks
            if (this.chunkMeshes.size < 5) {
            }
            
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
            geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
            geometry.setIndex(indices);
            geometry.computeBoundingSphere();
            
            // Use atlas material with vertex colors for AO and face shading
            geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
            let material;
            if (this.atlasTexture) {
                material = new THREE.MeshLambertMaterial({
                    map: this.atlasTexture,
                    vertexColors: true
                });
            } else {
                material = new THREE.MeshLambertMaterial({
                    vertexColors: true
                });
            }
            
            const mesh = new THREE.Mesh(geometry, material);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            
            // Chunks render immediately at full opacity
            mesh.material.transparent = false;
            mesh.material.opacity = 1;
            
            this.scene.add(mesh);
            this.chunkMeshes.set(chunkKey, mesh);
        }
        
        // Create water mesh (separate pass for transparency)
        if (waterPositions.length > 0) {
            const waterGeometry = new THREE.BufferGeometry();
            waterGeometry.setAttribute('position', new THREE.Float32BufferAttribute(waterPositions, 3));
            waterGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(waterNormals, 3));
            waterGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(waterUVs, 2));
            waterGeometry.setIndex(waterIndices);
            
            // Improved water material with better transparency
            const waterMaterial = new THREE.MeshPhongMaterial({
                map: this.atlasTexture,
                color: 0x3399FF, // Brighter blue tint for water
                transparent: true,
                opacity: 0.7,
                side: THREE.DoubleSide,
                shininess: 100,
                specular: 0x444444,
                depthWrite: false // Better transparency sorting
            });
            
            const waterMesh = new THREE.Mesh(waterGeometry, waterMaterial);
            waterMesh.renderOrder = 1; // Render after opaque
            
            this.scene.add(waterMesh);
            this.waterMeshes.set(chunkKey, waterMesh);
        }
        
        return this.chunkMeshes.get(chunkKey);
    }
    
    shouldRenderFace(chunk, lx, ly, lz, currentBlock) {
        if (lz < 0 || lz >= CONFIG.WORLD_HEIGHT) return lz >= CONFIG.WORLD_HEIGHT;

        let adjBlock;

        if (lx < 0 || lx >= CONFIG.CHUNK_SIZE ||
            ly < 0 || ly >= CONFIG.CHUNK_SIZE) {
            const wx = chunk.x * CONFIG.CHUNK_SIZE + lx;
            const wy = chunk.y * CONFIG.CHUNK_SIZE + ly;
            const ncx = Math.floor(wx / CONFIG.CHUNK_SIZE);
            const ncy = Math.floor(wy / CONFIG.CHUNK_SIZE);
            const neighborChunk = this.game.world.getChunk(ncx, ncy);
            if (!neighborChunk) {
                return false;
            }
            adjBlock = this.game.world.getBlock(wx, wy, lz);
        } else {
            adjBlock = chunk.getBlock(lx, ly, lz);
        }

        if (adjBlock === currentBlock) return false;

        return adjBlock === BLOCKS.AIR || BLOCK_DATA[adjBlock]?.transparent;
    }
    
    addFace(positions, normals, colors, indices, x, y, z, face, color, startIndex) {
        // In Three.js: X is right, Y is up, Z is towards camera
        // Our world: X is right, Y is forward, Z is up
        // Conversion: Three.X = World.X, Three.Y = World.Z, Three.Z = World.Y
        
        const faceData = {
            top: {
                verts: [[0,0,1], [1,0,1], [1,1,1], [0,1,1]],
                normal: [0, 1, 0]
            },
            bottom: {
                verts: [[0,1,0], [1,1,0], [1,0,0], [0,0,0]],
                normal: [0, -1, 0]
            },
            front: {
                verts: [[0,0,0], [0,0,1], [1,0,1], [1,0,0]],
                normal: [0, 0, 1]
            },
            back: {
                verts: [[1,1,0], [1,1,1], [0,1,1], [0,1,0]],
                normal: [0, 0, -1]
            },
            right: {
                verts: [[1,0,0], [1,0,1], [1,1,1], [1,1,0]],
                normal: [1, 0, 0]
            },
            left: {
                verts: [[0,1,0], [0,1,1], [0,0,1], [0,0,0]],
                normal: [-1, 0, 0]
            }
        };
        
        const data = faceData[face];
        
        // Add vertices (converted to Three.js coordinates)
        for (const [vx, vy, vz] of data.verts) {
            // Convert: Three.X = World.X, Three.Y = World.Z, Three.Z = World.Y
            positions.push(x + vx, z + vz, y + vy);
            normals.push(data.normal[0], data.normal[2], data.normal[1]);
            
            // Apply slight variation to color based on face for depth
            let colorMod = 1.0;
            if (face === 'top') colorMod = 1.1;
            else if (face === 'bottom') colorMod = 0.6;
            else if (face === 'left' || face === 'back') colorMod = 0.8;
            else colorMod = 0.9;
            
            colors.push(
                Math.min(1, color.r * colorMod),
                Math.min(1, color.g * colorMod),
                Math.min(1, color.b * colorMod)
            );
        }
        
        // Add indices for two triangles
        indices.push(
            startIndex, startIndex + 1, startIndex + 2,
            startIndex, startIndex + 2, startIndex + 3
        );
    }
    
    addFaceWithBlockType(positions, normals, colors, indices, x, y, z, face, color, startIndex, blockId) {
        // Enhanced addFace with special handling for grass blocks
        const faceData = {
            top: {
                verts: [[0,0,1], [1,0,1], [1,1,1], [0,1,1]],
                normal: [0, 1, 0]
            },
            bottom: {
                verts: [[0,1,0], [1,1,0], [1,0,0], [0,0,0]],
                normal: [0, -1, 0]
            },
            front: {
                verts: [[0,0,0], [0,0,1], [1,0,1], [1,0,0]],
                normal: [0, 0, 1]
            },
            back: {
                verts: [[1,1,0], [1,1,1], [0,1,1], [0,1,0]],
                normal: [0, 0, -1]
            },
            right: {
                verts: [[1,0,0], [1,0,1], [1,1,1], [1,1,0]],
                normal: [1, 0, 0]
            },
            left: {
                verts: [[0,1,0], [0,1,1], [0,0,1], [0,0,0]],
                normal: [-1, 0, 0]
            }
        };
        
        const data = faceData[face];
        const isGrass = blockId === BLOCKS.GRASS;
        
        for (const [vx, vy, vz] of data.verts) {
            positions.push(x + vx, z + vz, y + vy);
            normals.push(data.normal[0], data.normal[2], data.normal[1]);
            
            // Color modification based on face and block type
            let r = color.r, g = color.g, b = color.b;
            
            // Grass: green top, brown sides with green gradient
            if (isGrass) {
                if (face === 'top') {
                    r = 0.3; g = 0.69; b = 0.31; // Bright green
                } else if (face !== 'bottom') {
                    // Side - gradient from green to brown
                    const greenAmount = vz; // More green at top
                    r = 0.55 * (1 - greenAmount * 0.5) + 0.3 * greenAmount;
                    g = 0.35 * (1 - greenAmount * 0.5) + 0.5 * greenAmount;
                    b = 0.17 * (1 - greenAmount * 0.5) + 0.2 * greenAmount;
                }
            }
            
            // Face shading
            let shade = 1.0;
            if (face === 'top') shade = 1.0;
            else if (face === 'bottom') shade = 0.5;
            else if (face === 'front' || face === 'right') shade = 0.8;
            else shade = 0.7;
            
            colors.push(r * shade, g * shade, b * shade);
        }
        
        indices.push(
            startIndex, startIndex + 1, startIndex + 2,
            startIndex, startIndex + 2, startIndex + 3
        );
    }
    
    addTexturedFace(positions, normals, colors, uvs, indices, x, y, z, face, color, startIndex, blockId) {
        // Face data in WORLD coordinates (X=right, Y=forward, Z=up)
        // Vertices are at local block positions [x, y, z]
        // Normals point outward from the face in world coords
        const faceData = {
            top: {    // Face at Z=1 (top of block), normal points up (+Z)
                verts: [[0,0,1], [1,0,1], [1,1,1], [0,1,1]],
                normal: [0, 0, 1],  // World +Z (up)
                uvCoords: [[0,0], [1,0], [1,1], [0,1]],
                aoNeighbors: [
                    [[-1,0,0], [-1,-1,0], [0,-1,0]], // Corner 0
                    [[1,0,0], [1,-1,0], [0,-1,0]],   // Corner 1
                    [[1,0,0], [1,1,0], [0,1,0]],     // Corner 2
                    [[-1,0,0], [-1,1,0], [0,1,0]]    // Corner 3
                ]
            },
            bottom: { // Face at Z=0 (bottom of block), normal points down (-Z)
                verts: [[0,1,0], [1,1,0], [1,0,0], [0,0,0]],
                normal: [0, 0, -1], // World -Z (down)
                uvCoords: [[0,0], [1,0], [1,1], [0,1]],
                aoNeighbors: [
                    [[-1,1,0], [-1,0,0], [0,1,0]],
                    [[1,1,0], [1,0,0], [0,1,0]],
                    [[1,-1,0], [1,0,0], [0,-1,0]],
                    [[-1,-1,0], [-1,0,0], [0,-1,0]]
                ]
            },
            front: {  // Face at Y=0 (front of block), normal points backward (-Y)
                verts: [[0,0,0], [0,0,1], [1,0,1], [1,0,0]],
                normal: [0, -1, 0], // World -Y (toward camera/back)
                uvCoords: [[0,0], [0,1], [1,1], [1,0]],
                aoNeighbors: [
                    [[-1,0,0], [-1,0,-1], [0,0,-1]],
                    [[-1,0,0], [-1,0,1], [0,0,1]],
                    [[1,0,0], [1,0,1], [0,0,1]],
                    [[1,0,0], [1,0,-1], [0,0,-1]]
                ]
            },
            back: {   // Face at Y=1 (back of block), normal points forward (+Y)
                verts: [[1,1,0], [1,1,1], [0,1,1], [0,1,0]],
                normal: [0, 1, 0],  // World +Y (forward)
                uvCoords: [[0,0], [0,1], [1,1], [1,0]],
                aoNeighbors: [
                    [[1,0,0], [1,0,-1], [0,0,-1]],
                    [[1,0,0], [1,0,1], [0,0,1]],
                    [[-1,0,0], [-1,0,1], [0,0,1]],
                    [[-1,0,0], [-1,0,-1], [0,0,-1]]
                ]
            },
            right: {  // Face at X=1 (right of block), normal points right (+X)
                verts: [[1,0,0], [1,0,1], [1,1,1], [1,1,0]],
                normal: [1, 0, 0],  // World +X (right)
                uvCoords: [[0,0], [0,1], [1,1], [1,0]],
                aoNeighbors: [
                    [[0,-1,0], [0,-1,-1], [0,0,-1]],
                    [[0,-1,0], [0,-1,1], [0,0,1]],
                    [[0,1,0], [0,1,1], [0,0,1]],
                    [[0,1,0], [0,1,-1], [0,0,-1]]
                ]
            },
            left: {   // Face at X=0 (left of block), normal points left (-X)
                verts: [[0,1,0], [0,1,1], [0,0,1], [0,0,0]],
                normal: [-1, 0, 0], // World -X (left)
                uvCoords: [[0,0], [0,1], [1,1], [1,0]],
                aoNeighbors: [
                    [[0,1,0], [0,1,-1], [0,0,-1]],
                    [[0,1,0], [0,1,1], [0,0,1]],
                    [[0,-1,0], [0,-1,1], [0,0,1]],
                    [[0,-1,0], [0,-1,-1], [0,0,-1]]
                ]
            }
        };
        
        const data = faceData[face];
        const isGrass = blockId === BLOCKS.GRASS;
        
        // Get UV coordinates from atlas
        const texFace = (face === 'top' || face === 'bottom') ? face : 'side';
        const atlasUV = this.getBlockUVs(blockId, texFace);
        
        // Calculate ambient occlusion for each vertex
        const aoValues = [];
        for (let i = 0; i < 4; i++) {
            const neighbors = data.aoNeighbors[i];
            const ao = this.calculateVertexAO(x, y, z, face, neighbors);
            aoValues.push(ao);
        }
        
        for (let i = 0; i < data.verts.length; i++) {
            const [vx, vy, vz] = data.verts[i];
            const [uvX, uvY] = data.uvCoords[i];
            
            // Position
            positions.push(x + vx, z + vz, y + vy);
            normals.push(data.normal[0], data.normal[2], data.normal[1]);
            
            // UV coordinates mapped to atlas
            const u = atlasUV.u + uvX * atlasUV.uSize;
            const v = atlasUV.v + uvY * atlasUV.vSize;
            uvs.push(u, v);
            
            // Color modification for shading (multiplied with texture)
            let r = 1, g = 1, b = 1; // White = use texture color
            
            // Special grass tinting
            if (isGrass) {
                if (face === 'top') {
                    r = 0.6; g = 1.0; b = 0.6; // Green tint
                } else if (face !== 'bottom') {
                    const greenAmount = vz;
                    r = 0.8 + greenAmount * 0.2;
                    g = 0.7 + greenAmount * 0.3;
                    b = 0.6 + greenAmount * 0.2;
                }
            }
            
            // Face shading
            let shade = 1.0;
            if (face === 'top') shade = 1.0;
            else if (face === 'bottom') shade = 0.5;
            else if (face === 'front' || face === 'right') shade = 0.8;
            else shade = 0.7;
            
            // Apply ambient occlusion
            const ao = aoValues[i];
            shade *= ao;
            
            colors.push(r * shade, g * shade, b * shade);
        }
        
        indices.push(
            startIndex, startIndex + 1, startIndex + 2,
            startIndex, startIndex + 2, startIndex + 3
        );
    }
    
    /**
     * Calculate ambient occlusion value for a vertex
     * Based on Minecraft's algorithm: check 3 neighbors (2 edges + 1 corner)
     * Returns value from 0.4 (fully occluded) to 1.0 (no occlusion)
     */
    calculateVertexAO(blockX, blockY, blockZ, face, neighbors) {
        // Neighbors are relative offsets for the 3 blocks to check
        // [edge1, corner, edge2]
        const [e1, corner, e2] = neighbors;
        
        // Get the actual position to check based on face direction
        let dx = 0, dy = 0, dz = 0;
        if (face === 'top') dz = 1;
        else if (face === 'bottom') dz = -1;
        else if (face === 'front') dy = -1;
        else if (face === 'back') dy = 1;
        else if (face === 'right') dx = 1;
        else if (face === 'left') dx = -1;
        
        // Check the blocks in the AO neighborhood
        const isOccluder = (ox, oy, oz) => {
            const bx = blockX + dx + ox;
            const by = blockY + dy + oy;
            const bz = blockZ + dz + oz;
            
            if (bz < 0 || bz >= CONFIG.WORLD_HEIGHT) return false;
            
            const block = this.game.world.getBlock(bx, by, bz);
            if (block === BLOCKS.AIR) return false;
            
            const data = BLOCK_DATA[block];
            return data && !data.transparent;
        };
        
        const side1 = isOccluder(e1[0], e1[1], e1[2]) ? 1 : 0;
        const side2 = isOccluder(e2[0], e2[1], e2[2]) ? 1 : 0;
        const cornerOccluded = isOccluder(corner[0], corner[1], corner[2]) ? 1 : 0;
        
        // Minecraft AO formula
        let aoLevel;
        if (side1 && side2) {
            aoLevel = 0; // Both sides blocked = corner fully occluded
        } else {
            aoLevel = 3 - (side1 + side2 + cornerOccluded);
        }
        
        // Convert to brightness (0.4 to 1.0 range for visible difference)
        const aoValues = [0.4, 0.6, 0.8, 1.0];
        return aoValues[aoLevel];
    }
    
    /**
     * Update entity sprites/meshes
     */
    updateEntity(entity) {
        const id = entity.id || `entity_${entity.x}_${entity.y}`;
        
        if (!this.entityMeshes.has(id)) {
            // Create sprite for entity
            const sprite = this.createEntitySprite(entity);
            this.entityMeshes.set(id, sprite);
            this.scene.add(sprite);
        }
        
        const sprite = this.entityMeshes.get(id);
        // Convert coordinates
        sprite.position.set(entity.x, entity.z + 0.5, entity.y);
        
        // Scale based on entity size
        const scale = entity.width || 1;
        sprite.scale.set(scale, entity.depth || 1.8, scale);
        
        // Item rotation (Minecraft-style spinning)
        if (entity.rotationY !== undefined) {
            sprite.rotation.y = entity.rotationY;
        }
    }
    
    createEntitySprite(entity) {
        // Create a simple colored sprite for now
        // Can be replaced with textured sprites later
        
        let color = 0x00ff00; // Default green
        let isItem = false;
        
        if (entity.constructor.name === 'Player') {
            color = 0xffaa00; // Orange for player
        } else if (entity.constructor.name === 'Enemy') {
            color = 0xff0000; // Red for enemies
        } else if (entity.constructor.name === 'ItemEntity') {
            color = 0xffff00; // Yellow for items
            isItem = true;
        } else if (entity.type === 'npc') {
            color = 0x00aaff; // Blue for NPCs
        }
        
        // Items are smaller floating cubes
        const geometry = isItem ? 
            new THREE.BoxGeometry(0.3, 0.3, 0.3) :
            new THREE.BoxGeometry(0.6, 1.8, 0.6);
        const material = new THREE.MeshLambertMaterial({ color });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        
        return mesh;
    }
    
    removeEntity(entityId) {
        if (this.entityMeshes.has(entityId)) {
            const mesh = this.entityMeshes.get(entityId);
            this.scene.remove(mesh);
            mesh.geometry.dispose();
            this.entityMeshes.delete(entityId);
        }
    }
    
    // ==================== PARTICLES ====================
    
    addParticle(x, y, z, color, velocity, lifetime = 1) {
        const particle = {
            position: new THREE.Vector3(x, z, y),
            velocity: new THREE.Vector3(velocity?.x || 0, velocity?.z || 0, velocity?.y || 0),
            color: new THREE.Color(color),
            lifetime: lifetime,
            age: 0,
            size: 0.1
        };
        
        // Create mesh for particle
        const geometry = new THREE.BoxGeometry(particle.size, particle.size, particle.size);
        const material = new THREE.MeshBasicMaterial({ color: particle.color });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(particle.position);
        
        particle.mesh = mesh;
        this.scene.add(mesh);
        this.particles.push(particle);
    }
    
    addBlockBreakParticles(x, y, z, blockId) {
        const blockData = BLOCK_DATA[blockId];
        const color = blockData?.color || '#888888';
        
        for (let i = 0; i < 10; i++) {
            const vx = (Math.random() - 0.5) * 3;
            const vy = (Math.random() - 0.5) * 3;
            const vz = Math.random() * 3 + 1;
            this.addParticle(
                x + 0.5 + (Math.random() - 0.5) * 0.5,
                y + 0.5 + (Math.random() - 0.5) * 0.5,
                z + 0.5 + (Math.random() - 0.5) * 0.5,
                color,
                { x: vx, y: vy, z: vz },
                0.5 + Math.random() * 0.5
            );
        }
    }
    
    /**
     * Add sprinting dust particles at player's feet
     */
    addSprintParticles(px, py, pz, groundBlockId) {
        const blockData = BLOCK_DATA[groundBlockId];
        const color = blockData?.color || '#8B6914'; // Default dirt color
        
        // Spawn 2-3 small particles behind player
        for (let i = 0; i < 2; i++) {
            const vx = (Math.random() - 0.5) * 0.5;
            const vy = (Math.random() - 0.5) * 0.5;
            const vz = Math.random() * 0.5 + 0.2;
            this.addParticle(
                px + (Math.random() - 0.5) * 0.3,
                py + (Math.random() - 0.5) * 0.3,
                pz - 0.5,
                color,
                { x: vx, y: vy, z: vz },
                0.3 + Math.random() * 0.2
            );
        }
    }
    
    updateParticles(deltaTime) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.age += deltaTime;
            
            if (p.age >= p.lifetime) {
                this.scene.remove(p.mesh);
                p.mesh.geometry.dispose();
                p.mesh.material.dispose();
                this.particles.splice(i, 1);
                continue;
            }
            
            // Physics
            p.velocity.y -= 9.8 * deltaTime; // Gravity
            p.position.add(p.velocity.clone().multiplyScalar(deltaTime));
            p.mesh.position.copy(p.position);
            
            // Fade out
            const alpha = 1 - (p.age / p.lifetime);
            p.mesh.material.opacity = alpha;
            p.mesh.material.transparent = true;
        }
    }
    
    // ==================== DAMAGE NUMBERS ====================
    
    addDamageNumber(x, y, z, damage, isCrit = false) {
        // Create sprite with text
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');
        
        ctx.font = isCrit ? 'bold 24px Arial' : '20px Arial';
        ctx.fillStyle = isCrit ? '#ff0000' : '#ffffff';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.textAlign = 'center';
        ctx.strokeText(Math.round(damage).toString(), 32, 24);
        ctx.fillText(Math.round(damage).toString(), 32, 24);
        
        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
        const sprite = new THREE.Sprite(material);
        sprite.position.set(x, z + 1.5, y);
        sprite.scale.set(1, 0.5, 1);
        
        const dmgNum = {
            sprite,
            velocity: 2,
            age: 0,
            lifetime: 1
        };
        
        this.scene.add(sprite);
        this.damageNumbers.push(dmgNum);
    }
    
    updateDamageNumbers(deltaTime) {
        for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
            const dn = this.damageNumbers[i];
            dn.age += deltaTime;
            
            if (dn.age >= dn.lifetime) {
                this.scene.remove(dn.sprite);
                dn.sprite.material.map.dispose();
                dn.sprite.material.dispose();
                this.damageNumbers.splice(i, 1);
                continue;
            }
            
            // Float up
            dn.sprite.position.y += dn.velocity * deltaTime;
            dn.velocity *= 0.95;
            
            // Fade out
            const alpha = 1 - (dn.age / dn.lifetime);
            dn.sprite.material.opacity = alpha;
        }
    }
    
    /**
     * Flash red damage effect on screen
     */
    flashDamage() {
        if (!this.damageOverlay) {
            // Create full-screen damage overlay
            const overlayGeo = new THREE.PlaneGeometry(2, 2);
            const overlayMat = new THREE.MeshBasicMaterial({
                color: 0xff0000,
                transparent: true,
                opacity: 0,
                depthTest: false,
                depthWrite: false
            });
            this.damageOverlay = new THREE.Mesh(overlayGeo, overlayMat);
            this.damageOverlay.renderOrder = 9999;
            this.damageOverlay.frustumCulled = false;
        }
        
        // Trigger the flash
        this.damageFlashTime = 0.3; // Duration of flash
        this.damageFlashTimer = 0;
    }
    
    /**
     * Update damage flash effect
     */
    updateDamageFlash(deltaTime) {
        if (this.damageFlashTime > 0 && this.damageOverlay) {
            this.damageFlashTimer += deltaTime;
            const progress = this.damageFlashTimer / this.damageFlashTime;
            
            if (progress < 1) {
                // Fade out
                const alpha = (1 - progress) * 0.4;
                this.damageOverlay.material.opacity = alpha;
                
                // Damage tilt effect
                this.damageTiltAngle = Math.sin(progress * Math.PI) * 0.05 * (1 - progress);
            } else {
                this.damageOverlay.material.opacity = 0;
                this.damageFlashTime = 0;
                this.damageTiltAngle = 0;
            }
        }
        
        // Low health pulse effect
        if (this.game.player) {
            const healthPercent = this.game.player.health / this.game.player.maxHealth;
            if (healthPercent < 0.3) {
                this.lowHealthPulse += deltaTime * 3;
                const pulseIntensity = (0.3 - healthPercent) / 0.3;
                const pulse = (Math.sin(this.lowHealthPulse) + 1) * 0.5 * pulseIntensity * 0.2;
                
                // Apply red vignette
                if (this.damageOverlay) {
                    const baseOpacity = this.damageFlashTime > 0 ? this.damageOverlay.material.opacity : 0;
                    this.damageOverlay.material.opacity = Math.max(baseOpacity, pulse);
                }
            }
        }
    }
    
    /**
     * Update torch light flicker
     */
    updateTorchFlicker(deltaTime) {
        this.torchFlickerTime += deltaTime;
        
        for (const light of this.torchLights.values()) {
            const flicker = Math.sin(this.torchFlickerTime * 10 + light.userData.flickerOffset) * 0.15 +
                           Math.sin(this.torchFlickerTime * 23 + light.userData.flickerOffset) * 0.1;
            light.intensity = light.userData.baseIntensity + flicker;
        }
    }
    
    /**
     * Set mining fatigue visual effect
     */
    setMiningFatigue(intensity) {
        // Create overlay if needed
        if (!this.miningFatigueOverlay) {
            const overlayGeo = new THREE.PlaneGeometry(2, 2);
            const overlayMat = new THREE.MeshBasicMaterial({
                color: 0x4A4A4A, // Gray-brown fatigue color
                transparent: true,
                opacity: 0,
                depthTest: false,
                depthWrite: false
            });
            this.miningFatigueOverlay = new THREE.Mesh(overlayGeo, overlayMat);
            this.miningFatigueOverlay.renderOrder = 9997;
            this.miningFatigueOverlay.frustumCulled = false;
        }
        
        this.miningFatigueIntensity = intensity;
        // Pulsing fatigue effect
        const pulse = Math.sin(this.torchFlickerTime * 4) * 0.05;
        this.miningFatigueOverlay.material.opacity = Math.max(0, intensity * 0.3 + pulse);
    }
    
    /**
     * Update grass decorations sway
     */
    updateGrassDecorations(deltaTime) {
        this.grassSwayTime += deltaTime;
        
        for (const grass of this.grassDecorations) {
            // Gentle swaying motion
            const sway = Math.sin(this.grassSwayTime * 2 + grass.userData.swayOffset) * 0.1;
            grass.rotation.x = sway * 0.5;
            grass.rotation.z = Math.sin(this.grassSwayTime * 1.5 + grass.userData.swayOffset * 2) * 0.1;
        }
    }
    
    /**
     * Add grass decoration on a grass block
     */
    addGrassDecoration(x, y, z) {
        // Create simple grass blade geometry
        const bladeGeo = new THREE.PlaneGeometry(0.3, 0.5);
        const bladeMat = new THREE.MeshLambertMaterial({
            color: 0x228B22, // Forest green
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide
        });
        
        const blade = new THREE.Mesh(bladeGeo, bladeMat);
        blade.position.set(
            x + Math.random() * 0.6 + 0.2,
            z + 1.25,
            y + Math.random() * 0.6 + 0.2
        );
        blade.rotation.y = Math.random() * Math.PI;
        blade.userData.swayOffset = Math.random() * Math.PI * 2;
        
        this.scene.add(blade);
        this.grassDecorations.push(blade);
    }
    
    /**
     * Add torch smoke/ember particles
     */
    addTorchParticles(x, y, z) {
        // Small orange ember
        if (Math.random() < 0.3) {
            this.addParticle(
                x + 0.5 + (Math.random() - 0.5) * 0.2,
                y + 0.5 + (Math.random() - 0.5) * 0.2,
                z + 0.8,
                '#FF6600',
                { x: (Math.random() - 0.5) * 0.3, y: (Math.random() - 0.5) * 0.3, z: 0.5 + Math.random() * 0.5 },
                0.5 + Math.random() * 0.5
            );
        }
        // Gray smoke
        if (Math.random() < 0.2) {
            this.addParticle(
                x + 0.5 + (Math.random() - 0.5) * 0.1,
                y + 0.5 + (Math.random() - 0.5) * 0.1,
                z + 0.9,
                '#888888',
                { x: (Math.random() - 0.5) * 0.2, y: (Math.random() - 0.5) * 0.2, z: 0.3 },
                1 + Math.random() * 0.5
            );
        }
    }
    
    /**
     * Add critical hit star particles
     */
    addCriticalHitParticles(x, y, z) {
        const colors = ['#FFFF00', '#FFD700', '#FFA500', '#FFFFFF'];
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const speed = 2 + Math.random() * 2;
            this.addParticle(
                x + (Math.random() - 0.5) * 0.3,
                y + (Math.random() - 0.5) * 0.3,
                z + 0.5,
                colors[Math.floor(Math.random() * colors.length)],
                { 
                    x: Math.cos(angle) * speed, 
                    y: Math.sin(angle) * speed, 
                    z: 1 + Math.random() * 2 
                },
                0.5 + Math.random() * 0.3
            );
        }
    }
    
    /**
     * Flash an entity red when damaged
     */
    flashEntityRed(entityId) {
        const mesh = this.entityMeshes.get(entityId);
        if (mesh) {
            mesh.userData.hurtFlash = 0.3; // Flash duration
            mesh.userData.originalColor = mesh.material.color.clone();
        }
    }
    
    /**
     * Spawn experience orb at position
     */
    spawnExperienceOrb(x, y, z, amount = 1) {
        // Create glowing green orb
        const orbGeo = new THREE.SphereGeometry(0.15, 8, 8);
        const orbMat = new THREE.MeshBasicMaterial({
            color: 0x00FF00,
            transparent: true,
            opacity: 0.9
        });
        const orb = new THREE.Mesh(orbGeo, orbMat);
        orb.position.set(x + 0.5, z + 0.5, y + 0.5);
        orb.userData = {
            type: 'xp_orb',
            amount: amount,
            age: 0,
            bobOffset: Math.random() * Math.PI * 2,
            vx: (Math.random() - 0.5) * 2,
            vy: (Math.random() - 0.5) * 2,
            vz: Math.random() * 3 + 1
        };
        
        // Add glow
        const glowGeo = new THREE.SphereGeometry(0.25, 8, 8);
        const glowMat = new THREE.MeshBasicMaterial({
            color: 0x88FF88,
            transparent: true,
            opacity: 0.3
        });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        orb.add(glow);
        
        this.scene.add(orb);
        
        if (!this.xpOrbs) this.xpOrbs = [];
        this.xpOrbs.push(orb);
    }
    
    /**
     * Update XP orbs - move toward player and collect
     */
    updateXPOrbs(deltaTime) {
        if (!this.xpOrbs) return;
        
        const player = this.game.player;
        if (!player) return;
        
        for (let i = this.xpOrbs.length - 1; i >= 0; i--) {
            const orb = this.xpOrbs[i];
            orb.userData.age += deltaTime;
            
            // Bob animation
            const bob = Math.sin(orb.userData.age * 3 + orb.userData.bobOffset) * 0.1;
            
            // Apply velocity initially
            if (orb.userData.age < 0.5) {
                orb.position.x += orb.userData.vx * deltaTime;
                orb.position.z += orb.userData.vy * deltaTime;
                orb.position.y += orb.userData.vz * deltaTime;
                orb.userData.vz -= 9.8 * deltaTime;
            } else {
                // Attract toward player
                const dx = player.x - orb.position.x;
                const dy = player.y - orb.position.z;
                const dz = (player.z + 1) - orb.position.y;
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                
                if (dist < 2) {
                    // Move toward player faster when close
                    const speed = 8 / Math.max(0.5, dist);
                    orb.position.x += (dx / dist) * speed * deltaTime;
                    orb.position.z += (dy / dist) * speed * deltaTime;
                    orb.position.y += (dz / dist) * speed * deltaTime + bob * 0.5;
                    
                    // Collect when very close
                    if (dist < 0.5) {
                        player.gainXP?.(orb.userData.amount);
                        this.game.audio?.play('xp');
                        this.scene.remove(orb);
                        orb.geometry.dispose();
                        orb.material.dispose();
                        this.xpOrbs.splice(i, 1);
                        continue;
                    }
                } else {
                    // Gentle bob
                    orb.position.y += bob * deltaTime;
                }
            }
            
            // Despawn after 30 seconds
            if (orb.userData.age > 30) {
                this.scene.remove(orb);
                orb.geometry.dispose();
                orb.material.dispose();
                this.xpOrbs.splice(i, 1);
            }
        }
    }
    
    /**
     * Update lighting based on time of day
     */
    updateDayNightCycle(timeOfDay) {
        // timeOfDay is 0-1, where 0.25 is noon, 0.75 is midnight
        const dayPhase = timeOfDay;
        
        // Sun position (circular path)
        const sunAngle = dayPhase * Math.PI * 2;
        const sunHeight = Math.sin(sunAngle) * 100;
        const sunDist = Math.cos(sunAngle) * 100;
        
        this.sunLight.position.set(sunDist, Math.max(10, sunHeight), sunDist);
        
        // Light intensity based on time
        const isDay = dayPhase > 0.2 && dayPhase < 0.8;
        
        if (isDay) {
            const dayIntensity = Math.sin((dayPhase - 0.2) / 0.6 * Math.PI);
            this.sunLight.intensity = 0.4 + dayIntensity * 0.6;
            this.ambientLight.intensity = 0.3 + dayIntensity * 0.3;
            
            // Sky color
            const skyColor = new THREE.Color().lerpColors(
                new THREE.Color(0xffaa55), // Sunrise/sunset
                new THREE.Color(0x87CEEB), // Day
                dayIntensity
            );
            this.renderer.setClearColor(skyColor);
            this.scene.fog.color = skyColor;
        } else {
            this.sunLight.intensity = 0.1;
            this.ambientLight.intensity = 0.15;
            this.renderer.setClearColor(0x1a2a4a);
            this.scene.fog.color.set(0x1a2a4a);
        }
    }
    
    /**
     * Main render call
     */
    render(camera3d, deltaTime = 0.016) {
        if (!camera3d || !camera3d.camera) return;
        
        // Update player model
        if (this.game.player) {
            this.updatePlayerModel(this.game.player, deltaTime);
            
            // Update player shadow
            this.updateEntityShadow('player', 
                this.game.player.x, 
                this.game.player.y, 
                this.game.player.z
            );
            
            // Check if player is underwater
            const headBlock = this.game.world.getBlock(
                Math.floor(this.game.player.x),
                Math.floor(this.game.player.y),
                Math.floor(this.game.player.z + 1.5)
            );
            this.setUnderwater(headBlock === BLOCKS.WATER);
            
            // Update first-person hand with bob
            this.updateFirstPersonHand(camera3d.camera, this.game.player, deltaTime);
        }
        
        // Update sun shadow camera to follow player
        if (this.game.player && this.sunLight) {
            const px = this.game.player.x;
            const py = this.game.player.y;
            const pz = this.game.player.z;
            
            this.sunLight.target.position.set(px, pz, py);
            
            // Move stars with player
            if (this.stars) {
                this.stars.position.set(px, 0, py);
            }
        }
        
        // Update clouds
        this.updateClouds(deltaTime);
        
        // Update chunk fade-in animation
        this.updateChunkFadeIn(deltaTime);
        
        // Update torch flicker
        this.updateTorchFlicker(deltaTime);
        
        // Update grass decorations sway
        this.updateGrassDecorations(deltaTime);
        
        // Update torch particles (spawn occasionally)
        if (!this.torchParticleTimer) this.torchParticleTimer = 0;
        this.torchParticleTimer -= deltaTime;
        if (this.torchParticleTimer <= 0) {
            this.torchParticleTimer = 0.1;
            for (const light of this.torchLights.values()) {
                const pos = light.userData.worldPos;
                if (pos) {
                    this.addTorchParticles(pos.x, pos.y, pos.z);
                }
            }
        }
        
        // Update particles
        this.updateParticles(deltaTime);
        
        // Update XP orbs
        this.updateXPOrbs(deltaTime);
        
        // Update rain/snow particles
        this.updateRainParticles(deltaTime);
        
        // Update damage numbers
        this.updateDamageNumbers(deltaTime);
        
        // Update damage flash effect
        this.updateDamageFlash(deltaTime);
        
        // Apply camera damage tilt
        if (camera3d && this.damageTiltAngle !== 0) {
            camera3d.camera.rotation.z = this.damageTiltAngle;
        }
        
        this.renderer.render(this.scene, camera3d.camera);
    }
    
    resize() {
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
    
    /**
     * Mark chunk for rebuild
     */
    markChunkDirty(cx, cy) {
        const chunkKey = `${cx},${cy}`;
        // Will be rebuilt on next frame
        if (this.chunkMeshes.has(chunkKey)) {
            const mesh = this.chunkMeshes.get(chunkKey);
            mesh.userData.dirty = true;
        }
    }
    
    /**
     * Clear all chunk meshes (for save/load)
     */
    clearAllChunkMeshes() {
        // Dispose chunk meshes
        for (const mesh of this.chunkMeshes.values()) {
            this.scene.remove(mesh);
            mesh.geometry?.dispose();
        }
        this.chunkMeshes.clear();
        
        // Dispose water meshes
        for (const mesh of this.waterMeshes.values()) {
            this.scene.remove(mesh);
            mesh.geometry?.dispose();
        }
        this.waterMeshes.clear();
        
    }
    
    /**
     * Update 3D rain particles
     */
    updateRainParticles(deltaTime) {
        const weather = this.game.weather?.currentWeather;
        const isRaining = weather && (weather.name === 'Rain' || weather.name === 'Heavy Rain' || weather.name === 'Thunderstorm');
        const isSnowing = weather && (weather.name === 'Snow' || weather.name === 'Blizzard');
        
        if (!isRaining && !isSnowing) {
            // Remove existing rain particles
            for (const p of this.rainParticles) {
                this.scene.remove(p.mesh);
                p.mesh.geometry.dispose();
                p.mesh.material.dispose();
            }
            this.rainParticles = [];
            return;
        }
        
        const player = this.game.player;
        if (!player) return;
        
        // Spawn new particles
        const targetCount = isSnowing ? 200 : (weather.name === 'Heavy Rain' ? 400 : 250);
        while (this.rainParticles.length < targetCount) {
            const spread = 30;
            const geo = isSnowing ? 
                new THREE.SphereGeometry(0.03, 4, 4) :
                new THREE.CylinderGeometry(0.02, 0.02, 0.3, 4);
            const mat = new THREE.MeshBasicMaterial({
                color: isSnowing ? 0xFFFFFF : 0x88AACC,
                transparent: true,
                opacity: isSnowing ? 0.9 : 0.6
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(
                player.x + (Math.random() - 0.5) * spread,
                player.z + 20 + Math.random() * 10,
                player.y + (Math.random() - 0.5) * spread
            );
            
            if (!isSnowing) {
                mesh.rotation.x = Math.PI / 2;
            }
            
            this.scene.add(mesh);
            this.rainParticles.push({
                mesh,
                vz: isSnowing ? -2 - Math.random() : -15 - Math.random() * 5,
                vx: isSnowing ? (Math.random() - 0.5) * 2 : 0
            });
        }
        
        // Update particles
        for (let i = this.rainParticles.length - 1; i >= 0; i--) {
            const p = this.rainParticles[i];
            p.mesh.position.y += p.vz * deltaTime;
            p.mesh.position.x += (p.vx || 0) * deltaTime;
            
            // Reset if below ground
            if (p.mesh.position.y < player.z - 5) {
                p.mesh.position.set(
                    player.x + (Math.random() - 0.5) * 30,
                    player.z + 20 + Math.random() * 10,
                    player.y + (Math.random() - 0.5) * 30
                );
            }
        }
    }
    
    /**
     * Add water splash particles (for walking in shallow water)
     */
    addWaterSplash(x, y, z) {
        for (let i = 0; i < 5; i++) {
            this.addParticle(
                x + (Math.random() - 0.5) * 0.5,
                y + (Math.random() - 0.5) * 0.5,
                z,
                '#88CCFF',
                { 
                    x: (Math.random() - 0.5) * 2, 
                    y: (Math.random() - 0.5) * 2, 
                    z: 1 + Math.random() * 2 
                },
                0.3 + Math.random() * 0.2
            );
        }
    }
    
    /**
     * Clean up resources
     */
    dispose() {
        // Dispose chunk meshes
        for (const mesh of this.chunkMeshes.values()) {
            this.scene.remove(mesh);
            mesh.geometry.dispose();
        }
        this.chunkMeshes.clear();
        
        // Dispose water meshes
        for (const mesh of this.waterMeshes.values()) {
            this.scene.remove(mesh);
            mesh.geometry.dispose();
        }
        this.waterMeshes.clear();
        
        // Dispose entity meshes
        for (const mesh of this.entityMeshes.values()) {
            this.scene.remove(mesh);
            mesh.geometry.dispose();
        }
        this.entityMeshes.clear();
        
        // Dispose particles
        for (const p of this.particles) {
            this.scene.remove(p.mesh);
            p.mesh.geometry.dispose();
            p.mesh.material.dispose();
        }
        this.particles = [];
        
        // Dispose damage numbers
        for (const dn of this.damageNumbers) {
            this.scene.remove(dn.sprite);
            dn.sprite.material.map?.dispose();;
            dn.sprite.material.dispose();
        }
        this.damageNumbers = [];
        
        // Dispose player mesh
        if (this.playerMesh) {
            this.scene.remove(this.playerMesh);
        }
        
        // Dispose materials
        for (const material of this.blockMaterials.values()) {
            material.dispose();
        }
        this.blockMaterials.clear();
        
        // Dispose atlas
        if (this.atlasTexture) {
            this.atlasTexture.dispose();
        }
        if (this.atlasMaterial) {
            this.atlasMaterial.dispose();
        }
        
        // Dispose texture manager
        if (this.textureManager) {
            this.textureManager.dispose();
        }
        
        this.renderer.dispose();
    }
}
