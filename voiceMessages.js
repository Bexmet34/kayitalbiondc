/**
 * SESLI MESAJLAR
 * 
 * Botun kullandığı tüm sesli mesajlar bu dosyada toplanmıştır.
 * Metinleri değiştirmek için bu dosyayı düzenleyin.
 */

module.exports = {
    // KARŞILAMA MESAJLARI
    welcome: {
        // Kullanıcı ses kanalına girdiğinde
        userJoined: (displayName) => `Merhaba ${displayName}, hoş geldin. Kayıt olmak için lütfen metin kanalındaki butona tıklayarak yetkili çağır.`,

        // Alternatif karşılama mesajları (rastgele seçilebilir)
        alternatives: [
            (displayName) => `Selam ${displayName}! Kayıt olmak için metin kanalındaki butona tıklaman yeterli.`,
            (displayName) => `Hoş geldin ${displayName}! Yetkili çağırmak için metin kanalındaki butona bas.`,
            (displayName) => `Merhaba ${displayName}! Kayıt için metin kanalından yetkili çağırabilirsin.`
        ]
    },

    // YETKİLİ BİLDİRİMLERİ
    staff: {
        // Yetkili ses kanalındayken
        notifyStaff: (displayName) => `Selamlar yetkili, ${displayName} kayıt kanalında bekliyor.`,

        // Kullanıcıya yetkili bulunduğunda
        staffFound: () => `Yetkililere sesli mesaj iletildi, birazdan burada olurlar. O sırada sen de “Müzik Dinle” butonuna basarak biraz rahatlayabilirsin.`,

        // Kullanıcıya yetkili bulunamadığında
        staffNotFound: () => `Şu an aktif sesli yetkili bulamadım ama tüm ekibe yazılı mesaj gönderdim. En kısa sürede gelecekler.`
    },

    // KAYIT İŞLEMLERİ
    registration: {
        // Kayıt başarılı
        success: (gameName, realName) => `Kayıt işlemi tamamlandı. Hoş geldin ${gameName}!`,

        // Kayıt başarısız
        failed: () => `Üzgünüm, kayıt işlemi sırasında bir sorun oluştu. Lütfen bir yetkiliyle iletişime geç.`
    },

    // GENEL MESAJLAR
    general: {
        // Bot bağlantı sorunu
        connectionError: () => `Ses bağlantısında bir sorun oluştu. Lütfen tekrar deneyin.`,

        // Bekletme mesajı
        pleaseWait: () => `Lütfen bekleyin, işleminiz gerçekleştiriliyor.`
    }
};
