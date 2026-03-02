require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
} = require('discord.js');
const config = require('./config');
const { createTicket, closeTicket, openTickets } = require('./ticketManager');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

client.once('ready', () => {
  console.log(`Bot is online: ${client.user.tag}`);
});

// ─── Slash Commands ───────────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'ticket-send') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: 'ليس لديك صلاحية استخدام هذا الامر.', ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setTitle('نظام التذاكر - JoyBase')
        .setDescription('اختر نوع التذكرة من القائمة ادناه لفتح تكت جديد.')
        .setImage(config.IMAGE_URL)
        .setColor(0x2b2d31)
        .setFooter({ text: 'Developed by firas' })
        .setTimestamp();

      const dropdown = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('open_ticket_type')
          .setPlaceholder('اختر نوع التذكرة')
          .addOptions(
            Object.entries(config.TICKET_TYPES).map(([key, val]) => ({
              label: val.label,
              value: key,
              emoji: val.emoji,
            }))
          )
      );

      await interaction.reply({ content: 'تم الارسال.', ephemeral: true });
      await interaction.channel.send({ embeds: [embed], components: [dropdown] });
    }
  }

  // ─── Select Menu: Open Ticket ──────────────────────────────────
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'open_ticket_type') {
      const ticketType = interaction.values[0];
      await interaction.deferReply({ ephemeral: true });
      await createTicket(interaction, ticketType);
      return;
    }

    // Ticket management dropdown
    if (interaction.customId.startsWith('ticket_manage_')) {
      const channelId = interaction.customId.replace('ticket_manage_', '');
      const action = interaction.values[0];
      const ticketData = openTickets.get(channelId);

      if (!ticketData) return interaction.reply({ content: 'لم يتم العثور على بيانات التكت.', ephemeral: true });

      const typeConfig = config.TICKET_TYPES[ticketData.type];
      const isAdmin = interaction.member.roles.cache.has(typeConfig.adminRole);

      if (!isAdmin) {
        return interaction.reply({ content: 'ليس لديك صلاحية.', ephemeral: true });
      }

      if (action === 'call_owner') {
        await interaction.reply({ content: `<@${ticketData.ownerId}>` });

      } else if (action === 'rename') {
        const modal = new ModalBuilder()
          .setCustomId(`modal_rename_${channelId}`)
          .setTitle('تعديل اسم التذكرة');
        const input = new TextInputBuilder()
          .setCustomId('new_name')
          .setLabel('الاسم الجديد')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal);

      } else if (action === 'add_member') {
        const modal = new ModalBuilder()
          .setCustomId(`modal_addmember_${channelId}`)
          .setTitle('اضافة عضو');
        const input = new TextInputBuilder()
          .setCustomId('user_id')
          .setLabel('ادخل ID العضو')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal);

      } else if (action === 'remove_member') {
        const modal = new ModalBuilder()
          .setCustomId(`modal_removemember_${channelId}`)
          .setTitle('ازالة عضو');
        const input = new TextInputBuilder()
          .setCustomId('user_id')
          .setLabel('ادخل ID العضو')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal);
      }
    }
  }

  // ─── Buttons ───────────────────────────────────────────────────
  if (interaction.isButton()) {
    const customId = interaction.customId;

    if (customId.startsWith('ticket_senior_')) {
      const channelId = customId.replace('ticket_senior_', '');
      const ticketData = openTickets.get(channelId);
      if (!ticketData) return interaction.reply({ content: 'تكت غير موجود.', ephemeral: true });
      const typeConfig = config.TICKET_TYPES[ticketData.type];
      if (!interaction.member.roles.cache.has(typeConfig.adminRole)) {
        return interaction.reply({ content: 'ليس لديك صلاحية.', ephemeral: true });
      }
      await interaction.reply({ content: `<@&${config.ROLES.SENIOR}>` });

    } else if (customId.startsWith('ticket_support_')) {
      const channelId = customId.replace('ticket_support_', '');
      const ticketData = openTickets.get(channelId);
      if (!ticketData) return interaction.reply({ content: 'تكت غير موجود.', ephemeral: true });
      const typeConfig = config.TICKET_TYPES[ticketData.type];
      if (!interaction.member.roles.cache.has(typeConfig.adminRole)) {
        return interaction.reply({ content: 'ليس لديك صلاحية.', ephemeral: true });
      }
      await interaction.reply({ content: `<@&${typeConfig.supportRole}>` });

    } else if (customId.startsWith('ticket_claim_')) {
      const channelId = customId.replace('ticket_claim_', '');
      const ticketData = openTickets.get(channelId);
      if (!ticketData) return interaction.reply({ content: 'تكت غير موجود.', ephemeral: true });

      const typeConfig = config.TICKET_TYPES[ticketData.type];
      if (!interaction.member.roles.cache.has(typeConfig.adminRole)) {
        return interaction.reply({ content: 'ليس لديك صلاحية.', ephemeral: true });
      }

      if (ticketData.claimedBy) {
        return interaction.reply({ content: `التكت تم استلامه بالفعل من <@${ticketData.claimedBy}>.`, ephemeral: true });
      }

      ticketData.claimedBy = interaction.user.id;
      openTickets.set(channelId, ticketData);

      const claimEmbed = new EmbedBuilder()
        .setDescription(`تم استلام التكت بواسطة <@${interaction.user.id}>`)
        .setColor(0x2ecc71)
        .setFooter({ text: 'Developed by firas' })
        .setTimestamp();

      await interaction.reply({ embeds: [claimEmbed] });

    } else if (customId.startsWith('ticket_close_')) {
      const channelId = customId.replace('ticket_close_', '');
      const ticketData = openTickets.get(channelId);
      if (!ticketData) return interaction.reply({ content: 'تكت غير موجود.', ephemeral: true });

      const typeConfig = config.TICKET_TYPES[ticketData.type];
      const canClose =
        interaction.member.roles.cache.has(typeConfig.adminRole) ||
        interaction.user.id === ticketData.ownerId;

      if (!canClose) {
        return interaction.reply({ content: 'ليس لديك صلاحية اغلاق هذا التكت.', ephemeral: true });
      }

      await closeTicket(interaction, channelId);
    }
  }

  // ─── Modals ────────────────────────────────────────────────────
  if (interaction.isModalSubmit()) {
    const customId = interaction.customId;

    if (customId.startsWith('modal_rename_')) {
      const channelId = customId.replace('modal_rename_', '');
      const channel = interaction.guild.channels.cache.get(channelId);
      const newName = interaction.fields.getTextInputValue('new_name').toLowerCase().replace(/[^a-z0-9-\u0600-\u06FF ]/g, '').slice(0, 32);
      if (channel) {
        await channel.setName(newName);
        await interaction.reply({ content: `تم تغيير الاسم الى: ${newName}`, ephemeral: true });
      }

    } else if (customId.startsWith('modal_addmember_')) {
      const channelId = customId.replace('modal_addmember_', '');
      const channel = interaction.guild.channels.cache.get(channelId);
      const userId = interaction.fields.getTextInputValue('user_id').trim();
      try {
        await channel.permissionOverwrites.create(userId, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
        });
        await interaction.reply({ content: `تم اضافة <@${userId}> للتكت.`, ephemeral: true });
      } catch {
        await interaction.reply({ content: 'فشل اضافة العضو. تحقق من الـ ID.', ephemeral: true });
      }

    } else if (customId.startsWith('modal_removemember_')) {
      const channelId = customId.replace('modal_removemember_', '');
      const channel = interaction.guild.channels.cache.get(channelId);
      const userId = interaction.fields.getTextInputValue('user_id').trim();
      const ticketData = openTickets.get(channelId);
      if (ticketData && userId === ticketData.ownerId) {
        return interaction.reply({ content: 'لا يمكن ازالة صاحب التكت.', ephemeral: true });
      }
      try {
        await channel.permissionOverwrites.delete(userId);
        await interaction.reply({ content: `تم ازالة <@${userId}> من التكت.`, ephemeral: true });
      } catch {
        await interaction.reply({ content: 'فشل ازالة العضو. تحقق من الـ ID.', ephemeral: true });
      }
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
