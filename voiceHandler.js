const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, StreamType } = require('@discordjs/voice');
const voiceConfig = require('./voiceConfig');
const db = require('./db');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// Durum Yönetimi
let userQueue = [];
let isProcessing = false;
// Müzik Listesi (Örnek URLler veya Yerel Dosyalar)
const musicList = [
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3'
];

let audioPlayer = createAudioPlayer();
let musicPlayer = createAudioPlayer();

// DEBUG İÇİN DURUM TAKİBİ
audioPlayer.on('stateChange', (oldState, newState) => {
    console.log(`[TTS] ${oldState.status} -> ${newState.status}`);
});
musicPlayer.on('stateChange', (oldState, newState) => {
    console.log(`[MUSIC] ${oldState.status} -> ${newState.status}`);
});
audioPlayer.on('error', error => console.error('[TTS ERROR]', error));
musicPlayer.on('error', error => console.error('[MUSIC ERROR]', error));

// Bellek sızıntısı uyarısını engellemek için limitleri kaldırıyoruz
audioPlayer.setMaxListeners(0);
musicPlayer.setMaxListeners(0);

let currentConnection = null;

/**
 * MÜZİK ÇALMA FONKSİYONU
 */
async function playMusic(channel) {
    return new Promise(async (resolve) => {
        try {
            console.log(`[VOICE] Kanala giriliyor: ${channel.name}`);

            const connection = joinVoiceChannel({
                channelId: channel.id,
                guildId: channel.guild.id,
                adapterCreator: channel.guild.voiceAdapterCreator,
                selfDeaf: false,
                selfMute: false
            });
            currentConnection = connection;

            // BAĞLANTIYI BEKLE (VPS İÇİN KRİTİK)
            try {
                await require('@discordjs/voice').entersState(connection, require('@discordjs/voice').VoiceConnectionStatus.Ready, 10000);
                console.log('[VOICE] Bağlantı Hazır (Ready)!');
            } catch (e) {
                console.error('[VOICE] Bağlantı zamanaşımına uğradı!');
                return resolve(false);
            }

            const randomMusic = musicList[Math.floor(Math.random() * musicList.length)];
            const resource = createAudioResource(randomMusic, {
                inputType: StreamType.Arbitrary,
                inlineVolume: true
            });

            if (resource.volume) resource.volume.setVolume(0.35);

            connection.subscribe(musicPlayer);
            musicPlayer.play(resource);

            console.log(`[VOICE] Oynatılıyor: ${randomMusic}`);
            resolve(true);
        } catch (error) {
            console.error('[VOICE ERROR] playMusic:', error);
            resolve(false);
        }
    });
}

/**
 * MÜZİK DURDURMA FONKSİYONU
 */
function stopMusic() {
    musicPlayer.stop();
}

/**
 * SESLİ OKUMA FONKSİYONU
 */
async function speak(channel, text, config) {
    musicPlayer.pause();
    console.log(`[TTS] Okunuyor: ${text}`);

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

            // BAĞLANTIYI BEKLE
            try {
                await require('@discordjs/voice').entersState(connection, require('@discordjs/voice').VoiceConnectionStatus.Ready, 10000);
            } catch (e) {
                console.error('[TTS] Bağlantı Hatası');
                return resolve();
            }

            const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=tr&client=tw-ob`;
            const resource = createAudioResource(ttsUrl, {
                inputType: StreamType.Arbitrary,
                inlineVolume: true
            });

            if (resource.volume) resource.volume.setVolume(config.VOLUME || voiceConfig.VOLUME || 1.0);

            connection.subscribe(audioPlayer);
            audioPlayer.play(resource);

            audioPlayer.once(AudioPlayerStatus.Idle, () => {
                console.log('[TTS] Bitti.');
                setTimeout(() => {
                    if (currentConnection) currentConnection.subscribe(musicPlayer);
                    musicPlayer.unpause();
                    resolve();
                }, 1000);
            });

            audioPlayer.once('error', error => {
                console.error('[TTS ERROR]', error);
                musicPlayer.unpause();
                resolve();
            });
        } catch (error) {
            console.error('[TTS FATAL ERROR]', error);
            musicPlayer.unpause();
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

        // Önce her zaman yazılı bildirim gönderiyoruz (Kullanıcı mesaj gelmiyor dediği için)
        await sendStaffAlert(guild, member, config);

        // Sonra sesli bildirim için yetkilileri ara
        const staffChannels = guild.channels.cache.filter(c => (c.type === 2 || c.type === 'GUILD_VOICE') && c.id !== channel.id);
        let activeStaffFound = false;

        for (const [id, sChannel] of staffChannels) {
            const staff = sChannel.members.find(m => !m.user.bot && m.roles.cache.has(config.STAFF_ROLE_ID));
            if (staff) {
                activeStaffFound = true;
                await speak(sChannel, `Selamlar yetkili, ${member.displayName} kayıt kanalında bekliyor.`, config);
            }
        }

        // Kullanıcıya bilgi ver
        if (activeStaffFound) {
            await speak(channel, `Yetkililere sesli mesaj iletildi, birazdan burada olacaklar.`, config);
        } else {
            await speak(channel, `Şu an aktif sesli yetkili bulamadım ama tüm ekibe yazılı mesaj gönderdim. En kısa sürede gelecekler.`, config);
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

    if (!config || !config.ENABLED || config.VOICE_CHANNEL_ID === 'YAPI_BEKLEYEN_SES_KANAL_ID') return;

    // Kanal Giriş Kontrolü
    if (newState.channelId === config.VOICE_CHANNEL_ID && oldState.channelId !== newState.channelId) {
        const member = newState.member;
        if (!member || member.user.bot) return;

        // Rol Kontrolü (Sadece kayıtsızlar için)
        if (member.roles.cache.has(config.TARGET_ROLE_ID)) {
            // Sadece Hoş geldin sesli mesajı (Yetkili bildirimi kaldırıldı)
            await speak(newState.channel, `Merhaba ${member.displayName}, hoş geldin. Kayıt olmak için lütfen metin kanalındaki butona tıklayarak yetkili çağır.`, config);
        }
    }
}

module.exports = { handleVoiceStateUpdate, startStaffSearch, playMusic, stopMusic };
