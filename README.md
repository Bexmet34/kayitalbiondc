# Gelişmiş Sesli Kayıt Botu

Bu bot, Albion Online sunucuları için tasarlanmış, sesli karşılama, yetkili bildirim ve otomatik kayıt sistemine sahip gelişmiş bir Discord botudur.

## 🚀 VPS (Uzak Sunucu) Kurulum Rehberi

Projeyi VPS'e taşıdığınızda sorunsuz çalışması için aşağıdaki adımları takip edin:

### 1. Sistem Gereksinimleri (Linux/Ubuntu)
Ses özelliklerinin çalışması için sunucunuzda **FFmpeg** yüklü olmalıdır:
```bash
sudo apt update
sudo apt install ffmpeg -y
```

### 2. Dosyaları Hazırlama
Projeyi GitHub'dan çektikten sonra:
1. `.env.example` dosyasının adını `.env` olarak değiştirin.
2. İçindeki `DISCORD_TOKEN`, `WHITELIST_USERS` ve `GUILD_ID` alanlarını doldurun.

### 3. Bağımlılıkları Yükleme
```bash
npm install
```

### 4. Botu 7/24 Aktif Tutma (PM2 Kullanımı)
Botun siz terminali kapatsanız bile çalışmaya devam etmesi için **PM2** kullanmanız önerilir:

```bash
# PM2 Yükle
sudo npm install pm2 -g

# Botu Başlat
pm2 start index.js --name "albion-kayit-botu"

# Botun durumunu kontrol et
pm2 status

# Botu durdurmak isterseniz
pm2 stop albion-kayit-botu
```

## ⚠️ GitHub'a Atarken Dikkat Edilmesi Gerekenler
1. **ASLA `.env` dosyasını GitHub'a yüklemeyin!** (Bot tokeniniz çalınabilir). Sizin için hazırladığım `.gitignore` dosyası bunu otomatik olarak engelleyecektir.
2. `node_modules` klasörünü atmayın (çok büyüktür), sunucuda `npm install` yaparak tekrar yükleyin.
3. `database.json` ve `cooldowns.json` dosyaları yerel veriler içerdiği için GitHub'a gitmeyecektir. Sunucuda botu ilk çalıştırdığınızda otomatik olarak temiz bir şekilde oluşturulacaktır.

## 🛠️ Komutlar
- `/kurulum`: Sistemi yapılandırır.
- `/buton-gonder`: Kayıt butonunu kanala gönderir.
- `/herkese-rol-ver`: Whitelist kişilerin toplu rol vermesini sağlar (Sadece rolü olmayanlara).
- `/id-bul`: Gerekli ID'leri listeler.
