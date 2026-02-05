# 🎙️ Gelişmiş Sesli Kayıt ve Yetkili Bildirim Sistemi (PROMPT)

Bu dosya, Discord botuna eklenecek gelişmiş bir sesli bildirim ve kayıt karşılama sisteminin tam mantığını, kod yapısını ve iyileştirmelerini içerir. Bu sistemi başka bir bota entegre etmek için aşağıdaki adımları ve kodları kullanabiliriz.

---

## 🚀 Sistem Özellikleri
1.  **Sıralama Algoritması (Queue):** Aynı anda gelen birden fazla kullanıcıyı sırayla işler, seslerin birbirine girmesini engeller.
2.  **Akıllı Yetkili Arama:** Sunucudaki tüm ses kanallarını tarar ve yetkililere (Staff Role) tek tek ulaşır.
3.  **Yazılı Yedek Bildirim:** Sesli kanalarda yetkili yoksa otomatik olarak metin kanalına butonlu bir bildirim gönderir.
4.  **Google TTS Entegrasyonu:** Kullanıcıları ve yetkilileri doğal bir sesle karşılar.
5.  **Durum Kilidi (State Lock):** Botun aynı anda farklı kanallarda işlem yapıp hata vermesini önler.

---

## 🛠️ Kurulum Gereksinimleri
Aşağıdaki paketlerin yüklü olması gerekir:
```bash
npm install @discordjs/voice discord.js libsodium-wrappers ffmpeg-static
```

---

## 📄 1. Konfigürasyon Yapısı (`voiceConfig.js`)
```javascript
module.exports = {
    VOICE_CHANNEL_ID: 'YAPI_BEKLEYEN_SES_KANAL_ID', 
    TARGET_ROLE_ID: 'KAYITSIZ_ROL_ID',   
    STAFF_ROLE_ID: 'YETKILI_ROL_ID',  
    STAFF_NOTIFICATION_CHANNEL_ID: 'YETKILI_METIN_KANAL_ID', 
    ENABLED: true,
    VOLUME: 0.8,
    AUTO_LEAVE: true,
    LEAVE_DELAY: 5000 // Kanaldan ayrılma gecikmesi (ms)
};
```

---

## 🧠 2. Ana Mantık ve Kod (`voiceHandler.js`)

```javascript
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const voiceConfig = require('./voiceConfig');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// Durum Yönetimi
let userQueue = [];
let isProcessing = false;
let audioPlayer = createAudioPlayer();

/**
 * SESLİ OKUMA FONKSİYONU
 */
async function speak(channel, text) {
    return new Promise((resolve) => {
        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator,
        });

        const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=tr&client=tw-ob`;
        const resource = createAudioResource(ttsUrl, { inlineVolume: true });
        resource.volume.setVolume(voiceConfig.VOLUME);

        connection.subscribe(audioPlayer);
        audioPlayer.play(resource);

        audioPlayer.once(AudioPlayerStatus.Idle, () => {
            // İsteğe bağlı: connection.destroy() hemen yapılmaz, kuyruk biterse yapılır
            resolve();
        });
    });
}

/**
 * SIRALAMA YÖNETİCİSİ
 */
async function processQueue() {
    if (isProcessing || userQueue.length === 0) return;
    isProcessing = true;

    const { member, channel } = userQueue.shift();

    try {
        // 1. Kullanıcıyı Karşıla
        await speak(channel, `Merhaba ${member.displayName}, hoş geldin. Yetkililere haber veriyorum, lütfen bekle.`);

        // 2. Yetkili Bul
        const guild = channel.guild;
        const staffChannels = guild.channels.cache.filter(c => c.type === 2 && c.id !== channel.id);
        let activeStaffFound = false;

        for (const [id, sChannel] of staffChannels) {
            const staff = sChannel.members.find(m => !m.user.bot && m.roles.cache.has(voiceConfig.STAFF_ROLE_ID));
            if (staff) {
                activeStaffFound = true;
                await speak(sChannel, `Selamlar yetkili, ${member.displayName} kayıt kanalında bekliyor.`);
            }
        }

        // 3. Bilgilendir
        if (activeStaffFound) {
            await speak(channel, `Yetkililere sesli mesaj iletildi, birazdan burada olacaklar.`);
        } else {
            // Yazılı Bildirim Gönder
            await sendStaffAlert(guild, member);
            await speak(channel, `Şu an aktif yetkili bulamadım ama tüm ekibe mesaj gönderdim. En kısa sürede gelecekler.`);
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
async function sendStaffAlert(guild, applicant) {
    const notifyChannel = await guild.channels.fetch(voiceConfig.STAFF_NOTIFICATION_CHANNEL_ID);
    if (!notifyChannel) return;

    const embed = new EmbedBuilder()
        .setTitle('🚨 Kayıt Bekleyen Kullanıcı')
        .setColor('Red')
        .setDescription(`${applicant} şu an kayıt ses kanalında bekliyor!`)
        .setTimestamp();

    await notifyChannel.send({ content: `<@&${voiceConfig.STAFF_ROLE_ID}>`, embeds: [embed] });
}

/**
 * EVENT HANDLER (index.js içine)
 */
async function handleVoiceStateUpdate(oldState, newState) {
    if (!voiceConfig.ENABLED) return;

    // Kanal Giriş Kontrolü
    if (newState.channelId === voiceConfig.VOICE_CHANNEL_ID && oldState.channelId !== newState.channelId) {
        const member = newState.member;
        if (!member || member.user.bot) return;

        // Rol Kontrolü
        if (member.roles.cache.has(voiceConfig.TARGET_ROLE_ID)) {
            userQueue.push({ member, channel: newState.channel });
            processQueue();
        }
    }
}

module.exports = { handleVoiceStateUpdate };
```

---

## 📝 3. Prompt Olarak Kullanım (Yeni Bot İçin)
Bu `.md` dosyasını yeni bir bota aktarırken şu komutu verebilirsin:

> "Sana verdiğim bu dokümandaki sesli kayıt sistemini projemize ekle. `@discordjs/voice` ve Google TTS kullanarak kullanıcıları sırayla karşılayan, yetkili odalarını tek tek gezip haber veren ve yetkili yoksa mesaj atan gelişmiş bir `voiceHandler` oluştur. Kuyruk (queue) sistemini mutlaka kullan ki sesler birbirine girmesin."

---
