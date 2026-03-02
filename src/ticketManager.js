const {
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelType,
} = require('discord.js');
const config = require('./config');

const openTickets = new Map(); // channelId -> { type, ownerId, claimedBy }

async function createTicket(interaction, ticketType) {
  const guild = interaction.guild;
  const user = interaction.user;
  const typeConfig = config.TICKET_TYPES[ticketType];

  if (!typeConfig) return;

  // Check if user already has an open ticket of this type
  const existing = [...openTickets.values()].find(
    (t) => t.ownerId === user.id && t.type === ticketType
  );
  if (existing) {
    await interaction.reply({
      content: 'لديك تكت مفتوح بالفعل.',
      ephemeral: true,
    });
    return;
  }

  const ticketName = `ticket-${ticketType}-${user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32);

  const channel = await guild.channels.create({
    name: ticketName,
    type: ChannelType.GuildText,
    parent: config.TICKET_CATEGORY_ID,
    permissionOverwrites: [
      {
        id: guild.roles.everyone,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
      {
        id: typeConfig.adminRole,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageMessages,
        ],
      },
    ],
  });

  openTickets.set(channel.id, { type: ticketType, ownerId: user.id, claimedBy: null });

  const embed = new EmbedBuilder()
    .setTitle(typeConfig.title)
    .setDescription(config.RULES_DESCRIPTION)
    .setImage(config.IMAGE_URL)
    .setColor(0x2b2d31)
    .setFooter({ text: 'Developed by firas' })
    .setTimestamp();

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_senior_${channel.id}`)
      .setLabel('استدعاء عليا')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`ticket_support_${channel.id}`)
      .setLabel('استدعاء سبورت')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`ticket_claim_${channel.id}`)
      .setLabel('استلام تكت')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`ticket_close_${channel.id}`)
      .setLabel('اغلاق')
      .setStyle(ButtonStyle.Danger)
  );

  const dropdown = new ActionRowBuilder().addComponents(
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
    components: [buttons, dropdown],
  });

  await interaction.reply({ content: `تم فتح التكت: ${channel}`, ephemeral: true });
}

async function closeTicket(interaction, channelId) {
  const channel = interaction.guild.channels.cache.get(channelId);
  if (!channel) return;

  const ticketData = openTickets.get(channelId);
  if (!ticketData) return;

  // Generate HTML transcript
  const messages = await channel.messages.fetch({ limit: 100 });
  const sortedMessages = [...messages.values()].reverse();

  const htmlContent = generateTranscriptHTML(sortedMessages, ticketData, channel.name);

  // Send to log channel
  const logChannel = interaction.guild.channels.cache.get(config.LOG_CHANNEL_ID);
  if (logChannel) {
    const owner = await interaction.guild.members.fetch(ticketData.ownerId).catch(() => null);
    const typeConfig = config.TICKET_TYPES[ticketData.type];

    const logEmbed = new EmbedBuilder()
      .setTitle('تم اغلاق تكت')
      .addFields(
        { name: 'صاحب التكت', value: owner ? `<@${ticketData.ownerId}>` : ticketData.ownerId, inline: true },
        { name: 'نوع التكت', value: typeConfig ? typeConfig.label : ticketData.type, inline: true },
        { name: 'اسم القناة', value: channel.name, inline: true },
        { name: 'اغلق بواسطة', value: `<@${interaction.user.id}>`, inline: true }
      )
      .setColor(0xe74c3c)
      .setFooter({ text: 'Developed by firas' })
      .setTimestamp();

    const { AttachmentBuilder } = require('discord.js');
    const buffer = Buffer.from(htmlContent, 'utf-8');
    const attachment = new AttachmentBuilder(buffer, { name: `transcript-${channel.name}.html` });

    await logChannel.send({ embeds: [logEmbed], files: [attachment] });
  }

  openTickets.delete(channelId);
  await interaction.reply({ content: 'جاري اغلاق التكت...' });
  setTimeout(() => channel.delete().catch(() => {}), 3000);
}

function generateTranscriptHTML(messages, ticketData, channelName) {
  const typeConfig = config.TICKET_TYPES[ticketData.type];
  const rows = messages.map((msg) => {
    const time = msg.createdAt.toLocaleString('ar-SA');
    const content = msg.content || (msg.embeds.length ? '[Embed]' : '[No Content]');
    return `
      <div class="message">
        <div class="meta">
          <span class="author">${msg.author.username}</span>
          <span class="time">${time}</span>
        </div>
        <div class="content">${escapeHtml(content)}</div>
      </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>Transcript - ${channelName}</title>
<style>
  body { font-family: Arial, sans-serif; background: #1a1a2e; color: #eee; padding: 20px; }
  h1 { color: #7289da; }
  .info { background: #16213e; padding: 10px; border-radius: 8px; margin-bottom: 20px; }
  .message { padding: 8px 12px; margin: 6px 0; background: #0f3460; border-radius: 6px; }
  .meta { font-size: 12px; color: #aaa; margin-bottom: 4px; }
  .author { font-weight: bold; color: #7289da; margin-left: 10px; }
  .content { white-space: pre-wrap; }
</style>
</head>
<body>
<h1>سجل التكت - ${channelName}</h1>
<div class="info">
  <p>صاحب التكت: ${ticketData.ownerId}</p>
  <p>نوع التكت: ${typeConfig ? typeConfig.label : ticketData.type}</p>
</div>
${rows}
</body>
</html>`;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = { createTicket, closeTicket, openTickets };
