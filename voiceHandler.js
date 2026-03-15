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



/**
 * GENEL SES DOSYASI ÇALMA FONKSİYONU
 */
async function playSoundFile(channel, soundFilePath, config) {
    return new Promise(async (resolve) => {
        try {
            let connection = getVoiceConnection(channel.guild.id);

            // Aynı guild içinde başka kanala bağlıysa kapat
            if (connection && connection.joinConfig.channelId !== channel.id) {
                try {
                    connection.destroy();
                } catch (err) {}
                connection = null;
            }

            if (!connection) {
                connection = joinVoiceChannel({
                    channelId: channel.id,
                    guildId: channel.guild.id,
                    adapterCreator: channel.guild.voiceAdapterCreator,
                    selfDeaf: true,
                    selfMute: false
                });
                currentConnection = connection;
            }

            // Bağlantıyı bekle
            try {
                if (connection.state.status !== VoiceConnectionStatus.Ready) {
                    await entersState(connection, VoiceConnectionStatus.Ready, 20000);
                }
            } catch (e) {
                console.error('[SOUND FILE] Bağlantı hatası:', e.message);
                try { connection.destroy(); } catch(err) {}
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
                connection = joinVoiceChannel({
                    channelId: channel.id,
                    guildId: channel.guild.id,
                    adapterCreator: channel.guild.voiceAdapterCreator,
                    selfDeaf: true,
                    selfMute: false
                });
                currentConnection = connection;

                // Listener'ı sadece yeni bağlantıda ekle
                connection.on('stateChange', (oldState, newState) => {
                    if (voiceConfig.SHOW_TTS_LOGS) {
                        console.log(`[TTS CONNECTION] ${oldState.status} -> ${newState.status}`);
                    }
                });
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
