const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, StreamType, getVoiceConnection, VoiceConnectionStatus, entersState } = require('@discordjs/voice');
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

// @discordjs/voice 0.18.0 UDP keepAlive bug fix
// signalling->connecting->signalling döngüsünü çözer
function applyVoiceConnectionFix(connection) {
    connection.on('stateChange', (oldState, newState) => {
        const oldNetworking = Reflect.get(oldState, 'networking');
        const newNetworking = Reflect.get(newState, 'networking');

        const networkStateChangeHandler = (oldNetworkState, newNetworkState) => {
            const newUdp = Reflect.get(newNetworkState, 'udp');
            clearInterval(newUdp?.keepAliveInterval);
        };

        oldNetworking?.off('stateChange', networkStateChangeHandler);
        newNetworking?.on('stateChange', networkStateChangeHandler);
    });
    return connection;
}




// Global ses kuyruğu - eş zamanlı çalma sorununu önler
let audioQueue = [];
let isPlayingAudio = false;

async function playSoundFile(channel, soundFilePath, config) {
    return new Promise((resolve) => {
        audioQueue.push({ channel, soundFilePath, config, resolve });
        if (!isPlayingAudio) {
            processAudioQueue();
        }
    });
}

async function processAudioQueue() {
    if (audioQueue.length === 0) {
        isPlayingAudio = false;
        return;
    }

    isPlayingAudio = true;
    const { channel, soundFilePath, config, resolve } = audioQueue.shift();

    try {
        // Mevcut bağlantıyı al, farklı kanaldaysa yok et
        let connection = getVoiceConnection(channel.guild.id);
        if (connection && connection.joinConfig.channelId !== channel.id) {
            try { connection.destroy(); } catch (e) {}
            connection = null;
            await new Promise(r => setTimeout(r, 500));
        }

        // Yeni bağlantı kur
        if (!connection || connection.state.status === VoiceConnectionStatus.Destroyed) {
            connection = applyVoiceConnectionFix(joinVoiceChannel({
                channelId: channel.id,
                guildId: channel.guild.id,
                adapterCreator: channel.guild.voiceAdapterCreator,
                selfDeaf: true,
                selfMute: false,
            }));
            currentConnection = connection;
        }

        // Ready state'ini event ile bekle (entersState yerine)
        if (connection.state.status !== VoiceConnectionStatus.Ready) {
            console.log(`[SOUND DEBUG] Bağlantı bekleniyor, mevcut durum: ${connection.state.status}`);
            await new Promise((res, rej) => {
                const timeout = setTimeout(() => {
                    console.log(`[SOUND DEBUG] Zaman aşımı! Son durum: ${connection.state.status}`);
                    rej(new Error('Bağlantı zaman aşımı'));
                }, 15000);

                const onStateChange = (oldState, newState) => {
                    console.log(`[SOUND DEBUG] State değişimi: ${oldState.status} -> ${newState.status}`);
                    if (newState.status === VoiceConnectionStatus.Ready) {
                        clearTimeout(timeout);
                        connection.off('stateChange', onStateChange);
                        res();
                    } else if (newState.status === VoiceConnectionStatus.Destroyed) {
                        clearTimeout(timeout);
                        connection.off('stateChange', onStateChange);
                        rej(new Error('Bağlantı yok edildi'));
                    }
                };
                connection.on('stateChange', onStateChange);
            });
        } else {
            console.log(`[SOUND DEBUG] Bağlantı zaten Ready!`);
        }

        // Ses dosyasını çal
        const resource = createAudioResource(soundFilePath, {
            inputType: StreamType.Arbitrary,
            inlineVolume: true,
        });

        const volume = (config && config.SOUND_FILES_VOLUME) || voiceConfig.SOUND_FILES_VOLUME || 0.8;
        if (resource.volume) resource.volume.setVolume(volume);

        connection.subscribe(audioPlayer);
        audioPlayer.play(resource);

        console.log(`[SOUND] ✅ Çalınıyor: ${soundFilePath}`);

        // Bitişini bekle
        await new Promise((res) => {
            audioPlayer.once(AudioPlayerStatus.Idle, res);
            audioPlayer.once('error', (err) => {
                console.error('[SOUND ERROR]', err.message);
                res();
            });
        });

        resolve(true);
    } catch (err) {
        console.error(`[SOUND FILE] ❌ Hata: ${err.message}`);
        resolve(false);
    }

    // Kısa bekleme sonrası kuyruğu işle
    setTimeout(() => processAudioQueue(), 300);
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
    }

    return new Promise(async (resolve) => {
        try {
            let connection = getVoiceConnection(channel.guild.id);

            // Aynı guild içinde başka kanala bağlıysa kapat
            if (connection && connection.joinConfig.channelId !== channel.id) {
                if (voiceConfig.SHOW_TTS_LOGS) {
                    console.log(`[TTS] Farklı kanaldaki bağlantı kapatılıyor (${connection.joinConfig.channelId} -> ${channel.id})`);
                }
                try {
                    connection.destroy();
                } catch (err) {}
                connection = null;
            }

            // Bağlantı yoksa yeni oluştur
            if (!connection) {
                if (voiceConfig.SHOW_TTS_LOGS) console.log('[TTS] Yeni bağlantı oluşturuluyor...');
                connection = applyVoiceConnectionFix(joinVoiceChannel({
                    channelId: channel.id,
                    guildId: channel.guild.id,
                    adapterCreator: channel.guild.voiceAdapterCreator,
                    selfDeaf: true,
                    selfMute: false
                }));
                currentConnection = connection;
            }

            // Ready değilse biraz bekle
            try {
                if (connection.state.status !== VoiceConnectionStatus.Ready) {
                    await entersState(connection, VoiceConnectionStatus.Ready, 20000);
                    if (voiceConfig.SHOW_TTS_LOGS) console.log('[TTS] ✅ Bağlantı Ready!');
                }
            } catch (e) {
                console.error(`[TTS] ❌ Bağlantı Kurulamadı - Durum: ${connection.state.status} - Hata: ${e.message}`);
                try {
                    connection.destroy();
                } catch (err) {}
                currentConnection = null;
                return resolve();
            }

            const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=tr&client=tw-ob`;
            const resource = createAudioResource(ttsUrl, {
                inputType: StreamType.Arbitrary,
                inlineVolume: true
            });

            const volume = config.TTS_VOLUME || voiceConfig.TTS_VOLUME || 0.5;
            if (resource.volume) {
                resource.volume.setVolume(volume);
            }

            connection.subscribe(audioPlayer);
            audioPlayer.play(resource);

            const onIdle = () => {
                cleanup();
                setTimeout(resolve, 1000);
            };

            const onError = (error) => {
                console.error('[TTS ERROR] Oynatma hatası:', error);
                cleanup();
                resolve();
            };

            const cleanup = () => {
                audioPlayer.removeListener(AudioPlayerStatus.Idle, onIdle);
                audioPlayer.removeListener('error', onError);
            };

            audioPlayer.once(AudioPlayerStatus.Idle, onIdle);
            audioPlayer.once('error', onError);

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

        let staffFoundAtAll = false;

        // 1. DİĞER KANALLARDAKİ YETKİLİLERE HABER VER
        const allChannels = guild.channels.cache.filter(c => (c.type === 2 || c.type === 'GUILD_VOICE') && c.id !== channel.id);

        for (const [id, sChannel] of allChannels) {
            const staff = sChannel.members.find(m => !m.user.bot && m.roles.cache.has(config.STAFF_ROLE_ID));
            if (staff) {
                staffFoundAtAll = true;
                // Diğer yetkililerin kanalında standart bildirim çal
                let customText = config.TTS_STAFF_NOTIFY;
                if (!customText) customText = voiceMessages.staff.notifyStaff(member.displayName);
                else customText = customText.replace(/{kullanici}/g, member.displayName);

                await speakOrPlaySound(sChannel, customText, 'staff_notify', config);
            }
        }

        // 2. KULLANICIYA SONUCU BİLDİR (KAYIT KANALINDA)
        if (staffFoundAtAll) {
            // Herhangi bir yetkili bulunduysa kullanıcıya "Yetkili Bulundu" sesi çal (yetkilibulundu.mp3)
            let customText = config.TTS_STAFF_FOUND;
            if (!customText) customText = voiceMessages.staff.staffFound();
            else customText = customText.replace(/{kullanici}/g, member.displayName);

            await speakOrPlaySound(channel, customText, 'staff_found', config);
        } else {
            // Hiç kimse bulunamadıysa "Yetkili Bulunamadı" sesi çal (yetkilibulunamadi.mp3)
            let customText = config.TTS_STAFF_NOT_FOUND;
            if (!customText) customText = voiceMessages.staff.staffNotFound();
            else customText = customText.replace(/{kullanici}/g, member.displayName);

            await speakOrPlaySound(channel, customText, 'staff_not_found', config);
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
    if (newState.member?.user?.bot) return;

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
    const isTargetChannel = newState.channelId === config.VOICE_CHANNEL_ID;
    const isChannelChange = oldState.channelId !== newState.channelId;

    if (isTargetChannel && isChannelChange) {
        const member = newState.member;
        if (voiceConfig.SHOW_VOICE_EVENTS) console.log('[VOICE EVENT] Kullanıcı kayıt kanalına girdi:', member?.user?.tag);

        if (!member || member.user.bot) return;

        // Rol Kontrolü (Sadece kayıtsızlar için)
        if (member.roles.cache.has(config.TARGET_ROLE_ID)) {
            if (voiceConfig.SHOW_VOICE_EVENTS) console.log('[VOICE EVENT] Karşılama mesajı gönderiliyor...');
            
            let customText = config.TTS_WELCOME;
            if (!customText) customText = voiceMessages.welcome.userJoined(member.displayName);
            else customText = customText.replace(/{kullanici}/g, member.displayName);

            // Sadece Hoş geldin sesli mesajı
            await speakOrPlaySound(newState.channel, customText, 'welcome', config);
        }
    } else if (isTargetChannel && !isChannelChange) {
        // Kullanıcı zaten kanaldaydı (mute/unmute yaptı), bir şey yapmaya gerek yok
        return;
    } else {
        if (voiceConfig.SHOW_VOICE_EVENTS && newState.channelId) {
            console.log('[VOICE EVENT] Kanal uygun değil. Gelen:', newState.channelId, 'Beklenen:', config.VOICE_CHANNEL_ID);
        }
    }
}

module.exports = { handleVoiceStateUpdate, startStaffSearch };
