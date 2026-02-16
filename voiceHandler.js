const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, StreamType } = require('@discordjs/voice');
const voiceConfig = require('./voiceConfig');
const voiceMessages = require('./voiceMessages');
const db = require('./db');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// Durum Yönetimi
let userQueue = [];
let isProcessing = false;

let audioPlayer = createAudioPlayer();

// DEBUG İÇİN DURUM TAKİBİ
audioPlayer.on('stateChange', (oldState, newState) => {
    if (voiceConfig.SHOW_TTS_LOGS) console.log(`[TTS] ${oldState.status} -> ${newState.status}`);
});
audioPlayer.on('error', error => console.error('[TTS ERROR]', error));

// Bellek sızıntısı uyarısını engellemek için limitleri kaldırıyoruz
audioPlayer.setMaxListeners(0);

let currentConnection = null;


/**
 * VIP KULLANICI İÇİN ÖZEL SES ÇALMA
 */
async function playVipSound(channel, config) {
    return new Promise(async (resolve) => {
        try {
            const connection = joinVoiceChannel({
                channelId: channel.id,
                guildId: channel.guild.id,
                adapterCreator: channel.guild.voiceAdapterCreator,
                selfDeaf: false,
                selfMute: false
            });
            currentConnection = connection;

            // Bağlantıyı bekle
            try {
                await require('@discordjs/voice').entersState(connection, require('@discordjs/voice').VoiceConnectionStatus.Ready, 10000);
            } catch (e) {
                console.error('[VIP SOUND] Bağlantı hatası:', e.message);
                return resolve(false);
            }

            const resource = createAudioResource(config.VIP_SOUND_FILE || voiceConfig.VIP_SOUND_FILE, {
                inputType: StreamType.Arbitrary,
                inlineVolume: true
            });

            if (resource.volume) {
                resource.volume.setVolume(config.VIP_SOUND_VOLUME || voiceConfig.VIP_SOUND_VOLUME || 0.5);
            }

            connection.subscribe(audioPlayer);
            audioPlayer.play(resource);

            audioPlayer.once(AudioPlayerStatus.Idle, () => {
                resolve(true);
            });

            audioPlayer.once('error', error => {
                console.error('[VIP SOUND ERROR]', error);
                resolve(false);
            });
        } catch (error) {
            console.error('[VIP SOUND FATAL ERROR]', error);
            resolve(false);
        }
    });
}

/**
 * GENEL SES DOSYASI ÇALMA FONKSİYONU
 */
async function playSoundFile(channel, soundFilePath, config) {
    return new Promise(async (resolve) => {
        try {
            const connection = joinVoiceChannel({
                channelId: channel.id,
                guildId: channel.guild.id,
                adapterCreator: channel.guild.voiceAdapterCreator,
                selfDeaf: false,
                selfMute: false
            });
            currentConnection = connection;

            // Bağlantıyı bekle
            try {
                await require('@discordjs/voice').entersState(connection, require('@discordjs/voice').VoiceConnectionStatus.Ready, 10000);
            } catch (e) {
                console.error('[SOUND FILE] Bağlantı hatası:', e.message);
                return resolve(false);
            }

            const resource = createAudioResource(soundFilePath, {
                inputType: StreamType.Arbitrary,
                inlineVolume: true
            });

            if (resource.volume) {
                const volume = config.SOUND_FILES_VOLUME || voiceConfig.SOUND_FILES_VOLUME || 0.5;
                resource.volume.setVolume(volume);
            }

            connection.subscribe(audioPlayer);
            audioPlayer.play(resource);

            audioPlayer.once(AudioPlayerStatus.Idle, () => {
                resolve(true);
            });

            audioPlayer.once('error', error => {
                console.error('[SOUND FILE ERROR]', error);
                resolve(false);
            });
        } catch (error) {
            console.error('[SOUND FILE FATAL ERROR]', error);
            resolve(false);
        }
    });
}

/**
 * AKILLI SES ÇALMA - Ses dosyası varsa onu kullan, yoksa TTS kullan
 */
async function speakOrPlaySound(channel, text, soundFileKey, config) {
    const useSoundFiles = config.USE_SOUND_FILES !== undefined ? config.USE_SOUND_FILES : voiceConfig.USE_SOUND_FILES;

    if (useSoundFiles && soundFileKey) {
        // Ses dosyası yolunu al
        let soundFilePath = null;

        switch (soundFileKey) {
            case 'welcome':
                soundFilePath = config.SOUND_WELCOME || voiceConfig.SOUND_WELCOME;
                break;
            case 'staff_found':
                soundFilePath = config.SOUND_STAFF_FOUND || voiceConfig.SOUND_STAFF_FOUND;
                break;
            case 'staff_not_found':
                soundFilePath = config.SOUND_STAFF_NOT_FOUND || voiceConfig.SOUND_STAFF_NOT_FOUND;
                break;
            case 'staff_notify':
                soundFilePath = config.SOUND_STAFF_NOTIFY || voiceConfig.SOUND_STAFF_NOTIFY;
                break;
        }

        if (soundFilePath) {
            console.log(`[SOUND] Ses dosyası çalınıyor: ${soundFilePath}`);
            return await playSoundFile(channel, soundFilePath, config);
        }
    }

    // Ses dosyası yoksa veya USE_SOUND_FILES false ise TTS kullan
    return await speak(channel, text, config);
}

/**
 * SESLİ OKUMA FONKSİYONU
 */
async function speak(channel, text, config) {
    if (voiceConfig.SHOW_TTS_LOGS) {
        console.log(`[TTS] Okunuyor: ${text}`);
        console.log(`[TTS] Kanal:`, channel.name, `(${channel.id})`);
    }

    return new Promise(async (resolve) => {
        try {
            if (voiceConfig.SHOW_TTS_LOGS) console.log('[TTS] Ses kanalına bağlanılıyor...');
            const connection = joinVoiceChannel({
                channelId: channel.id,
                guildId: channel.guild.id,
                adapterCreator: channel.guild.voiceAdapterCreator,
                selfDeaf: false,
                selfMute: false
            });
            currentConnection = connection;
            if (voiceConfig.SHOW_TTS_LOGS) console.log('[TTS] Bağlantı oluşturuldu, Ready durumu bekleniyor...');

            // BAĞLANTIYI BEKLE
            try {
                await require('@discordjs/voice').entersState(connection, require('@discordjs/voice').VoiceConnectionStatus.Ready, 10000);
                if (voiceConfig.SHOW_TTS_LOGS) console.log('[TTS] ✅ Bağlantı Ready durumunda!');
            } catch (e) {
                console.error('[TTS] ❌ Bağlantı Hatası - Ready durumuna geçemedi:', e.message);
                return resolve();
            }

            const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=tr&client=tw-ob`;
            if (voiceConfig.SHOW_TTS_LOGS) console.log('[TTS] TTS URL:', ttsUrl);

            if (voiceConfig.SHOW_TTS_LOGS) console.log('[TTS] Audio resource oluşturuluyor...');
            const resource = createAudioResource(ttsUrl, {
                inputType: StreamType.Arbitrary,
                inlineVolume: true
            });
            if (voiceConfig.SHOW_TTS_LOGS) console.log('[TTS] ✅ Audio resource oluşturuldu');

            const volume = config.TTS_VOLUME || voiceConfig.TTS_VOLUME || 0.5;
            if (resource.volume) {
                resource.volume.setVolume(volume);
                if (voiceConfig.SHOW_TTS_LOGS) console.log('[TTS] Ses seviyesi ayarlandı:', volume);
            }

            if (voiceConfig.SHOW_TTS_LOGS) {
                console.log('[TTS] Connection subscribe ediliyor...');
            }
            connection.subscribe(audioPlayer);
            if (voiceConfig.SHOW_TTS_LOGS) console.log('[TTS] Audio player başlatılıyor...');
            audioPlayer.play(resource);
            if (voiceConfig.SHOW_TTS_LOGS) console.log('[TTS] ✅ Audio player PLAY komutu verildi');

            audioPlayer.once(AudioPlayerStatus.Idle, () => {
                if (voiceConfig.SHOW_TTS_LOGS) console.log('[TTS] ✅ Oynatma tamamlandı (Idle)');
                setTimeout(() => {
                    resolve();
                }, 1000);
            });

            audioPlayer.once('error', error => {
                console.error('[TTS ERROR] Oynatma hatası:', error);
                resolve();
            });
        } catch (error) {
            console.error('[TTS FATAL ERROR]', error);
            resolve();
        }
    });
}

/**
 * SESLİ İŞLEM BAŞLATICI (Buton veya Event için)
 */
async function startStaffSearch(member, channel, config) {
    userQueue.push({ member, channel, config });
    processQueue();
}

/**
 * SIRALAMA YÖNETİCİSİ
 */
async function processQueue() {
    if (isProcessing || userQueue.length === 0) return;
    isProcessing = true;

    const { member, channel, config } = userQueue.shift();

    try {
        const guild = channel.guild;

        // Önce her zaman yazılı bildirim gönderiyoruz
        await sendStaffAlert(guild, member, config);

        // VIP KULLANICI KONTROLÜ
        const vipUserId = config.VIP_USER_ID || voiceConfig.VIP_USER_ID;
        let staffFoundAtAll = false;
        let vipFound = false;

        // 1. ÖNCE VIP (GÜNGÖR) KONTROLÜ
        const allChannels = guild.channels.cache.filter(c => (c.type === 2 || c.type === 'GUILD_VOICE') && c.id !== channel.id);

        if (vipUserId) {
            for (const [id, sChannel] of allChannels) {
                const vipUser = sChannel.members.find(m => m.id === vipUserId && !m.user.bot);
                if (vipUser) {
                    vipFound = true;
                    staffFoundAtAll = true;
                    console.log(`[VIP] VIP kullanıcı bulundu: ${vipUser.displayName} - Sadece ona özel ses çalınıyor...`);

                    // Sadece VIP kullanıcının kanalında özel sesini çal
                    await playVipSound(sChannel, config);
                    break;
                }
            }
        }

        // 2. VIP BULUNAMADIYSA DİĞER YETKİLİLERE HABER VER
        if (!vipFound) {
            for (const [id, sChannel] of allChannels) {
                const staff = sChannel.members.find(m => !m.user.bot && m.roles.cache.has(config.STAFF_ROLE_ID));
                if (staff) {
                    staffFoundAtAll = true;
                    // Diğer yetkililerin kanalında standart bildirim çal
                    await speakOrPlaySound(sChannel, voiceMessages.staff.notifyStaff(member.displayName), 'staff_notify', config);
                }
            }
        }

        // 3. KULLANICIYA SONUCU BİLDİR (KAYIT KANALINDA)
        if (staffFoundAtAll) {
            // Herhangi bir yetkili (VIP veya normal) bulunduysa kullanıcıya "Yetkiliye haber verildi" sesi çal
            await speakOrPlaySound(channel, voiceMessages.staff.staffFound(), 'staff_notify', config);
        } else {
            // Hiç kimse bulunamadıysa
            await speakOrPlaySound(channel, voiceMessages.staff.staffNotFound(), 'staff_not_found', config);
        }
    } catch (err) {
        console.error("Sesli işlem hatası:", err);
    } finally {
        isProcessing = false;
        if (userQueue.length > 0) {
            setTimeout(processQueue, 1000);
        }
    }
}

/**
 * YETKİLİYE YAZILI MESAJ
 */
async function sendStaffAlert(guild, applicant, config) {
    try {
        const notifyChannel = await guild.channels.fetch(config.STAFF_NOTIFICATION_CHANNEL_ID);
        if (!notifyChannel) return;

        const embed = new EmbedBuilder()
            .setTitle('🚨 Kayıt Bekleyen Kullanıcı')
            .setColor('Red')
            .setDescription(`${applicant} şu an kayıt ses kanalında bekliyor!`)
            .setTimestamp();

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`register_user_${applicant.id}`)
                    .setLabel('Kullanıcıyı Kaydet')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('📝')
            );

        await notifyChannel.send({
            content: `<@&${config.STAFF_ROLE_ID}>`,
            embeds: [embed],
            components: [row]
        });
    } catch (error) {
        console.error('Staff alert error:', error);
    }
}

/**
 * EVENT HANDLER (index.js içine)
 */
async function handleVoiceStateUpdate(oldState, newState) {
    const guildId = newState.guild.id;
    const config = db.getGuildConfig(guildId) || voiceConfig;

    if (voiceConfig.SHOW_VOICE_EVENTS) {
        console.log('[VOICE EVENT] Voice state update detected');
        console.log('[VOICE EVENT] Config:', config ? 'Loaded' : 'Missing');
        console.log('[VOICE EVENT] Enabled:', config?.ENABLED);
        console.log('[VOICE EVENT] Voice Channel ID:', config?.VOICE_CHANNEL_ID);
    }

    if (!config || !config.ENABLED || config.VOICE_CHANNEL_ID === 'YAPI_BEKLEYEN_SES_KANAL_ID') {
        if (voiceConfig.SHOW_VOICE_EVENTS) console.log('[VOICE EVENT] Sistem devre dışı veya yapılandırılmamış');
        return;
    }

    // Kanal Giriş Kontrolü
    if (newState.channelId === config.VOICE_CHANNEL_ID && oldState.channelId !== newState.channelId) {
        const member = newState.member;
        if (voiceConfig.SHOW_VOICE_EVENTS) console.log('[VOICE EVENT] Kullanıcı kayıt kanalına girdi:', member?.user?.tag);

        if (!member || member.user.bot) {
            if (voiceConfig.SHOW_VOICE_EVENTS) console.log('[VOICE EVENT] Bot veya member yok, işlem iptal');
            return;
        }

        if (voiceConfig.SHOW_VOICE_EVENTS) {
            console.log('[VOICE EVENT] Kullanıcı rolleri:', member.roles.cache.map(r => r.name).join(', '));
            console.log('[VOICE EVENT] Aranan rol ID:', config.TARGET_ROLE_ID);
            console.log('[VOICE EVENT] Rol kontrolü:', member.roles.cache.has(config.TARGET_ROLE_ID) ? 'BAŞARILI' : 'BAŞARISIZ');
        }

        // Rol Kontrolü (Sadece kayıtsızlar için)
        if (member.roles.cache.has(config.TARGET_ROLE_ID)) {
            if (voiceConfig.SHOW_VOICE_EVENTS) console.log('[VOICE EVENT] Karşılama mesajı gönderiliyor...');
            // Sadece Hoş geldin sesli mesajı (Yetkili bildirimi kaldırıldı)
            await speakOrPlaySound(newState.channel, voiceMessages.welcome.userJoined(member.displayName), 'welcome', config);
        } else {
            if (voiceConfig.SHOW_VOICE_EVENTS) console.log('[VOICE EVENT] Kullanıcının kayıtsız rolü yok, karşılama mesajı gönderilmedi');
        }
    } else {
        if (voiceConfig.SHOW_VOICE_EVENTS) console.log('[VOICE EVENT] Kanal eşleşmedi. Beklenen:', config.VOICE_CHANNEL_ID, 'Gelen:', newState.channelId);
    }
}

module.exports = { handleVoiceStateUpdate, startStaffSearch };
