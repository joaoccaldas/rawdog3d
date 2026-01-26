import { Entity } from './entity.js';
import { CONFIG, ITEMS } from '../config.js';

export class ItemEntity extends Entity {
    constructor(game, x, y, z, itemType) {
        super(game, x, y, z);
        this.itemType = itemType;
        this.itemData = ITEMS[itemType];

        this.width = 0.4;
        this.height = 0.4;
        this.depth = 0.4;
        this.emoji = this.itemData ? this.itemData.emoji : '❓';
        this.size = 0.5;

        // Float animation
        this.floatOffset = Math.random() * Math.PI * 2;
        this.originalZ = z;
        this.creationTime = Date.now();

        // Physics
        this.grounded = false;

        // Pickup
        this.pickupDelay = 500; // ms before can be picked up
        this.attractRange = 3.0; // Start attracting to player
        this.attractSpeed = 8.0; // Speed when attracted
        this.beingAttracted = false;
        this.rotationY = Math.random() * Math.PI * 2;
    }

    update(deltaTime) {
        const now = Date.now();
        const player = this.game.player;

        // Rotation animation (Minecraft-style spinning)
        this.rotationY += deltaTime * 2;

        // Check if should attract to player
        if (player && now - this.creationTime > this.pickupDelay) {
            const dx = player.x - this.x;
            const dy = player.y - this.y;
            const dz = (player.z + 0.5) - this.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

            if (dist < this.attractRange && dist > 0.3) {
                // Attract toward player (like Minecraft magnet effect)
                this.beingAttracted = true;
                const speed = this.attractSpeed * deltaTime;
                const factor = Math.min(speed / dist, 1);
                this.x += dx * factor;
                this.y += dy * factor;
                this.z += dz * factor;
                this.grounded = false; // Allow vertical movement
            } else if (dist <= 0.3) {
                // Close enough to collect
                if (player.addItem(this.itemType)) {
                    this.isDead = true;
                    if (this.game.audio) {
                        this.game.audio.play('pickup');
                    }
                }
            }
        }

        // Only apply normal physics if not being attracted
        if (!this.beingAttracted) {
            // Floating animation
            if (this.grounded) {
                this.z = this.originalZ + Math.sin((now / 500) + this.floatOffset) * 0.1;
            } else {
                // Gravity
                this.vz -= CONFIG.GRAVITY * deltaTime * 0.5;
                this.z += this.vz * deltaTime;

                // Floor collision
                const floor = Math.floor(this.z);
                if (this.game.world.getBlock(Math.floor(this.x), Math.floor(this.y), floor) !== 0) {
                    this.blockCollision(floor + 1);
                }
            }
        }

        // Reset attraction state for next frame
        this.beingAttracted = false;
    }

    blockCollision(groundZ) {
        this.z = groundZ;
        this.vz = 0;
        this.grounded = true;
        this.originalZ = this.z;
    }

    checkPickup() {
        // Pickup logic now handled in update() with attraction
    }
}
