const fs = require('fs');
const path = require('path');
const dbPath = path.join(__dirname, 'database.json');

if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify({ guilds: {} }, null, 4));
}

module.exports = {
    getGuildConfig: (guildId) => {
        const db = JSON.parse(fs.readFileSync(dbPath));
        return db.guilds[guildId] || null;
    },
    setGuildConfig: (guildId, config) => {
        const db = JSON.parse(fs.readFileSync(dbPath));
        db.guilds[guildId] = { ...db.guilds[guildId], ...config };
        fs.writeFileSync(dbPath, JSON.stringify(db, null, 4));
    },
    getAllConfigs: () => {
        const db = JSON.parse(fs.readFileSync(dbPath));
        return db.guilds;
    }
};
