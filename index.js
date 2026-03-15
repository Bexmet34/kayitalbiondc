require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Collection, REST, Routes, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, Events, MessageFlags } = require('discord.js');
const db = require('./db');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Channel]
});

// GLOBAL HATA YAKALAYICILAR (Botun Kapanmasını Önler)
client.on('error', error => console.error('[CLIENT ERROR]', error));
client.on('warn', warn => console.warn('[CLIENT WARN]', warn));
process.on('unhandledRejection', error => console.error('[PROCESS ERROR] Unhandled Rejection:', error));

client.commands = new Collection();

// Slash Commands Definition
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

// Gelenlere otomatik rol verme
client.on('guildMemberAdd', async member => {
    const config = db.getGuildConfig(member.guild.id);
    if (config && config.TARGET_ROLE_ID && config.ENABLED) {
        try {
            await member.roles.add(config.TARGET_ROLE_ID);
            console.log(`${member.user.tag} için otomatik rol verildi.`);
        } catch (error) {
            console.error('Otomatik rol verme hatası:', error);
        }
    }
});

client.once(Events.ClientReady, async () => {
    console.log(`Bot giriş yaptı: ${client.user.tag}`);

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        console.log('Slash komutları yükleniyor...');

        // Global komutlar (Tüm sunucular için - yayılması 1 saat sürebilir)
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );

        // Hızlı test için GUILD_ID tanımlıysa o sunucuya özel de yükle
        if (process.env.GUILD_ID) {
            await rest.put(
                Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID),
                { body: commands },
            );
            console.log(`Komutlar ${process.env.GUILD_ID} sunucusuna özel olarak da yüklendi (Anında görünür).`);
        }

        console.log('Slash komutları başarıyla yüklendi.');
    } catch (error) {
        console.error('Komut yükleme hatası:', error);
    }
});

const { handleVoiceStateUpdate, startStaffSearch } = require('./voiceHandler');
const { checkCooldown, setCooldown } = require('./cooldown');


client.on('interactionCreate', async interaction => {
    try {
        // --- BUTTON INTERACTIONS ---
        if (interaction.isButton()) {
            const customId = interaction.customId;
            const config = db.getGuildConfig(interaction.guildId);
            if (!config) return interaction.reply({ content: 'Sistem kurulu değil.', flags: [MessageFlags.Ephemeral] }).catch(() => { });

            // 1. NOTIFY STAFF
            if (customId === 'notify_staff') {
                const member = interaction.member;

                // Spam Kontrolü
                const cooldown = checkCooldown(member.id, interaction.guildId, 600000);
                if (cooldown.onCooldown) {
                    const remainingMinutes = Math.ceil(cooldown.remaining / 60000);
                    return interaction.reply({
                        content: `⚠️ Zaten bir yetkili çağırdınız! **${remainingMinutes}** dakika sonra tekrar deneyebilirsiniz.`,
                        flags: [MessageFlags.Ephemeral]
                    }).catch(() => { });
                }

                if (!member.voice.channel || member.voice.channel.id !== config.VOICE_CHANNEL_ID) {
                    return interaction.reply({ content: `❌ Önce <#${config.VOICE_CHANNEL_ID}> ses kanalına girmelidir!`, flags: [MessageFlags.Ephemeral] }).catch(() => { });
                }

                if (!member.roles.cache.has(config.TARGET_ROLE_ID)) {
                    return interaction.reply({ content: `❌ Zaten kayıtlısınız veya gereken role sahip değilsiniz.`, flags: [MessageFlags.Ephemeral] }).catch(() => { });
                }

                setCooldown(member.id, interaction.guildId);
                await interaction.reply({ content: '🔄 Bir yetkili bulmaya gidiyorum, lütfen bekle.', flags: [MessageFlags.Ephemeral] }).catch(() => { });
                startStaffSearch(member, member.voice.channel, config).catch(e => console.error('Staff search error:', e));
            }

            // 2. START REGISTRATION (Staff Side)
            else if (customId.startsWith('register_user_')) {
                if (!interaction.member.roles.cache.has(config.STAFF_ROLE_ID)) {
                    return interaction.reply({ content: '❌ Bu işlemi yapmak için yetkiniz yok!', flags: [MessageFlags.Ephemeral] }).catch(() => { });
                }

                const targetId = customId.split('_')[2];
                const modal = new ModalBuilder()
                    .setCustomId(`register_modal_${targetId}`)
                    .setTitle('Kullanıcı Kayıt');

                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('game_name').setLabel('Oyundaki Nick').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('real_name').setLabel('Gerçek İsim').setStyle(TextInputStyle.Short).setRequired(true))
                );

                await interaction.showModal(modal).catch(() => { });
            }
        }

        // --- MODAL SUBMISSIONS ---
        else if (interaction.isModalSubmit()) {
            // Kayıt Modal Submit
            if (interaction.customId.startsWith('register_modal_')) {
                await interaction.deferReply().catch(() => { });

                const targetId = interaction.customId.split('_')[2];
                const gameName = interaction.fields.getTextInputValue('game_name');
                const realName = interaction.fields.getTextInputValue('real_name');
                const config = db.getGuildConfig(interaction.guildId);

                try {
                    const targetMember = await interaction.guild.members.fetch(targetId);
                    await targetMember.setNickname(`${gameName} - ${realName}`).catch(() => { });

                    if (config.REGISTERED_ROLE_ID) await targetMember.roles.add(config.REGISTERED_ROLE_ID).catch(() => { });
                    if (config.TARGET_ROLE_ID) await targetMember.roles.remove(config.TARGET_ROLE_ID).catch(() => { });

                    await interaction.editReply({ content: `✅ ${targetMember} başarıyla kaydedildi: **${gameName} - ${realName}**` }).catch(() => { });
                } catch (error) {
                    await interaction.editReply({ content: `❌ Kayıt sırasında hata oluştu.` }).catch(() => { });
                }
            }
        }
    } catch (globalErr) {
        console.error('[INTERACTION ERROR]', globalErr);
    }


    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'kurulum') {
        const sesKanali = interaction.options.getChannel('ses_kanali');
        const kayitsizRol = interaction.options.getRole('kayitsiz_rol');
        const kayitliRol = interaction.options.getRole('kayitli_rol');
        const yetkiliRol = interaction.options.getRole('kayit_sorumlusu_rolu');
        const bildirimKanali = interaction.options.getChannel('yetkili_bildirim_kanali');
        const karsilanmaKanali = interaction.options.getChannel('karsilama_kanali');

        db.setGuildConfig(interaction.guildId, {
            VOICE_CHANNEL_ID: sesKanali.id,
            TARGET_ROLE_ID: kayitsizRol.id,
            REGISTERED_ROLE_ID: kayitliRol.id,
            STAFF_ROLE_ID: yetkiliRol.id,
            STAFF_NOTIFICATION_CHANNEL_ID: bildirimKanali.id,
            WELCOME_TEXT_CHANNEL_ID: karsilanmaKanali.id,
            ENABLED: true
        });

        await interaction.reply({
            content: `✅ Kurulum başarıyla tamamlandı!\n\n**Ses Kanalı:** ${sesKanali}\n**Kayıtsız Rolü:** ${kayitsizRol}\n**Kayıtlı Rolü:** ${kayitliRol}\n**Kayıt Sorumlusu Rolü:** ${yetkiliRol}\n**Bildirim Kanalı:** ${bildirimKanali}\n**Karşılama Kanalı:** ${karsilanmaKanali}`,
            flags: [MessageFlags.Ephemeral]
        });
    }


    if (interaction.commandName === 'buton-gonder') {
        const config = db.getGuildConfig(interaction.guildId);
        if (!config || !config.WELCOME_TEXT_CHANNEL_ID) return interaction.reply({ content: 'Önce /kurulum yapmalısınız.', flags: [MessageFlags.Ephemeral] });

        const channel = await interaction.guild.channels.fetch(config.WELCOME_TEXT_CHANNEL_ID);
        if (!channel) return interaction.reply({ content: 'Karşılama kanalı bulunamadı.', flags: [MessageFlags.Ephemeral] });

        const embed = new EmbedBuilder()
            .setTitle('🎙️ Kayıt İşlemi Başladı!')
            .setColor('Gold')
            .setDescription(
                `**Hoş geldin! Kayıt için adımlar çok basit:**\n\n` +
                `1️⃣ **Ses kanalına giriş yap** (<#${config.VOICE_CHANNEL_ID}>)\n` +
                `2️⃣ **Yetkili çağır** butonuna tıkla\n\n` +
                `⚡ **Not:** Lütfen sabırlı ol, yetkililer kısa süre içinde kaydını alacak.\n\n` +
                `💡 Bu sistem ** <@407234961582587916> ** tarafından hazırlandı: `
            )
            .setFooter({ text: 'Gelişmiş Sesli Kayıt Sistemi' })
            .setTimestamp();


        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('notify_staff')
                    .setLabel('Yetkiliye Haber Ver')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('📢')
            );

        await channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: '✅ Buton mesajı başarıyla gönderildi.', flags: [MessageFlags.Ephemeral] });
    }

    if (interaction.commandName === 'herkese-rol-ver') {
        const whitelist = process.env.WHITELIST_USERS ? process.env.WHITELIST_USERS.split(',').map(id => id.trim()) : [];
        if (!whitelist.includes(interaction.user.id)) {
            return interaction.reply({ content: `❌ Bu komutu kullanmak için yetkiniz yok. (Whitelist değilsiniz. Sizin ID: ${interaction.user.id})`, flags: [MessageFlags.Ephemeral] });
        }

        const config = db.getGuildConfig(interaction.guildId);
        if (!config || !config.TARGET_ROLE_ID) return interaction.reply({ content: 'Sistem kurulu değil veya kayıtsız rolü ayarlanmamış.', flags: [MessageFlags.Ephemeral] });

        await interaction.reply({ content: '🔄 İşlem başlatıldı, rolü olmayan herkese kayıtsız rolü veriliyor...', flags: [MessageFlags.Ephemeral] });

        try {
            // Önce tüm üyeleri çek
            const members = await interaction.guild.members.fetch();
            let count = 0;
            let alreadyHasRoles = 0;

            for (const [id, member] of members) {
                if (member.user.bot) continue;

                // @everyone rolü her zaman vardır, bu yüzden size === 1 hiç rolü yok demektir
                if (member.roles.cache.size === 1) {
                    await member.roles.add(config.TARGET_ROLE_ID).catch(err => console.error(`${member.user.tag} rol verme hatası:`, err));
                    count++;
                } else {
                    alreadyHasRoles++;
                }
            }

            await interaction.followUp({
                content: `✅ İşlem tamamlandı!\n\n**Yeni Rol Verilen:** ${count}\n**Zaten Rolü Olan:** ${alreadyHasRoles}`,
                flags: [MessageFlags.Ephemeral]
            });
        } catch (error) {
            console.error('Bulk role error:', error);
            await interaction.followUp({ content: `❌ İşlem sırasında bir hata oluştu: ${error.message}`, flags: [MessageFlags.Ephemeral] });
        }
    }

    if (interaction.commandName === 'id-bul') {
        const embed = new EmbedBuilder()
            .setTitle('🔍 ID Bilgileri')
            .setColor('Blue')
            .addFields(
                { name: 'Sunucu ID', value: `\`${interaction.guildId}\`` },
                { name: 'Bulunduğun Kanal ID', value: `\`${interaction.channelId}\`` },
                { name: 'Senin ID', value: `\`${interaction.user.id}\`` }
            )
            .setFooter({ text: 'Gelişmiş Sesli Kayıt Sistemi' });

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (interaction.commandName === 'tts-metin') {
        // Only allow admins
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: '❌ Bu komutu sadece yöneticiler kullanabilir.', flags: [MessageFlags.Ephemeral] });
        }
        const tur = interaction.options.getString('tur');
        const metin = interaction.options.getString('metin');
        
        let updateKey = '';
        let turAdi = '';
        if (tur === 'karsilama') { updateKey = 'TTS_WELCOME'; turAdi = 'Karşılama'; }
        else if (tur === 'yetkili_bulundu') { updateKey = 'TTS_STAFF_FOUND'; turAdi = 'Yetkili Bulundu'; }
        else if (tur === 'yetkili_bulunamadi') { updateKey = 'TTS_STAFF_NOT_FOUND'; turAdi = 'Yetkili Bulunamadı'; }
        else if (tur === 'yetkili_bildirim') { updateKey = 'TTS_STAFF_NOTIFY'; turAdi = 'Yetkiliye Haber Verilme'; }

        db.setGuildConfig(interaction.guildId, { [updateKey]: metin });
        await interaction.reply({ content: `✅ **${turAdi}** metni başarıyla güncellendi:\n\n\`${metin}\``, flags: [MessageFlags.Ephemeral] });
    }

    if (interaction.commandName === 'tts-ses-seviyesi') {
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: '❌ Bu komutu sadece yöneticiler kullanabilir.', flags: [MessageFlags.Ephemeral] });
        }
        const seviye = interaction.options.getNumber('seviye');
        if (seviye < 0 || seviye > 1) {
            return interaction.reply({ content: '❌ Lütfen 0.0 ile 1.0 arasında bir değer girin.', flags: [MessageFlags.Ephemeral] });
        }
        db.setGuildConfig(interaction.guildId, { TTS_VOLUME: seviye });
        await interaction.reply({ content: `✅ TTS Ses seviyesi **${seviye}** olarak ayarlandı.`, flags: [MessageFlags.Ephemeral] });
    }

    if (interaction.commandName === 'bota-restart') {
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: '❌ Bu komutu sadece yöneticiler kullanabilir.', flags: [MessageFlags.Ephemeral] });
        }
        
        await interaction.reply({ content: '🔄 Bot yeniden başlatılıyor...', flags: [MessageFlags.Ephemeral] });
        setTimeout(() => {
            process.exit(0); // If using PM2, it will automatically restart
        }, 1000);
    }
});

client.on('voiceStateUpdate', handleVoiceStateUpdate);

client.login(process.env.DISCORD_TOKEN);

