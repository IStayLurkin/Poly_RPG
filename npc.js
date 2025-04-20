const { v4: uuidv4 } = require('uuid');

class Npc {
    constructor(id, position, config) {
        this.id = id || uuidv4();
        this.position = position;
        this.type = config.type || 'unknown';
        this.health = config.health || 100;
        this.size = config.size || { x: 1, y: 2, z: 1 };
        this.color = config.color || '#FFFFFF';
        this.isAlive = true;
    }

    update(deltaTime, gameState) {
        // No AI yet, maybe idle animation or future patrol logic
        if (this.health <= 0) this.isAlive = false;
    }

    takeDamage(amount, attackerId) {
        if (!this.isAlive) return false;
        this.health -= amount;
        if (this.health <= 0) {
            this.isAlive = false;
            return true; // NPC destroyed
        }
        return false;
    }

    getNetworkState() {
        return {
            id: this.id,
            type: this.type,
            position: this.position,
            size: this.size,
            color: this.color,
            health: this.health,
            isAlive: this.isAlive
        };
    }
}

module.exports = Npc;
