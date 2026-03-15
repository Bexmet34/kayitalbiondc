require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
    new SlashCommandBuilder()
        .setName('kurulum')
        .setDescription('Sesli kayıt sistemini kurar.')
        .addChannelOption(option => option.setName('ses_kanali').setDescription('Kayıt beklenen ses kanalı').setRequired(true))
        .addRoleOption(option => option.setName('kayitsiz_rol').setDescription('Kayıtsız kullanıcı rolü (Yeni Gelenler)').setRequired(true))
        .addRoleOption(option => option.setName('kayitli_rol').setDescription('Kayıtlı kullanıcı rolü (Kayıt Bitenler)').setRequired(true))
        .addRoleOption(option => option.setName('kayit_sorumlusu_rolu').setDescription('Kayıt yetkisine sahip yetkili rolü').setRequired(true))
        .addChannelOption(option => option.setName('yetkili_bildirim_kanali').setDescription('Yetkililere bildirim gidecek metin kanalı').setRequired(true))
        .addChannelOption(option => option.setName('karsilama_kanali').setDescription('Butonun bulunacağı karşılama metin kanalı').setRequired(true)),

    new SlashCommandBuilder()
        .setName('buton-gonder')
        .setDescription('Kayıt butonunu belirtilen kanala gönderir.'),

    new SlashCommandBuilder()
        .setName('herkese-rol-ver')
        .setDescription('Rolü olmayan herkese kayıtsız rolü verir. (Sadece Whitelist)'),

    new SlashCommandBuilder()
        .setName('id-bul')
        .setDescription('Sunucu ve kanal IDlerini gösterir.'),

    new SlashCommandBuilder()
        .setName('tts-metin')
        .setDescription('Google TTS okuma metinlerini ayarlar.')
        .addStringOption(option => 
            option.setName('tur')
            .setDescription('Hangi metni ayarlamak istiyorsunuz?')
            .setRequired(true)
            .addChoices(
                { name: 'Karşılama', value: 'karsilama' },
                { name: 'Yetkili Bulundu', value: 'yetkili_bulundu' },
                { name: 'Yetkili Bulunamadı', value: 'yetkili_bulunamadi' },
                { name: 'Yetkiliye Haber Verilme', value: 'yetkili_bildirim' }
            ))
        .addStringOption(option => option.setName('metin').setDescription('Okunacak metin (giren kişi adı için {kullanici} yazın)').setRequired(true)),

    new SlashCommandBuilder()
        .setName('tts-ses-seviyesi')
        .setDescription('Botun TTS ses seviyesini ayarlar.')
        .addNumberOption(option => option.setName('seviye').setDescription('0.1 ile 1.0 arasında bir değer (Örn: 0.5)').setRequired(true)),

    new SlashCommandBuilder()
        .setName('bota-restart')
        .setDescription('Botu yeniden başlatır. (Sadece Yöneticiler)')
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
const clientId = process.env.CLIENT_ID; 
const guildId = process.env.GUILD_ID; 

(async () => {
    try {
        if (!clientId) {
            console.error('Lütfen .env dosyasına CLIENT_ID bilginizi ekleyin (Botunuzun IDsi).');
            return;
        }

        console.log('🔄 Eski komutlar temizleniyor...');

        // 1. Global komutları temizle
        await rest.put(Routes.applicationCommands(clientId), { body: [] });
        console.log('✅ Global komutlar tamamen silindi.');

        // 2. Sunucuya özel komutları temizle (Eğer GUILD_ID varsa)
        if (guildId) {
            await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
            console.log(`✅ Sunucuya özel komutlar tamamen silindi (${guildId}).`);
        }

        console.log('⏳ Yeni komutlar yükleniyor...');
        
        // 3. Yeni komutları YALNIZCA global veya YALNIZCA sunucu olarak yükle. (Çift çıkmasını önlemek için sadece Guild atalım, anında aktif olur)
        if (guildId) {
            await rest.put(
                Routes.applicationGuildCommands(clientId, guildId),
                { body: commands },
            );
            console.log(`🎉 Komutlar sadece ${guildId} ID'li sunucuya başarıyla yüklendi!`);
            console.log(`Artık çift görünmeyecekler ve anında güncellendiler.`);
        } else {
            await rest.put(
                Routes.applicationCommands(clientId),
                { body: commands },
            );
            console.log('🎉 Komutlar global olarak yüklendi! (Bunun Discord serverlarında gözükmesi 1 saate kadar sürebilir).');
        }

    } catch (error) {
        console.error('Komutları kaydederken hata oluştu:', error);
    }
})();
