# 🎙️ Ses Ayarları Rehberi

Botun tüm ses ayarları **`voiceConfig.js`** dosyasında toplanmıştır.

## 📁 Dosya Konumu
```
kayitalbiondc/voiceConfig.js
```

## ⚙️ Ayarlanabilir Özellikler

### 🔊 Ses Seviyeleri
```javascript
TTS_VOLUME: 0.5,        // Sesli mesaj ses seviyesi (0.0 - 1.0)
MUSIC_VOLUME: 0.5,      // Müzik ses seviyesi (0.0 - 1.0)
```
- **0.0** = Sessiz
- **0.5** = Orta seviye (önerilen)
- **1.0** = Maksimum ses

---

### 🎵 Müzik Ayarları
```javascript
MUSIC_ENABLED: true,    // Müzik özelliğini aç/kapat
RANDOM_MUSIC: true,     // Rastgele müzik seçimi
MUSIC_LIST: [           // Çalınacak müzikler
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3'
]
```

**Müzik Ekleme:**
1. `MUSIC_LIST` dizisine yeni URL veya dosya yolu ekleyin
2. Yerel dosya kullanmak için: `'./music/song.mp3'`

---

### 🗣️ TTS (Sesli Okuma) Ayarları
```javascript
TTS_PROVIDER: 'google', // TTS sağlayıcı
TTS_LANGUAGE: 'tr',     // Dil kodu
TTS_SPEED: 1.0,         // Konuşma hızı
```

**Konuşma Hızı:**
- **0.5** = Yavaş
- **1.0** = Normal (önerilen)
- **2.0** = Hızlı

---

### 🔧 Sistem Ayarları
```javascript
ENABLED: true,          // Sesli karşılama sistemini aç/kapat
AUTO_LEAVE: true,       // Bot otomatik ayrılsın mı?
LEAVE_DELAY: 5000,      // Ayrılma gecikmesi (milisaniye)
```

---

### 🐛 Debug (Hata Ayıklama) Ayarları
```javascript
DEBUG_LOGS: true,           // Genel debug logları
SHOW_VOICE_EVENTS: true,    // Ses kanalı olayları
SHOW_TTS_LOGS: true,        // TTS işlemleri
SHOW_MUSIC_LOGS: true       // Müzik işlemleri
```

**Logları Kapatmak İçin:**
- Gereksiz console mesajlarını görmek istemiyorsanız `false` yapın
- Performans için tüm logları kapatabilirsiniz

---

## 💬 Sesli Mesajlar

Tüm sesli mesajlar **`voiceMessages.js`** dosyasında toplanmıştır.

### 📁 Dosya Konumu
```
kayitalbiondc/voiceMessages.js
```

### ✏️ Mesaj Değiştirme
```javascript
welcome: {
    userJoined: (displayName) => `Merhaba ${displayName}, hoş geldin...`
}
```

**Örnek Değişiklik:**
```javascript
// Eski:
userJoined: (displayName) => `Merhaba ${displayName}, hoş geldin.`

// Yeni:
userJoined: (displayName) => `Selam ${displayName}! Aramıza hoş geldin!`
```

---

## 🚀 Değişiklikleri Uygulama

1. `voiceConfig.js` veya `voiceMessages.js` dosyasını düzenleyin
2. Dosyayı kaydedin
3. Botu yeniden başlatın:
   ```bash
   npm start
   ```

---

## 📝 Örnekler

### Örnek 1: Ses Seviyesini Düşürme
```javascript
TTS_VOLUME: 0.3,        // Daha sessiz
MUSIC_VOLUME: 0.2,      // Müzik daha sessiz
```

### Örnek 2: Müziği Kapatma
```javascript
MUSIC_ENABLED: false,   // Müzik tamamen kapalı
```

### Örnek 3: Logları Kapatma
```javascript
DEBUG_LOGS: false,
SHOW_VOICE_EVENTS: false,
SHOW_TTS_LOGS: false,
SHOW_MUSIC_LOGS: false
```

### Örnek 4: Konuşma Hızını Artırma
```javascript
TTS_SPEED: 1.5,         // %50 daha hızlı konuşma
```

---

## ⚠️ Önemli Notlar

- Ses seviyesi değerleri **0.0 - 1.0** arasında olmalıdır
- Konuşma hızı **0.5 - 2.0** arasında olmalıdır
- Müzik URL'leri geçerli MP3 dosyaları olmalıdır
- Değişikliklerden sonra mutlaka botu yeniden başlatın

---

## 🆘 Sorun Giderme

**Ses gelmiyor?**
- `ENABLED: true` olduğundan emin olun
- Ses seviyelerini kontrol edin (0.0 olmamalı)
- Debug loglarını açın ve hataları kontrol edin

**Müzik çalmıyor?**
- `MUSIC_ENABLED: true` olduğundan emin olun
- `MUSIC_LIST` içindeki URL'lerin geçerli olduğunu kontrol edin

**Loglar çok fazla?**
- İstemediğiniz log türlerini `false` yapın
- Sadece hata ayıklarken açın

---

## 📞 Destek

Sorun yaşarsanız:
1. Debug loglarını açın
2. Console çıktısını kontrol edin
3. Hata mesajlarını kaydedin
