const { PLAYER_DEFAULTS } = require('../shared/constants.js');

class Player {
  constructor(id, username) {
    this.id = id;
    this.username = username;
    this.health = PLAYER_DEFAULTS.health;
    this.speed = PLAYER_DEFAULTS.speed;
    this.ammo = PLAYER_DEFAULTS.ammo;
    this.kills = 0;
    this.deaths = 0;
    this.score = 0;
    this.activePowerups = [];
  }

  takeDamage(amount) {
    this.health = Math.max(0, this.health - amount);
  }

  isAlive() {
    return this.health > 0;
  }

  applyPowerup(type) {
    if (!this.activePowerups.includes(type)) {
      this.activePowerups.push(type);
    }
  }

  resetPowerups() {
    this.activePowerups = [];
  }
}

module.exports = { Player };
