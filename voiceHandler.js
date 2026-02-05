const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
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

// Bellek sızıntısı uyarısını engellemek için limitleri kaldırıyoruz
audioPlayer.setMaxListeners(0);
musicPlayer.setMaxListeners(0);

let currentConnection = null;

/**
 * MÜZİK ÇALMA FONKSİYONU
 */
async function playMusic(channel) {
    return new Promise((resolve) => {
        try {
            const connection = joinVoiceChannel({
                channelId: channel.id,
                guildId: channel.guild.id,
                adapterCreator: channel.guild.voiceAdapterCreator,
            });
            currentConnection = connection;

            const randomMusic = musicList[Math.floor(Math.random() * musicList.length)];
            const resource = createAudioResource(randomMusic, { inlineVolume: true });
            resource.volume.setVolume(0.3); // Müzik sesi biraz daha kısık olsun

            connection.subscribe(musicPlayer);
            musicPlayer.play(resource);

            resolve(true);
        } catch (error) {
            console.error('Music play error:', error);
            resolve(false);
        }
    });
}

/**
 * MÜZİK DURDURMA FONKSİYONU
 */
function stopMusic() {
    musicPlayer.stop();
    // Bağlantıyı hemen koparmayalım, belki TTS konuşur
}

/**
 * SESLİ OKUMA FONKSİYONU
 */
async function speak(channel, text, config) {
    // Müzik çalıyorsa sesini kıs veya durdur
    musicPlayer.pause();

    return new Promise((resolve) => {
        try {
            const connection = joinVoiceChannel({
                channelId: channel.id,
                guildId: channel.guild.id,
                adapterCreator: channel.guild.voiceAdapterCreator,
            });
            currentConnection = connection;

            const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=tr&client=tw-ob`;
            const resource = createAudioResource(ttsUrl, { inlineVolume: true });
            resource.volume.setVolume(config.VOLUME || voiceConfig.VOLUME);

            connection.subscribe(audioPlayer);
            audioPlayer.play(resource);

            audioPlayer.once(AudioPlayerStatus.Idle, () => {
                musicPlayer.unpause(); // TTS bitince müziğe devam et
                resolve();
            });

            audioPlayer.once('error', error => {
                console.error('Audio Player Error:', error);
                musicPlayer.unpause();
                resolve();
            });
        } catch (error) {
            console.error('Speak error:', error);
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
        // 1. Yetkili Bul
        const guild = channel.guild;
        const staffChannels = guild.channels.cache.filter(c => (c.type === 2 || c.type === 'GUILD_VOICE') && c.id !== channel.id);
        let activeStaffFound = false;

        for (const [id, sChannel] of staffChannels) {
            const staff = sChannel.members.find(m => !m.user.bot && m.roles.cache.has(config.STAFF_ROLE_ID));
            if (staff) {
                activeStaffFound = true;
                await speak(sChannel, `Selamlar yetkili, ${member.displayName} kayıt kanalında bekliyor.`, config);
            }
        }

        // 2. Bilgilendir
        if (activeStaffFound) {
            await speak(channel, `Yetkililere sesli mesaj iletildi, birazdan burada olacaklar.`, config);
        } else {
            // Yazılı Bildirim Gönder
            await sendStaffAlert(guild, member, config);
            await speak(channel, `Şu an aktif yetkili bulamadım ama tüm ekibe mesaj gönderdim. En kısa sürede gelecekler.`, config);
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

        // Rol Kontrolü
        if (member.roles.cache.has(config.TARGET_ROLE_ID)) {
            // Hoş geldin ve butona yönlendir
            await speak(newState.channel, `Merhaba ${member.displayName}, hoş geldin. Kayıt olmak için lütfen metin kanalındaki butona tıklayarak yetkili çağır.`, config);
        }
    }
}

module.exports = { handleVoiceStateUpdate, startStaffSearch, playMusic, stopMusic };
