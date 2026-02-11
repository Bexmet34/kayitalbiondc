require('dotenv').config();

module.exports = {
    // ============================================
    // KANAL VE ROL AYARLARI
    // ============================================
    VOICE_CHANNEL_ID: process.env.VOICE_CHANNEL_ID || 'YAPI_BEKLEYEN_SES_KANAL_ID',
    TARGET_ROLE_ID: process.env.TARGET_ROLE_ID || 'KAYITSIZ_ROL_ID',
    STAFF_ROLE_ID: process.env.STAFF_ROLE_ID || 'YETKILI_ROL_ID',
    REGISTERED_ROLE_ID: process.env.REGISTERED_ROLE_ID || 'KAYITLI_ROL_ID',
    STAFF_NOTIFICATION_CHANNEL_ID: process.env.STAFF_NOTIFICATION_CHANNEL_ID || 'YETKILI_METIN_KANAL_ID',
    WELCOME_TEXT_CHANNEL_ID: process.env.WELCOME_TEXT_CHANNEL_ID || 'KARSI_METIN_KANAL_ID',

    // ============================================
    // SİSTEM AYARLARI
    // ============================================
    ENABLED: true,              // Sesli karşılama sistemini aktif/pasif yap
    AUTO_LEAVE: true,           // Bot kanaldan otomatik ayrılsın mı?
    LEAVE_DELAY: 5000,          // Ayrılmadan önce bekleme süresi (ms)

    // ============================================
    // SES SEVİYESİ AYARLARI
    // ============================================
    TTS_VOLUME: 0.5,            // Sesli mesaj (TTS) ses seviyesi (0.0 - 1.0)

    // ============================================
    // TTS (SESLİ OKUMA) AYARLARI
    // ============================================
    TTS_PROVIDER: 'google',     // TTS sağlayıcı: 'google' (şu an sadece bu destekleniyor)
    TTS_LANGUAGE: 'tr',         // Dil kodu: 'tr' (Türkçe)
    TTS_SPEED: 1.0,             // Konuşma hızı (0.5 = yavaş, 1.0 = normal, 2.0 = hızlı)

    // ============================================
    // VIP KULLANICI AYARLARI
    // ============================================
    VIP_USER_ID: '407234961582587916',          // Özel ses çalacak kullanıcı ID
    VIP_SOUND_FILE: './sound/gungoricin.mp3',   // VIP kullanıcı için özel ses dosyası
    VIP_SOUND_VOLUME: 0.5,                      // VIP ses dosyası ses seviyesi

    // ============================================
    // SES DOSYALARI (TTS yerine MP3 kullanımı)
    // ============================================
    USE_SOUND_FILES: true,                              // MP3 dosyaları kullan (false = TTS kullan)
    SOUND_WELCOME: './sound/ilkkarsilama.mp3',          // İlk karşılama sesi
    SOUND_STAFF_FOUND: './sound/yetkilibulundu.mp3',    // Yetkili bulundu sesi
    SOUND_STAFF_NOT_FOUND: './sound/yetkilibulunamadi.mp3',  // Yetkili bulunamadı sesi
    SOUND_STAFF_NOTIFY: './sound/yetkiliseskanalinda.mp3',   // Yetkili ses kanalında bildirim
    SOUND_FILES_VOLUME: 0.5,                            // Ses dosyaları genel ses seviyesi

    // ============================================
    // DEBUG AYARLARI
    // ============================================
    DEBUG_LOGS: false,          // Detaylı log mesajları göster
    SHOW_VOICE_EVENTS: false,   // Ses kanalı olaylarını logla
    SHOW_TTS_LOGS: false        // TTS işlemlerini logla
};
