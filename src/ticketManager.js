const {
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelType,
  AttachmentBuilder,
} = require('discord.js');
const config = require('./config');
const db = require('./database');

// In-memory cache (loaded from DB on startup)
const openTickets = new Map(); // channelId -> { type, ownerId, claimedBy, openedAt, number }

// Load open tickets from DB into memory cache
async function loadOpenTickets() {
  try {
    const tickets = await db.getAllOpenTickets(process.env.GUILD_ID);
    for (const t of tickets) {
      openTickets.set(t.channelId, {
        type: t.type,
        ownerId: t.ownerId,
        claimedBy: t.claimedBy,
        openedAt: t.openedAt,
        number: t.number,
      });
    }
    console.log(`[DB] Loaded ${tickets.length} open tickets into cache`);
  } catch (err) {
    console.error('[DB] Failed to load tickets:', err.message);
  }
}

async function createTicket(interaction, ticketType) {
  const guild = interaction.guild;
  const user = interaction.user;
  const typeConfig = config.TICKET_TYPES[ticketType];
  if (!typeConfig) return;

  // Check existing open ticket of same type
  const existing = [...openTickets.values()].find(
    (t) => t.ownerId === user.id && t.type === ticketType
  );
  if (existing) {
    await interaction.reply({ content: 'لديك تكت مفتوح من هذا النوع بالفعل.', ephemeral: true });
    return;
  }

  // Get next number from DB (starts from 1, incrementing)
  const ticketNum = await db.getNextTicketNumber();

  // Format: ticket-1-username, ticket-2-username ...
  const cleanUsername = user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) || 'user';
  const channelName = `ticket-${ticketNum}-${cleanUsername}`;

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: config.TICKET_CATEGORY_ID,
    permissionOverwrites: [
      { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
        ],
      },
      {
        id: typeConfig.adminRole,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageMessages,
          PermissionFlagsBits.AttachFiles,
        ],
      },
    ],
  });

  // Save to DB
  await db.saveTicket({
    channelId: channel.id,
    guildId: guild.id,
    type: ticketType,
    ownerId: user.id,
    number: ticketNum,
  });

  // Save to memory cache
  openTickets.set(channel.id, {
    type: ticketType,
    ownerId: user.id,
    claimedBy: null,
    openedAt: new Date(),
    number: ticketNum,
  });

  const embed = new EmbedBuilder()
    .setTitle(typeConfig.title)
    .setDescription(config.RULES_DESCRIPTION)
    .setImage(config.IMAGE_URL)
    .setColor(config.EMBED_COLOR)
    .setFooter({ text: 'Developed by firas' })
    .setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ticket_senior_${channel.id}`).setLabel('استدعاء عليا').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`ticket_support_${channel.id}`).setLabel('استدعاء سبورت').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`ticket_claim_${channel.id}`).setLabel('استلام تكت').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`ticket_close_${channel.id}`).setLabel('اغلاق').setStyle(ButtonStyle.Danger)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`ticket_manage_${channel.id}`)
      .setPlaceholder('تعديل التذكرة')
      .addOptions([
        { label: 'استدعاء صاحب التذكرة', value: 'call_owner', emoji: '📣' },
        { label: 'تعديل اسم التذكرة', value: 'rename', emoji: '✏️' },
        { label: 'اضافة عضو للتذكرة', value: 'add_member', emoji: '➕' },
        { label: 'ازالة عضو من التذكرة', value: 'remove_member', emoji: '➖' },
      ])
  );

  await channel.send({
    content: `<@${user.id}> <@&${typeConfig.adminRole}>`,
    embeds: [embed],
    components: [row1, row2],
  });

  await interaction.editReply({ content: `تم فتح التكت: ${channel}` });
}

async function closeTicket(interaction, channelId) {
  const channel = interaction.guild.channels.cache.get(channelId);
  if (!channel) return;
  const ticketData = openTickets.get(channelId);
  if (!ticketData) return;

  // Fetch messages for transcript
  const messages = await channel.messages.fetch({ limit: 100 });
  const sorted = [...messages.values()].reverse();
  const htmlContent = generateTranscriptHTML(sorted, ticketData, channel.name);

  // Update DB
  await db.closeTicketDB(channelId, interaction.user.id);

  // Send to log channel
  const logChannel = interaction.guild.channels.cache.get(config.LOG_CHANNEL_ID);
  if (logChannel) {
    const typeConfig = config.TICKET_TYPES[ticketData.type];
    const logEmbed = new EmbedBuilder()
      .setTitle('تم اغلاق تكت')
      .addFields(
        { name: 'رقم التكت', value: `#${ticketData.number}`, inline: true },
        { name: 'صاحب التكت', value: `<@${ticketData.ownerId}>`, inline: true },
        { name: 'النوع', value: typeConfig?.label || ticketData.type, inline: true },
        { name: 'اغلق بواسطة', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'اسم القناة', value: channel.name, inline: true },
        { name: 'وقت الفتح', value: ticketData.openedAt.toLocaleString('ar-SA'), inline: true },
      )
      .setColor(0xe74c3c)
      .setFooter({ text: 'Developed by firas' })
      .setTimestamp();

    const buf = Buffer.from(htmlContent, 'utf-8');
    const attachment = new AttachmentBuilder(buf, { name: `transcript-${channel.name}.html` });
    await logChannel.send({ embeds: [logEmbed], files: [attachment] });
  }

  openTickets.delete(channelId);
  await interaction.channel.send({
    embeds: [new EmbedBuilder()
      .setDescription('جاري اغلاق التكت...')
      .setColor(0xe74c3c)
      .setFooter({ text: 'Developed by firas' })]
  });
  setTimeout(() => channel.delete().catch(() => {}), 3000);
}

function generateTranscriptHTML(messages, ticketData, channelName) {
  const typeConfig = config.TICKET_TYPES[ticketData.type];
  const rows = messages.map((msg) => {
    const time = msg.createdAt.toLocaleString('ar-SA');
    const content = msg.content || (msg.embeds.length ? '[Embed Message]' : '[No Content]');
    const attachments = msg.attachments.size > 0
      ? [...msg.attachments.values()].map(a => `<a href="${a.url}" target="_blank">[مرفق: ${escapeHtml(a.name)}]</a>`).join(' ')
      : '';
    return `
      <div class="message">
        <div class="meta">
          <span class="author">${escapeHtml(msg.author.username)}</span>
          <span class="time">${time}</span>
        </div>
        <div class="content">${escapeHtml(content)} ${attachments}</div>
      </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>Transcript - ${channelName}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Arial,sans-serif;background:#0e0e1a;color:#e0e0e0;padding:24px}
  h1{color:#9b59ff;margin-bottom:16px;font-size:22px}
  .info{background:#1a1a30;border:1px solid #7b2dff44;padding:14px;border-radius:10px;margin-bottom:20px;display:flex;gap:20px;flex-wrap:wrap}
  .info span{color:#aaa;font-size:13px}.info strong{color:#c084fc}
  .messages{display:flex;flex-direction:column;gap:6px}
  .message{padding:10px 14px;background:#16162a;border-radius:8px;border-right:3px solid #7b2dff}
  .meta{font-size:11px;color:#888;margin-bottom:4px;display:flex;gap:12px}
  .author{font-weight:bold;color:#a78bfa}
  .content{white-space:pre-wrap;font-size:14px;word-break:break-word}
  a{color:#818cf8}
</style>
</head>
<body>
<h1>سجل التكت - ${channelName}</h1>
<div class="info">
  <span>رقم التكت: <strong>#${ticketData.number}</strong></span>
  <span>صاحب التكت: <strong>${ticketData.ownerId}</strong></span>
  <span>نوع التكت: <strong>${typeConfig?.label || ticketData.type}</strong></span>
  <span>عدد الرسائل: <strong>${messages.length}</strong></span>
</div>
<div class="messages">${rows}</div>
</body>
</html>`;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = { createTicket, closeTicket, openTickets, loadOpenTickets };
