require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
} = require('discord.js');
const config  = require('./config');
const { createTicket, closeTicket, openTickets, loadOpenTickets } = require('./ticketManager');
const { handleCommand } = require('./commands');
const { connectDB }     = require('./database');
const db                = require('./database');
const { sendV2, replyV2, followUpV2 } = require('./rest');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildInvites,
  ],
});

client.once('ready', async () => {
  console.log(`[JoyPiece] Online: ${client.user.tag}`);
  client.user.setActivity('JoyPiece | !help', { type: 3 });
  await connectDB();
  await loadOpenTickets();
});

// ── Messages ──────────────────────────────────────────────────────
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  // AFK check
  if (message.mentions.users.size > 0 && message.guild._afkList) {
    for (const [, u] of message.mentions.users) {
      const afk = message.guild._afkList.get(u.id);
      if (afk) await message.reply({ embeds: [new EmbedBuilder().setColor(config.EMBED_COLOR).setDescription(`${u.username} غائب — ${afk.reason}`).setFooter({ text: 'Developed by firas' })] }).catch(() => {});
    }
  }
  if (message.guild._afkList?.has(message.author.id)) {
    message.guild._afkList.delete(message.author.id);
    const r = await message.reply({ embeds: [new EmbedBuilder().setColor(config.EMBED_COLOR).setDescription('تم ايقاف وضع الغياب.').setFooter({ text: 'Developed by firas' })] }).catch(() => null);
    if (r) setTimeout(() => r.delete().catch(() => {}), 4000);
  }

  await handleCommand(message, client).catch(err => console.error('[CMD]', err));
});

// ── Interactions ──────────────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
  try {

    // ══ Select Menus ══════════════════════════════════════════════
    if (interaction.isStringSelectMenu()) {

      // Open ticket (legacy fallback dropdown)
      if (interaction.customId === 'open_ticket_type' || interaction.customId === 'open_ticket_type_extra') {
        await interaction.deferReply({ ephemeral: true });
        await createTicket(interaction, interaction.values[0]);
        return;
      }

      // Ticket management dropdown
      if (interaction.customId.startsWith('ticket_manage_')) {
        const channelId  = interaction.customId.replace('ticket_manage_', '');
        const action     = interaction.values[0];
        const ticketData = openTickets.get(channelId);
        if (!ticketData) return interaction.reply({ content: 'لم يتم العثور على بيانات التكت.', ephemeral: true });

        const typeConfig = config.TICKET_TYPES[ticketData.type];
        const isAdmin    = interaction.member.roles.cache.has(typeConfig.adminRole) ||
                           interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        if (!isAdmin) return interaction.reply({ content: 'ليس لديك صلاحية.', ephemeral: true });

        if (action === 'call_owner') {
          await interaction.reply({ content: `<@${ticketData.ownerId}>` });
          try {
            const ownerUser = await client.users.fetch(ticketData.ownerId);
            await ownerUser.send({ embeds: [new EmbedBuilder()
              .setTitle('استدعاء في تكتك')
              .setDescription(`تم استدعاؤك في التكت الخاص بك في **${interaction.guild.name}**\nالقناة: <#${channelId}>`)
              .setColor(config.EMBED_COLOR).setFooter({ text: 'Developed by firas' }).setTimestamp()] });
          } catch {}

        } else if (action === 'rename') {
          const modal = new ModalBuilder().setCustomId(`modal_rename_${channelId}`).setTitle('تعديل اسم التذكرة');
          modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('new_name').setLabel('الاسم الجديد').setStyle(TextInputStyle.Short).setRequired(true)));
          await interaction.showModal(modal);

        } else if (action === 'add_member') {
          const modal = new ModalBuilder().setCustomId(`modal_addmember_${channelId}`).setTitle('اضافة عضو');
          modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('user_id').setLabel('ادخل ID العضو').setStyle(TextInputStyle.Short).setRequired(true)));
          await interaction.showModal(modal);

        } else if (action === 'remove_member') {
          const modal = new ModalBuilder().setCustomId(`modal_removemember_${channelId}`).setTitle('ازالة عضو');
          modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('user_id').setLabel('ادخل ID العضو').setStyle(TextInputStyle.Short).setRequired(true)));
          await interaction.showModal(modal);
        }
      }
    }

    // ══ Buttons ═══════════════════════════════════════════════════
    if (interaction.isButton()) {
      const cid = interaction.customId;

      // Open ticket buttons (Components V2 sections)
      if (cid.startsWith('open_ticket_btn_')) {
        const ticketType = cid.replace('open_ticket_btn_', '');
        await interaction.deferReply({ ephemeral: true });
        await createTicket(interaction, ticketType);
        return;
      }

      // Senior call
      if (cid.startsWith('ticket_senior_')) {
        const channelId  = cid.replace('ticket_senior_', '');
        const ticketData = openTickets.get(channelId);
        if (!ticketData) return interaction.reply({ content: 'تكت غير موجود.', ephemeral: true });
        const typeConfig = config.TICKET_TYPES[ticketData.type];
        const hasRole    = interaction.member.roles.cache.has(typeConfig.adminRole) || interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        if (!hasRole) return interaction.reply({ content: 'ليس لديك صلاحية.', ephemeral: true });
        return interaction.reply({ content: `<@&${config.ROLES.SENIOR}>` });
      }

      // Support call
      if (cid.startsWith('ticket_support_')) {
        const channelId  = cid.replace('ticket_support_', '');
        const ticketData = openTickets.get(channelId);
        if (!ticketData) return interaction.reply({ content: 'تكت غير موجود.', ephemeral: true });
        const typeConfig = config.TICKET_TYPES[ticketData.type];
        const hasRole    = interaction.member.roles.cache.has(typeConfig.adminRole) || interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        if (!hasRole) return interaction.reply({ content: 'ليس لديك صلاحية.', ephemeral: true });
        return interaction.reply({ content: `<@&${typeConfig.supportRole}>` });
      }

      // Claim
      if (cid.startsWith('ticket_claim_')) {
        const channelId  = cid.replace('ticket_claim_', '');
        const ticketData = openTickets.get(channelId);
        if (!ticketData) return interaction.reply({ content: 'تكت غير موجود.', ephemeral: true });
        const typeConfig = config.TICKET_TYPES[ticketData.type];
        const hasRole    = interaction.member.roles.cache.has(typeConfig.adminRole) || interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        if (!hasRole) return interaction.reply({ content: 'ليس لديك صلاحية.', ephemeral: true });
        if (ticketData.claimedBy) return interaction.reply({ content: `التكت تم استلامه بالفعل من <@${ticketData.claimedBy}>.`, ephemeral: true });
        ticketData.claimedBy = interaction.user.id;
        openTickets.set(channelId, ticketData);
        await db.updateTicket(channelId, { claimedBy: interaction.user.id });
        return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`تم استلام التكت بواسطة <@${interaction.user.id}>`).setColor(0x2ecc71).setFooter({ text: 'Developed by firas' }).setTimestamp()] });
      }

      // Close - show confirmation
      if (cid.startsWith('ticket_close_') && !cid.startsWith('ticket_confirm_close_') && !cid.startsWith('ticket_cancel_close_')) {
        const channelId  = cid.replace('ticket_close_', '');
        const ticketData = openTickets.get(channelId);
        if (!ticketData) return interaction.reply({ content: 'تكت غير موجود.', ephemeral: true });
        const typeConfig = config.TICKET_TYPES[ticketData.type];
        const canClose   = interaction.member.roles.cache.has(typeConfig.adminRole) || interaction.user.id === ticketData.ownerId || interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        if (!canClose) return interaction.reply({ content: 'ليس لديك صلاحية.', ephemeral: true });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`ticket_confirm_close_${channelId}`).setLabel('نعم، اغلق التكت').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`ticket_cancel_close_${channelId}`).setLabel('إلغاء').setStyle(ButtonStyle.Secondary)
        );
        return interaction.reply({
          embeds: [new EmbedBuilder().setTitle('تأكيد الإغلاق').setDescription('هل أنت متأكد من إغلاق هذا التكت؟\nسيتم حذف القناة وإرسال السجل للوق.').setColor(0xe74c3c).setFooter({ text: 'Developed by firas' }).setTimestamp()],
          components: [row],
          ephemeral: true,
        });
      }

      // Confirm close
      if (cid.startsWith('ticket_confirm_close_')) {
        const channelId = cid.replace('ticket_confirm_close_', '');
        await interaction.update({ content: 'جاري الإغلاق...', embeds: [], components: [] });
        await closeTicket({ guild: interaction.guild, user: interaction.user, channel: interaction.channel }, channelId);
        return;
      }

      // Cancel close
      if (cid.startsWith('ticket_cancel_close_')) {
        return interaction.update({ content: 'تم إلغاء الإغلاق.', embeds: [], components: [] });
      }
    }

    // ══ Modals ═════════════════════════════════════════════════════
    if (interaction.isModalSubmit()) {
      const cid = interaction.customId;

      if (cid.startsWith('modal_rename_')) {
        const channelId = cid.replace('modal_rename_', '');
        const channel   = interaction.guild.channels.cache.get(channelId);
        const newName   = interaction.fields.getTextInputValue('new_name').toLowerCase().replace(/\s+/g, '-').slice(0, 50);
        if (channel) await channel.setName(newName);
        return interaction.reply({ content: `تم تغيير الاسم الى: **${newName}**`, ephemeral: true });
      }

      if (cid.startsWith('modal_addmember_')) {
        const channelId = cid.replace('modal_addmember_', '');
        const channel   = interaction.guild.channels.cache.get(channelId);
        const userId    = interaction.fields.getTextInputValue('user_id').trim().replace(/\D/g, '');
        if (!channel) return interaction.reply({ content: 'القناة غير موجودة.', ephemeral: true });
        if (!userId)  return interaction.reply({ content: 'الـ ID غير صالح.', ephemeral: true });
        const target = await interaction.guild.members.fetch(userId).catch(() => null);
        if (!target)  return interaction.reply({ content: 'العضو غير موجود في السيرفر.', ephemeral: true });
        await channel.permissionOverwrites.edit(target, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true });
        return interaction.reply({ content: `تم اضافة <@${userId}> للتكت.`, ephemeral: false });
      }

      if (cid.startsWith('modal_removemember_')) {
        const channelId = cid.replace('modal_removemember_', '');
        const channel   = interaction.guild.channels.cache.get(channelId);
        const userId    = interaction.fields.getTextInputValue('user_id').trim().replace(/\D/g, '');
        const ticketData = openTickets.get(channelId);
        if (!channel) return interaction.reply({ content: 'القناة غير موجودة.', ephemeral: true });
        if (!userId)  return interaction.reply({ content: 'الـ ID غير صالح.', ephemeral: true });
        if (ticketData?.ownerId === userId) return interaction.reply({ content: 'لا يمكن ازالة صاحب التكت.', ephemeral: true });
        const target = await interaction.guild.members.fetch(userId).catch(() => null);
        if (!target)  return interaction.reply({ content: 'العضو غير موجود في السيرفر.', ephemeral: true });
        await channel.permissionOverwrites.delete(target);
        return interaction.reply({ content: `تم ازالة <@${userId}> من التكت.`, ephemeral: false });
      }
    }

  } catch (err) {
    console.error('[Interaction Error]', err);
    const msg = { content: 'حدث خطأ.', ephemeral: true };
    try {
      if (interaction.replied || interaction.deferred) await interaction.followUp(msg);
      else await interaction.reply(msg);
    } catch {}
  }
});

client.login(process.env.DISCORD_TOKEN);
