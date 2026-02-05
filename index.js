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
        .setDescription('Sunucu ve kanal IDlerini gösterir.')
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

const { handleVoiceStateUpdate, startStaffSearch, playMusic, stopMusic } = require('./voiceHandler');
const { checkCooldown, setCooldown } = require('./cooldown');

// Müzik durumu (Basit bir kontrol için)
let isPlayingMusic = false;

client.on('interactionCreate', async interaction => {
    if (interaction.isButton()) {
        const customId = interaction.customId;

        if (customId === 'notify_staff') {
            const config = db.getGuildConfig(interaction.guildId);
            if (!config) return interaction.reply({ content: 'Sistem kurulu değil.', ephemeral: true });

            const member = interaction.member;

            // Spam Kontrolü (10 Dakika)
            const cooldown = checkCooldown(member.id, interaction.guildId, 600000);
            if (cooldown.onCooldown) {
                const remainingMinutes = Math.ceil(cooldown.remaining / 60000);
                return interaction.reply({
                    content: `⚠️ Zaten bir yetkili çağırdınız! Spam yapmamak için **${remainingMinutes}** dakika sonra tekrar deneyebilirsiniz.`,
                    flags: [MessageFlags.Ephemeral]
                });
            }

            if (!member.voice.channel || member.voice.channel.id !== config.VOICE_CHANNEL_ID) {
                return interaction.reply({ content: `❌ Bu butonu kullanmak için önce <#${config.VOICE_CHANNEL_ID}> ses kanalına girmelisiniz!`, flags: [MessageFlags.Ephemeral] });
            }

            if (!member.roles.cache.has(config.TARGET_ROLE_ID)) {
                return interaction.reply({ content: `❌ Zaten kayıtlısınız veya gereken role sahip değilsiniz.`, flags: [MessageFlags.Ephemeral] });
            }

            // Cooldown'ı başlat
            setCooldown(member.id, interaction.guildId);

            await interaction.reply({ content: '🔄 Bir yetkili bulmaya gidiyorum, lütfen ses kanalında bekle.', flags: [MessageFlags.Ephemeral] });

            startStaffSearch(member, member.voice.channel, config);
        }

        if (customId === 'toggle_music') {
            const config = db.getGuildConfig(interaction.guildId);
            if (!config) return interaction.reply({ content: 'Sistem kurulu değil.', flags: [MessageFlags.Ephemeral] });

            // Müzik butonu için kısa bir cooldown (5 saniye)
            const musicCooldown = checkCooldown(interaction.user.id, `music_${interaction.guildId}`, 5000);
            if (musicCooldown.onCooldown) {
                return interaction.reply({ content: '⚠️ Müzik butonunu çok hızlı kullanıyorsunuz, lütfen biraz bekleyin.', flags: [MessageFlags.Ephemeral] });
            }
            setCooldown(interaction.user.id, `music_${interaction.guildId}`);

            const member = interaction.member;
            if (!member.voice.channel || member.voice.channel.id !== config.VOICE_CHANNEL_ID) {
                return interaction.reply({ content: `❌ Müzik dinlemek için önce <#${config.VOICE_CHANNEL_ID}> ses kanalına girmelisiniz!`, flags: [MessageFlags.Ephemeral] });
            }

            if (!isPlayingMusic) {
                await playMusic(member.voice.channel);
                isPlayingMusic = true;

                // Mesajdaki butonu güncelle
                const newRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('notify_staff').setLabel('Yetkiliye Haber Ver').setStyle(ButtonStyle.Primary).setEmoji('📢'),
                    new ButtonBuilder().setCustomId('toggle_music').setLabel('Müziği Durdur').setStyle(ButtonStyle.Danger).setEmoji('⏹️')
                );
                await interaction.update({ components: [newRow] });
            } else {
                stopMusic();
                isPlayingMusic = false;

                const newRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('notify_staff').setLabel('Yetkiliye Haber Ver').setStyle(ButtonStyle.Primary).setEmoji('📢'),
                    new ButtonBuilder().setCustomId('toggle_music').setLabel('Müzik Çal').setStyle(ButtonStyle.Secondary).setEmoji('🎵')
                );
                await interaction.update({ components: [newRow] });
            }
        }

        if (customId.startsWith('register_user_')) {
            const config = db.getGuildConfig(interaction.guildId);
            if (!config || !interaction.member.roles.cache.has(config.STAFF_ROLE_ID)) {
                return interaction.reply({ content: '❌ Bu işlemi yapmak için yetkiniz yok!', flags: [MessageFlags.Ephemeral] });
            }

            const targetId = customId.split('_')[2];

            const modal = new ModalBuilder()
                .setCustomId(`register_modal_${targetId}`)
                .setTitle('Kullanıcı Kayıt');

            const gameNameInput = new TextInputBuilder()
                .setCustomId('game_name')
                .setLabel('Oyundaki Nick')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Oyundaki Nickinizi giriniz')
                .setRequired(true);

            const realNameInput = new TextInputBuilder()
                .setCustomId('real_name')
                .setLabel('Gerçek İsim')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Gerçek isminizi giriniz')
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(gameNameInput),
                new ActionRowBuilder().addComponents(realNameInput)
            );

            await interaction.showModal(modal);
        }
        return;
    }

    if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('register_modal_')) {
            const targetId = interaction.customId.split('_')[2];
            const gameName = interaction.fields.getTextInputValue('game_name');
            const realName = interaction.fields.getTextInputValue('real_name');

            const config = db.getGuildConfig(interaction.guildId);
            if (!config) return interaction.reply({ content: 'Sistem hatası: Konfigürasyon bulunamadı.', flags: [MessageFlags.Ephemeral] });

            if (!interaction.member.roles.cache.has(config.STAFF_ROLE_ID)) {
                return interaction.reply({ content: '❌ Bu işlemi yapmak için yetkiniz yok!', flags: [MessageFlags.Ephemeral] });
            }

            try {
                const targetMember = await interaction.guild.members.fetch(targetId);
                if (!targetMember) return interaction.reply({ content: 'Kullanıcı sunucuda bulunamadı.', flags: [MessageFlags.Ephemeral] });

                // 1. Nickname Güncelle
                await targetMember.setNickname(`${gameName} - ${realName}`).catch(err => {
                    console.error('Nickname değiştirme hatası:', err);
                });

                // 2. Rolleri Değiştir
                let roleAdded = false;
                let roleRemoved = false;
                let errorMessages = [];

                if (config.REGISTERED_ROLE_ID) {
                    try {
                        await targetMember.roles.add(config.REGISTERED_ROLE_ID);
                        roleAdded = true;
                    } catch (err) {
                        console.error('Kayıtlı rolü verme hatası:', err);
                        errorMessages.push(`Kayıtlı rolü verilemedi. (${err.message})`);
                    }
                }

                if (config.TARGET_ROLE_ID) {
                    try {
                        await targetMember.roles.remove(config.TARGET_ROLE_ID);
                        roleRemoved = true;
                    } catch (err) {
                        console.error('Kayıtsız rolü alma hatası:', err);
                        errorMessages.push(`Kayıtsız rolü geri alınamadı. (${err.message})`);
                    }
                }

                // Bilgilendirme Mesajı
                let statusMsg = `✅ ${targetMember} başarıyla kaydedildi: **${gameName} - ${realName}**`;

                if (errorMessages.length > 0) {
                    statusMsg += `\n\n⚠️ **Bazı işlemler tamamlanamadı:**\n${errorMessages.join('\n')}`;
                    statusMsg += `\n\n💡 **Çözüm:** Botun rolünün, vermeye çalıştığı rollerden daha **üstte** olduğundan emin olun.`;
                }

                await interaction.reply({ content: statusMsg });
            } catch (error) {
                console.error('Kayıt hatası:', error);
                await interaction.reply({ content: `❌ Kayıt sırasında teknik bir hata oluştu: ${error.message}`, flags: [MessageFlags.Ephemeral] });
            }
        }
        return;
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
            .setTitle('🎙️ Kayıt İşlemi')
            .setColor('Gold')
            .setDescription(`Hoş geldin! Kayıt olmak için lütfen aşağıdaki butona tıklayarak bir yetkili çağırın.\n\n⚠️ Butona basmadan önce <#${config.VOICE_CHANNEL_ID}> ses kanalına girmiş olmanız gerekmektedir.`)
            .setFooter({ text: 'Gelişmiş Sesli Kayıt Sistemi' });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('notify_staff')
                    .setLabel('Yetkiliye Haber Ver')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('📢'),
                new ButtonBuilder()
                    .setCustomId('toggle_music')
                    .setLabel('Müzik Çal')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🎵')
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
});

client.on('voiceStateUpdate', handleVoiceStateUpdate);

client.login(process.env.DISCORD_TOKEN);

