# 🔧 Sorun Giderme Rehberi

## 🔴 Sorun: Bot ses kanalına giriyor ama ses çalmıyor

### Belirtiler
- Bot ses kanalına katılıyor fakat hiçbir MP3 çalmıyor
- Loglarda şu döngü görünüyor:
```
[SOUND DEBUG] State değişimi: signalling -> connecting
[SOUND DEBUG] State değişimi: connecting -> connecting
[SOUND DEBUG] State değişimi: connecting -> signalling
[SOUND FILE] ❌ Hata: Bağlantı zaman aşımı
```

### Kök Neden
`@discordjs/voice` kütüphanesinin `0.17.x` ve `0.18.x` stabil sürümlerinde **bilinen bir UDP bug**'ı vardır.

Discord, 2024 yılı sonunda ses bağlantısı için **DAVE (Discord Audio/Video Encryption)** adlı yeni bir protokole geçti. Eski stabil sürümler bu protokolü tam olarak desteklemiyor.

Sorunun teknik detayı:
- Bot ses kanalına katıldığında Discord, `VOICE_SERVER_UPDATE` gönderir → `signalling`
- Kütüphane UDP bağlantısı kurmaya çalışır → `connecting`
- UDP handshake'i DAVE protokolü nedeniyle tamamlanamaz
- Discord yeni bir `VOICE_SERVER_UPDATE` gönderir → tekrar `signalling`
- Bu döngü sonsuz kez tekrarlanır

### ✅ Çözüm

**`@discordjs/voice` kütüphanesini `1.0.0-dev` sürümüne yükseltmek:**

```bash
npm install @discordjs/voice@1.0.0-dev.1788696123-5f6cbf111
```

Bu dev sürümü DAVE protokolünü tam olarak destekliyor ve `connecting -> signalling` döngüsünü çözüyor.

> ⚠️ **Önemli:** Eğer ileride `npm install` yaptıktan sonra `package.json`'daki versiyon eski haline dönerse, yukarıdaki komutu tekrar çalıştırın.

### Gerekli Kütüphaneler

Ses sistemi için şu kütüphanelerin kurulu olması gerekir:

```bash
npm install @noble/ciphers@1.2.1
npm install @stablelib/xchacha20poly1305
npm install tweetnacl
```

> `sodium-native` **kurulu olmamalı** — 5.x sürümü `@discordjs/voice` ile uyumsuz.
> Şüpheleniyorsanız kaldırın: `npm uninstall sodium-native`

### Kontrol Listesi

Bot sesli çalışmıyorsa sırayla kontrol edin:

1. `node index.js` çalıştırın, loglarda `[DEBUG] Ses kütüphanesi raporu` bölümüne bakın:
   - `@noble/ciphers` → ✅ bulunmalı
   - `libsodium-wrappers` → ✅ bulunmalı
   - `sodium-native` → ❌ **bulunmamalı**
   - `@discordjs/voice` → `1.0.0-dev.xxx` olmalı

2. Loglarda `[SOUND] ✅ Çalınıyor:` mesajı varsa ses dosyası başarıyla çalınıyor demektir.

3. Hâlâ `connecting -> signalling` döngüsü görünüyorsa daha yeni bir dev sürümü deneyin:
   ```bash
   npm show @discordjs/voice versions --json | tail -5
   npm install @discordjs/voice@<en_son_dev_versiyonu>
   ```

---

## 🟡 Sorun: "Used disallowed intents" hatası

### Belirtiler
```
[PROCESS ERROR] Unhandled Rejection: Error: Used disallowed intents
```

### Çözüm
[Discord Developer Portal](https://discord.com/developers/applications) → Bot → **Privileged Gateway Intents** altında şunları açın:
- ✅ **Server Members Intent**
- ✅ **Message Content Intent**

---

## 🟡 Sorun: "Lütfen .env dosyasına CLIENT_ID ekleyin"

### Çözüm
`.env` dosyasına botun uygulama ID'sini ekleyin:
```env
CLIENT_ID=BotunuzunApplicationIDsi
```
Discord Developer Portal → **General Information** → **Application ID**

---

## 📋 Güncel Çalışan Konfigürasyon (Eylül 2026)

| Kütüphane | Versiyon |
|---|---|
| `@discordjs/voice` | `1.0.0-dev.1788696123-5f6cbf111` |
| `discord.js` | `^14.25.1` |
| `libsodium-wrappers` | `0.8.2` |
| `@noble/ciphers` | `1.2.1` |
| `@stablelib/xchacha20poly1305` | `2.0.1` |
| `ffmpeg-static` | `^5.3.0` |
| `opusscript` | `^0.0.8` |
