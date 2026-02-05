const fs = require('fs');
const path = require('path');
const cooldownPath = path.join(__dirname, 'cooldowns.json');

if (!fs.existsSync(cooldownPath)) {
    fs.writeFileSync(cooldownPath, JSON.stringify({ users: {} }, null, 4));
}

module.exports = {
    checkCooldown: (userId, guildId, cooldownMs = 600000) => { // Default 10 minutes
        const db = JSON.parse(fs.readFileSync(cooldownPath));
        const key = `${userId}_${guildId}`;
        const lastUsed = db.users[key];

        if (lastUsed) {
            const timeDiff = Date.now() - lastUsed;
            if (timeDiff < cooldownMs) {
                return {
                    onCooldown: true,
                    remaining: cooldownMs - timeDiff
                };
            }
        }
        return { onCooldown: false };
    },
    setCooldown: (userId, guildId) => {
        const db = JSON.parse(fs.readFileSync(cooldownPath));
        const key = `${userId}_${guildId}`;
        db.users[key] = Date.now();
        fs.writeFileSync(cooldownPath, JSON.stringify(db, null, 4));
    },
    clearCooldown: (userId, guildId) => {
        const db = JSON.parse(fs.readFileSync(cooldownPath));
        const key = `${userId}_${guildId}`;
        delete db.users[key];
        fs.writeFileSync(cooldownPath, JSON.stringify(db, null, 4));
    }
};
