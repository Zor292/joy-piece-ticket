const {
  EmbedBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const config = require('./config');
const { openTickets } = require('./ticketManager');
const db     = require('./database');
const { sendV2 } = require('./rest');

function isAdmin(member) {
  return member.permissions.has(PermissionFlagsBits.Administrator) ||
         member.permissions.has(PermissionFlagsBits.ManageGuild);
}
function isMod(member) {
  return isAdmin(member) || member.permissions.has(PermissionFlagsBits.ModerateMembers);
}
function embed(title, desc, fields = []) {
  const e = new EmbedBuilder().setColor(config.EMBED_COLOR).setFooter({ text: 'Developed by firas' }).setTimestamp();
  if (title) e.setTitle(title);
  if (desc)  e.setDescription(desc);
  if (fields.length) e.addFields(fields);
  return e;
}

async function handleCommand(message, client) {
  if (!message.content.startsWith(config.PREFIX) || message.author.bot) return;
  const args    = message.content.slice(config.PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  const guild   = message.guild;
  const member  = message.member;

  // ══════════════════════════════════════════
  //  TICKET COMMANDS
  // ══════════════════════════════════════════

  if (command === 'tickets') {
    if (!isAdmin(member)) return message.reply({ embeds: [embed(null, 'ليس لديك صلاحية.')] });

    const mainSections = config.MAIN_TICKETS.map(key => {
      const t = config.TICKET_TYPES[key];
      return {
        type: 9,
        components: [{ type: 10, content: `${t.emoji}  **--> ${t.label}**\n${t.desc}` }],
        accessory: { type: 2, custom_id: `open_ticket_btn_${key}`, label: '-->', style: 2, emoji: { name: t.emoji } },
      };
    });

    const extraOptions = config.EXTRA_TICKETS.map(key => {
      const t = config.TICKET_TYPES[key];
      return { label: t.label, value: key, description: t.desc, emoji: { name: t.emoji } };
    });

    const container = {
      type: 17,
      accent_color: config.EMBED_COLOR,
      components: [
        { type: 11, items: [{ media: { url: config.IMAGE_URL } }] },
        { type: 10, content: `## مرحباً بك في قائمة الدعم الفني لـ JoyPiece\nلمساعدتك في حل المشكلات والشكاوى، يمكنك فتح تذكرة من القائمة أدناه.\n\n**قبل فتح اي تكت يرجى قراءة القوانين التالية والالتزام بها**` },
        { type: 14 },
        { type: 10, content: config.RULES_DESCRIPTION },
        { type: 14 },
        ...mainSections,
        { type: 14 },
        {
          type: 1,
          components: [{
            type: 3,
            custom_id: 'open_ticket_type_extra',
            placeholder: '... أخرى',
            options: extraOptions,
          }],
        },
        { type: 14 },
        { type: 10, content: `-# Developed by firas • JoyPiece Ticket System` },
      ],
    };

    try {
      await sendV2(message.channel.id, { components: [container] }, process.env.DISCORD_TOKEN);
      await message.delete().catch(() => {});
    } catch (err) {
      console.error('[tickets cmd error]', err.message);
      // Fallback: plain embed if V2 fails
      const { EmbedBuilder: EB, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
      const fb = new EB()
        .setTitle('نظام التذاكر — JoyPiece')
        .setDescription('اختر نوع التذكرة من القائمة أدناه.')
        .setImage(config.IMAGE_URL)
        .setColor(config.EMBED_COLOR)
        .setFooter({ text: 'Developed by firas' });
      const dd = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('open_ticket_type')
          .setPlaceholder('اختر نوع التذكرة')
          .addOptions(Object.entries(config.TICKET_TYPES).map(([k, v]) => ({ label: v.label, value: k, emoji: v.emoji })))
      );
      await message.channel.send({ embeds: [fb], components: [dd] });
      await message.delete().catch(() => {});
    }
    return;
  }

  if (command === 'close') {
    const ticketData = openTickets.get(message.channel.id);
    if (!ticketData) return message.reply({ embeds: [embed(null, 'هذه القناة ليست تكتاً.')] });
    const typeConfig = config.TICKET_TYPES[ticketData.type];
    const canClose = member.roles.cache.has(typeConfig.adminRole) || member.id === ticketData.ownerId || isAdmin(member);
    if (!canClose) return message.reply({ embeds: [embed(null, 'ليس لديك صلاحية اغلاق هذا التكت.')] });
    const { closeTicket } = require('./ticketManager');
    await closeTicket({ guild, user: message.author, channel: message.channel }, message.channel.id);
    return;
  }

  if (command === 'add') {
    const ticketData = openTickets.get(message.channel.id);
    if (!ticketData) return message.reply({ embeds: [embed(null, 'هذه القناة ليست تكتاً.')] });
    if (!isMod(member)) return message.reply({ embeds: [embed(null, 'ليس لديك صلاحية.')] });
    const target = message.mentions.members.first();
    if (!target) return message.reply({ embeds: [embed(null, 'الرجاء منشنة العضو.')] });
    await message.channel.permissionOverwrites.create(target.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
    return message.reply({ embeds: [embed(null, `تم اضافة ${target} للتكت.`)] });
  }

  if (command === 'remove') {
    const ticketData = openTickets.get(message.channel.id);
    if (!ticketData) return message.reply({ embeds: [embed(null, 'هذه القناة ليست تكتاً.')] });
    if (!isMod(member)) return message.reply({ embeds: [embed(null, 'ليس لديك صلاحية.')] });
    const target = message.mentions.members.first();
    if (!target) return message.reply({ embeds: [embed(null, 'الرجاء منشنة العضو.')] });
    if (target.id === openTickets.get(message.channel.id)?.ownerId) return message.reply({ embeds: [embed(null, 'لا يمكن ازالة صاحب التكت.')] });
    await message.channel.permissionOverwrites.delete(target.id);
    return message.reply({ embeds: [embed(null, `تم ازالة ${target} من التكت.`)] });
  }

  if (command === 'rename') {
    const ticketData = openTickets.get(message.channel.id);
    if (!ticketData) return message.reply({ embeds: [embed(null, 'هذه القناة ليست تكتاً.')] });
    if (!isMod(member)) return message.reply({ embeds: [embed(null, 'ليس لديك صلاحية.')] });
    const newName = args.join('-').toLowerCase().slice(0, 50);
    if (!newName) return message.reply({ embeds: [embed(null, 'الرجاء ادخال الاسم الجديد.')] });
    await message.channel.setName(newName);
    return message.reply({ embeds: [embed(null, `تم تغيير اسم القناة الى: **${newName}**`)] });
  }

  if (command === 'claim') {
    const ticketData = openTickets.get(message.channel.id);
    if (!ticketData) return message.reply({ embeds: [embed(null, 'هذه القناة ليست تكتاً.')] });
    const typeConfig = config.TICKET_TYPES[ticketData.type];
    if (!member.roles.cache.has(typeConfig.adminRole) && !isAdmin(member)) return message.reply({ embeds: [embed(null, 'ليس لديك صلاحية.')] });
    if (ticketData.claimedBy) return message.reply({ embeds: [embed(null, `التكت تم استلامه بالفعل من <@${ticketData.claimedBy}>.`)] });
    ticketData.claimedBy = message.author.id;
    openTickets.set(message.channel.id, ticketData);
    await db.updateTicket(message.channel.id, { claimedBy: message.author.id });
    return message.reply({ embeds: [embed(null, `تم استلام التكت بواسطة ${message.author}.`)] });
  }

  if (command === 'ticketinfo') {
    const ticketData = openTickets.get(message.channel.id);
    if (!ticketData) return message.reply({ embeds: [embed(null, 'هذه القناة ليست تكتاً.')] });
    const typeConfig = config.TICKET_TYPES[ticketData.type];
    return message.reply({ embeds: [embed('معلومات التكت', null, [
      { name: 'صاحب التكت', value: `<@${ticketData.ownerId}>`, inline: true },
      { name: 'النوع', value: typeConfig?.label || ticketData.type, inline: true },
      { name: 'الرقم', value: `#${ticketData.number}`, inline: true },
      { name: 'المستلم', value: ticketData.claimedBy ? `<@${ticketData.claimedBy}>` : 'لم يستلم بعد', inline: true },
      { name: 'وقت الفتح', value: ticketData.openedAt.toLocaleString('ar-SA'), inline: true },
    ])] });
  }

  if (command === 'tickets-list') {
    if (!isAdmin(member)) return message.reply({ embeds: [embed(null, 'ليس لديك صلاحية.')] });
    const tickets = await db.getAllOpenTickets(guild.id);
    if (!tickets.length) return message.reply({ embeds: [embed('التذاكر المفتوحة', 'لا توجد تذاكر مفتوحة.')] });
    const list = tickets.map(t => `**#${t.number}** | <#${t.channelId}> | <@${t.ownerId}> | ${config.TICKET_TYPES[t.type]?.label || t.type}`).join('\n');
    return message.reply({ embeds: [embed(`التذاكر المفتوحة (${tickets.length})`, list)] });
  }

  // ══════════════════════════════════════════
  //  MODERATION
  // ══════════════════════════════════════════

  if (command === 'ban') {
    if (!member.permissions.has(PermissionFlagsBits.BanMembers)) return message.reply({ embeds: [embed(null, 'ليس لديك صلاحية.')] });
    const target = message.mentions.members.first();
    if (!target) return message.reply({ embeds: [embed(null, 'الرجاء منشنة العضو.')] });
    const reason = args.slice(1).join(' ') || 'لم يذكر سبب';
    await target.ban({ reason });
    return message.reply({ embeds: [embed('تم حظر العضو', `تم حظر ${target.user.username}\n**السبب:** ${reason}`)] });
  }

  if (command === 'unban') {
    if (!member.permissions.has(PermissionFlagsBits.BanMembers)) return message.reply({ embeds: [embed(null, 'ليس لديك صلاحية.')] });
    const userId = args[0];
    if (!userId) return message.reply({ embeds: [embed(null, 'الرجاء ادخال ID العضو.')] });
    await guild.bans.remove(userId).catch(() => {});
    return message.reply({ embeds: [embed(null, `تم رفع الحظر عن: \`${userId}\``)] });
  }

  if (command === 'kick') {
    if (!member.permissions.has(PermissionFlagsBits.KickMembers)) return message.reply({ embeds: [embed(null, 'ليس لديك صلاحية.')] });
    const target = message.mentions.members.first();
    if (!target) return message.reply({ embeds: [embed(null, 'الرجاء منشنة العضو.')] });
    const reason = args.slice(1).join(' ') || 'لم يذكر سبب';
    await target.kick(reason);
    return message.reply({ embeds: [embed('تم طرد العضو', `تم طرد ${target.user.username}\n**السبب:** ${reason}`)] });
  }

  if (command === 'mute') {
    if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) return message.reply({ embeds: [embed(null, 'ليس لديك صلاحية.')] });
    const target = message.mentions.members.first();
    if (!target) return message.reply({ embeds: [embed(null, 'الرجاء منشنة العضو.')] });
    const minutes = parseInt(args[1]) || 10;
    await target.timeout(minutes * 60000, args.slice(2).join(' ') || 'لم يذكر سبب');
    return message.reply({ embeds: [embed('تم كتم العضو', `تم كتم ${target.user.username} لمدة ${minutes} دقيقة.`)] });
  }

  if (command === 'unmute') {
    if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) return message.reply({ embeds: [embed(null, 'ليس لديك صلاحية.')] });
    const target = message.mentions.members.first();
    if (!target) return message.reply({ embeds: [embed(null, 'الرجاء منشنة العضو.')] });
    await target.timeout(null);
    return message.reply({ embeds: [embed(null, `تم رفع الكتم عن ${target.user.username}.`)] });
  }

  if (command === 'warn') {
    if (!isMod(member)) return message.reply({ embeds: [embed(null, 'ليس لديك صلاحية.')] });
    const target = message.mentions.users.first();
    if (!target) return message.reply({ embeds: [embed(null, 'الرجاء منشنة العضو.')] });
    const reason = args.slice(1).join(' ') || 'لم يذكر سبب';
    const result = await db.addWarning(guild.id, target.id, reason, message.author.id);
    const count = result.warns.length;
    try { await target.send({ embeds: [embed('تحذير', `تلقيت تحذيراً في **${guild.name}**\n**السبب:** ${reason}\n**عدد تحذيراتك:** ${count}`)] }); } catch {}
    return message.reply({ embeds: [embed('تم تحذير العضو', `تم تحذير ${target.username}\n**السبب:** ${reason}\n**مجموع التحذيرات:** ${count}`)] });
  }

  if (command === 'warns') {
    const target = message.mentions.users.first() || message.author;
    const data = await db.getWarnings(guild.id, target.id);
    const warns = data?.warns || [];
    if (!warns.length) return message.reply({ embeds: [embed(null, `${target.username} ليس لديه تحذيرات.`)] });
    const list = warns.map((w, i) => `**${i+1}.** ${w.reason} — <@${w.moderator}>`).join('\n');
    return message.reply({ embeds: [embed(`تحذيرات ${target.username} (${warns.length})`, list)] });
  }

  if (command === 'clearwarns') {
    if (!isMod(member)) return message.reply({ embeds: [embed(null, 'ليس لديك صلاحية.')] });
    const target = message.mentions.users.first();
    if (!target) return message.reply({ embeds: [embed(null, 'الرجاء منشنة العضو.')] });
    await db.clearWarnings(guild.id, target.id);
    return message.reply({ embeds: [embed(null, `تم مسح تحذيرات ${target.username}.`)] });
  }

  if (command === 'clear' || command === 'purge') {
    if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) return message.reply({ embeds: [embed(null, 'ليس لديك صلاحية.')] });
    const amount = parseInt(args[0]);
    if (!amount || amount < 1 || amount > 100) return message.reply({ embeds: [embed(null, 'الرجاء ادخال عدد من 1 الى 100.')] });
    const deleted = await message.channel.bulkDelete(amount + 1, true);
    const r = await message.channel.send({ embeds: [embed(null, `تم حذف ${deleted.size - 1} رسالة.`)] });
    setTimeout(() => r.delete().catch(() => {}), 3000);
    return;
  }

  if (command === 'slowmode') {
    if (!member.permissions.has(PermissionFlagsBits.ManageChannels)) return message.reply({ embeds: [embed(null, 'ليس لديك صلاحية.')] });
    const sec = parseInt(args[0]) || 0;
    await message.channel.setRateLimitPerUser(sec);
    return message.reply({ embeds: [embed(null, sec === 0 ? 'تم ايقاف السلو مود.' : `تم تفعيل السلو مود: ${sec} ثانية.`)] });
  }

  if (command === 'lock') {
    if (!member.permissions.has(PermissionFlagsBits.ManageChannels)) return message.reply({ embeds: [embed(null, 'ليس لديك صلاحية.')] });
    await message.channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
    return message.reply({ embeds: [embed('القناة مقفلة', 'تم قفل هذه القناة.')] });
  }

  if (command === 'unlock') {
    if (!member.permissions.has(PermissionFlagsBits.ManageChannels)) return message.reply({ embeds: [embed(null, 'ليس لديك صلاحية.')] });
    await message.channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null });
    return message.reply({ embeds: [embed('القناة مفتوحة', 'تم فتح هذه القناة.')] });
  }

  if (command === 'lockdown') {
    if (!isAdmin(member)) return message.reply({ embeds: [embed(null, 'ليس لديك صلاحية.')] });
    let count = 0;
    for (const [, ch] of guild.channels.cache.filter(c => c.type === 0)) {
      await ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false }).catch(() => {}); count++;
    }
    return message.reply({ embeds: [embed('Lockdown', `تم قفل ${count} قناة.`)] });
  }

  if (command === 'unlockdown') {
    if (!isAdmin(member)) return message.reply({ embeds: [embed(null, 'ليس لديك صلاحية.')] });
    for (const [, ch] of guild.channels.cache.filter(c => c.type === 0)) {
      await ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null }).catch(() => {});
    }
    return message.reply({ embeds: [embed(null, 'تم فتح جميع القنوات.')] });
  }

  if (command === 'nick') {
    if (!member.permissions.has(PermissionFlagsBits.ManageNicknames)) return message.reply({ embeds: [embed(null, 'ليس لديك صلاحية.')] });
    const target = message.mentions.members.first();
    if (!target) return message.reply({ embeds: [embed(null, 'الرجاء منشنة العضو.')] });
    const nick = args.slice(1).join(' ') || null;
    await target.setNickname(nick);
    return message.reply({ embeds: [embed(null, nick ? `تم تغيير لقب ${target.user.username} الى: ${nick}` : `تم ازالة لقب ${target.user.username}.`)] });
  }

  if (command === 'role-add') {
    if (!member.permissions.has(PermissionFlagsBits.ManageRoles)) return message.reply({ embeds: [embed(null, 'ليس لديك صلاحية.')] });
    const target = message.mentions.members.first();
    const role   = message.mentions.roles.first();
    if (!target || !role) return message.reply({ embeds: [embed(null, 'الرجاء منشنة العضو والرتبة.')] });
    await target.roles.add(role);
    return message.reply({ embeds: [embed(null, `تم اضافة رتبة ${role.name} الى ${target.user.username}.`)] });
  }

  if (command === 'role-remove') {
    if (!member.permissions.has(PermissionFlagsBits.ManageRoles)) return message.reply({ embeds: [embed(null, 'ليس لديك صلاحية.')] });
    const target = message.mentions.members.first();
    const role   = message.mentions.roles.first();
    if (!target || !role) return message.reply({ embeds: [embed(null, 'الرجاء منشنة العضو والرتبة.')] });
    await target.roles.remove(role);
    return message.reply({ embeds: [embed(null, `تم ازالة رتبة ${role.name} من ${target.user.username}.`)] });
  }

  if (command === 'massrole') {
    if (!isAdmin(member)) return message.reply({ embeds: [embed(null, 'ليس لديك صلاحية.')] });
    const role = message.mentions.roles.first();
    if (!role) return message.reply({ embeds: [embed(null, 'الرجاء منشنة الرتبة.')] });
    await guild.members.fetch();
    let count = 0;
    for (const [, m] of guild.members.cache.filter(m => !m.user.bot)) { await m.roles.add(role).catch(() => {}); count++; }
    return message.reply({ embeds: [embed(null, `تم اضافة رتبة ${role.name} لـ ${count} عضو.`)] });
  }

  if (command === 'removeallrole') {
    if (!isAdmin(member)) return message.reply({ embeds: [embed(null, 'ليس لديك صلاحية.')] });
    const role = message.mentions.roles.first();
    if (!role) return message.reply({ embeds: [embed(null, 'الرجاء منشنة الرتبة.')] });
    const withRole = guild.members.cache.filter(m => m.roles.cache.has(role.id));
    let count = 0;
    for (const [, m] of withRole) { await m.roles.remove(role).catch(() => {}); count++; }
    return message.reply({ embeds: [embed(null, `تم ازالة رتبة ${role.name} من ${count} عضو.`)] });
  }

  if (command === 'banlist') {
    if (!member.permissions.has(PermissionFlagsBits.BanMembers)) return message.reply({ embeds: [embed(null, 'ليس لديك صلاحية.')] });
    const bans = await guild.bans.fetch();
    const list = bans.map(b => `\`${b.user.username}\` (${b.user.id})`).slice(0, 20).join('\n');
    return message.reply({ embeds: [embed('المحظورون', list || 'لا يوجد.')] });
  }

  // ══════════════════════════════════════════
  //  INFO COMMANDS
  // ══════════════════════════════════════════

  if (command === 'userinfo') {
    const target = message.mentions.members.first() || member;
    const u = target.user;
    return message.reply({ embeds: [new EmbedBuilder()
      .setTitle(`معلومات ${u.username}`).setThumbnail(u.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: 'ID', value: u.id, inline: true },
        { name: 'انضمام', value: target.joinedAt.toLocaleDateString('ar-SA'), inline: true },
        { name: 'انشاء الحساب', value: u.createdAt.toLocaleDateString('ar-SA'), inline: true },
        { name: 'الرتب', value: target.roles.cache.filter(r => r.id !== guild.id).map(r => r.toString()).join(' ') || 'لا توجد', inline: false },
      ).setColor(config.EMBED_COLOR).setFooter({ text: 'Developed by firas' }).setTimestamp()] });
  }

  if (command === 'serverinfo') {
    return message.reply({ embeds: [new EmbedBuilder()
      .setTitle(guild.name).setThumbnail(guild.iconURL({ dynamic: true }))
      .addFields(
        { name: 'ID', value: guild.id, inline: true },
        { name: 'المالك', value: `<@${guild.ownerId}>`, inline: true },
        { name: 'الاعضاء', value: guild.memberCount.toString(), inline: true },
        { name: 'القنوات', value: guild.channels.cache.size.toString(), inline: true },
        { name: 'الرتب', value: guild.roles.cache.size.toString(), inline: true },
        { name: 'الانشاء', value: guild.createdAt.toLocaleDateString('ar-SA'), inline: true },
      ).setColor(config.EMBED_COLOR).setFooter({ text: 'Developed by firas' }).setTimestamp()] });
  }

  if (command === 'roleinfo') {
    const role = message.mentions.roles.first();
    if (!role) return message.reply({ embeds: [embed(null, 'الرجاء منشنة الرتبة.')] });
    return message.reply({ embeds: [embed(`رتبة ${role.name}`, null, [
      { name: 'ID', value: role.id, inline: true },
      { name: 'اللون', value: role.hexColor, inline: true },
      { name: 'الاعضاء', value: role.members.size.toString(), inline: true },
      { name: 'قابل للمنشن', value: role.mentionable ? 'نعم' : 'لا', inline: true },
    ])] });
  }

  if (command === 'avatar') {
    const target = message.mentions.users.first() || message.author;
    return message.reply({ embeds: [new EmbedBuilder().setTitle(`صورة ${target.username}`).setImage(target.displayAvatarURL({ dynamic: true, size: 1024 })).setColor(config.EMBED_COLOR).setFooter({ text: 'Developed by firas' })] });
  }

  if (command === 'ping')      return message.reply({ embeds: [embed('Ping', `البينج: **${client.ws.ping}ms**`)] });
  if (command === 'uptime') {
    const ms = client.uptime;
    return message.reply({ embeds: [embed('Uptime', `**${Math.floor(ms/3600000)}** ساعة, **${Math.floor((ms/60000)%60)}** دقيقة`)] });
  }

  if (command === 'botinfo') {
    return message.reply({ embeds: [embed('معلومات البوت', null, [
      { name: 'الاسم', value: client.user.username, inline: true },
      { name: 'ID', value: client.user.id, inline: true },
      { name: 'البينج', value: `${client.ws.ping}ms`, inline: true },
      { name: 'المطور', value: 'firas', inline: true },
    ])] });
  }

  if (command === 'members') {
    return message.reply({ embeds: [embed('الاعضاء', null, [
      { name: 'الكل', value: guild.memberCount.toString(), inline: true },
      { name: 'بشر', value: guild.members.cache.filter(m => !m.user.bot).size.toString(), inline: true },
      { name: 'بوتات', value: guild.members.cache.filter(m => m.user.bot).size.toString(), inline: true },
    ])] });
  }

  if (command === 'whois') {
    const target = message.mentions.members.first() || member;
    const perms = [];
    if (target.permissions.has(PermissionFlagsBits.Administrator)) perms.push('ادمن');
    if (target.permissions.has(PermissionFlagsBits.ManageGuild)) perms.push('ادارة السيرفر');
    if (target.permissions.has(PermissionFlagsBits.BanMembers)) perms.push('حظر');
    return message.reply({ embeds: [embed(`من هو ${target.user.username}`, null, [
      { name: 'ID', value: target.user.id, inline: true },
      { name: 'بوت', value: target.user.bot ? 'نعم' : 'لا', inline: true },
      { name: 'الرتبة الاعلى', value: target.roles.highest.toString(), inline: true },
      { name: 'الصلاحيات', value: perms.join(', ') || 'عادي', inline: false },
    ])] });
  }

  if (command === 'id') {
    const target = message.mentions.users.first() || message.author;
    return message.reply({ embeds: [embed(null, `ID: \`${target.id}\``)] });
  }

  if (command === 'joinpos') {
    const target = message.mentions.members.first() || member;
    const sorted = guild.members.cache.sort((a, b) => a.joinedTimestamp - b.joinedTimestamp);
    const pos = [...sorted.keys()].indexOf(target.id) + 1;
    return message.reply({ embeds: [embed(null, `${target.user.username} هو العضو رقم **${pos}** في السيرفر.`)] });
  }

  if (command === 'stats') {
    const ms = client.uptime;
    const totalTickets = await db.Ticket.countDocuments({ guildId: guild.id });
    const openCount    = await db.Ticket.countDocuments({ guildId: guild.id, status: 'open' });
    return message.reply({ embeds: [embed('احصائيات', null, [
      { name: 'Uptime', value: `${Math.floor(ms/3600000)}س ${Math.floor((ms/60000)%60)}د`, inline: true },
      { name: 'البينج', value: `${client.ws.ping}ms`, inline: true },
      { name: 'التذاكر المفتوحة', value: openCount.toString(), inline: true },
      { name: 'اجمالي التذاكر', value: totalTickets.toString(), inline: true },
    ])] });
  }

  // ══════════════════════════════════════════
  //  CHANNEL / ROLE TOOLS
  // ══════════════════════════════════════════

  if (command === 'topic') {
    if (!member.permissions.has(PermissionFlagsBits.ManageChannels)) return message.reply({ embeds: [embed(null, 'ليس لديك صلاحية.')] });
    await message.channel.setTopic(args.join(' '));
    return message.reply({ embeds: [embed(null, 'تم تغيير موضوع القناة.')] });
  }

  if (command === 'nuke') {
    if (!isAdmin(member)) return message.reply({ embeds: [embed(null, 'ليس لديك صلاحية.')] });
    const ch = message.channel;
    const newCh = await ch.clone();
    await ch.delete();
    return newCh.send({ embeds: [embed(null, 'تم نيوك القناة.')] });
  }

  if (command === 'create-channel') {
    if (!member.permissions.has(PermissionFlagsBits.ManageChannels)) return message.reply({ embeds: [embed(null, 'ليس لديك صلاحية.')] });
    const name = args[0];
    if (!name) return message.reply({ embeds: [embed(null, 'الرجاء ادخال اسم القناة.')] });
    const newCh = await guild.channels.create({ name, type: 0 });
    return message.reply({ embeds: [embed(null, `تم انشاء ${newCh}.`)] });
  }

  if (command === 'delete-channel') {
    if (!member.permissions.has(PermissionFlagsBits.ManageChannels)) return message.reply({ embeds: [embed(null, 'ليس لديك صلاحية.')] });
    const ch = message.mentions.channels.first() || message.channel;
    await ch.delete().catch(() => {});
    return;
  }

  if (command === 'create-role') {
    if (!member.permissions.has(PermissionFlagsBits.ManageRoles)) return message.reply({ embeds: [embed(null, 'ليس لديك صلاحية.')] });
    const name = args.join(' ');
    if (!name) return message.reply({ embeds: [embed(null, 'الرجاء ادخال اسم الرتبة.')] });
    const role = await guild.roles.create({ name });
    return message.reply({ embeds: [embed(null, `تم انشاء رتبة ${role}.`)] });
  }

  if (command === 'delete-role') {
    if (!member.permissions.has(PermissionFlagsBits.ManageRoles)) return message.reply({ embeds: [embed(null, 'ليس لديك صلاحية.')] });
    const role = message.mentions.roles.first();
    if (!role) return message.reply({ embeds: [embed(null, 'الرجاء منشنة الرتبة.')] });
    await role.delete();
    return message.reply({ embeds: [embed(null, `تم حذف رتبة **${role.name}**.`)] });
  }

  if (command === 'setcolor') {
    if (!member.permissions.has(PermissionFlagsBits.ManageRoles)) return message.reply({ embeds: [embed(null, 'ليس لديك صلاحية.')] });
    const role  = message.mentions.roles.first();
    const color = args[1];
    if (!role || !color) return message.reply({ embeds: [embed(null, '!setcolor @رتبة #لون')] });
    await role.setColor(color).catch(() => {});
    return message.reply({ embeds: [embed(null, `تم تغيير لون ${role.name} الى ${color}.`)] });
  }

  if (command === 'sethoist') {
    if (!member.permissions.has(PermissionFlagsBits.ManageRoles)) return message.reply({ embeds: [embed(null, 'ليس لديك صلاحية.')] });
    const role = message.mentions.roles.first();
    if (!role) return message.reply({ embeds: [embed(null, 'الرجاء منشنة الرتبة.')] });
    await role.setHoist(!role.hoist);
    return message.reply({ embeds: [embed(null, `تم ${role.hoist ? 'تفعيل' : 'ايقاف'} عرض الرتبة منفصلة.`)] });
  }

  if (command === 'setmentionable') {
    if (!member.permissions.has(PermissionFlagsBits.ManageRoles)) return message.reply({ embeds: [embed(null, 'ليس لديك صلاحية.')] });
    const role = message.mentions.roles.first();
    if (!role) return message.reply({ embeds: [embed(null, 'الرجاء منشنة الرتبة.')] });
    await role.setMentionable(!role.mentionable);
    return message.reply({ embeds: [embed(null, `تم تغيير منشن الرتبة.`)] });
  }

  // ══════════════════════════════════════════
  //  MESSAGES & ANNOUNCEMENTS
  // ══════════════════════════════════════════

  if (command === 'say') {
    if (!isMod(member)) return message.reply({ embeds: [embed(null, 'ليس لديك صلاحية.')] });
    const text = args.join(' ');
    if (!text) return message.reply({ embeds: [embed(null, 'الرجاء ادخال النص.')] });
    await message.delete().catch(() => {});
    return message.channel.send(text);
  }

  if (command === 'announce') {
    if (!isAdmin(member)) return message.reply({ embeds: [embed(null, 'ليس لديك صلاحية.')] });
    const ch   = message.mentions.channels.first();
    const text = args.slice(1).join(' ');
    if (!ch || !text) return message.reply({ embeds: [embed(null, '!announce #قناة النص')] });
    await message.delete().catch(() => {});
    return ch.send({ embeds: [embed('اعلان', text)] });
  }

  if (command === 'embed') {
    if (!isMod(member)) return message.reply({ embeds: [embed(null, 'ليس لديك صلاحية.')] });
    const text = args.join(' ');
    if (!text) return message.reply({ embeds: [embed(null, 'الرجاء ادخال النص.')] });
    await message.delete().catch(() => {});
    return message.channel.send({ embeds: [embed(null, text)] });
  }

  if (command === 'dm') {
    if (!isMod(member)) return message.reply({ embeds: [embed(null, 'ليس لديك صلاحية.')] });
    const target = message.mentions.users.first();
    const text   = args.slice(1).join(' ');
    if (!target || !text) return message.reply({ embeds: [embed(null, '!dm @عضو النص')] });
    try {
      await target.send({ embeds: [embed('رسالة من الادارة', text)] });
      return message.reply({ embeds: [embed(null, `تم الارسال الى ${target.username}.`)] });
    } catch {
      return message.reply({ embeds: [embed(null, 'تعذر الارسال.')] });
    }
  }

  if (command === 'poll') {
    if (!isMod(member)) return message.reply({ embeds: [embed(null, 'ليس لديك صلاحية.')] });
    const q = args.join(' ');
    if (!q) return message.reply({ embeds: [embed(null, 'الرجاء ادخال السؤال.')] });
    await message.delete().catch(() => {});
    const p = await message.channel.send({ embeds: [embed('تصويت', q)] });
    await p.react('✅'); await p.react('❌');
    return;
  }

  if (command === 'pin') {
    if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) return message.reply({ embeds: [embed(null, 'ليس لديك صلاحية.')] });
    const msg = await message.channel.messages.fetch(args[0]).catch(() => null);
    if (!msg) return message.reply({ embeds: [embed(null, 'لم يتم العثور على الرسالة.')] });
    await msg.pin();
    return message.reply({ embeds: [embed(null, 'تم تثبيت الرسالة.')] });
  }

  if (command === 'unpin') {
    if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) return message.reply({ embeds: [embed(null, 'ليس لديك صلاحية.')] });
    const msg = await message.channel.messages.fetch(args[0]).catch(() => null);
    if (!msg) return message.reply({ embeds: [embed(null, 'لم يتم العثور على الرسالة.')] });
    await msg.unpin();
    return message.reply({ embeds: [embed(null, 'تم ازالة التثبيت.')] });
  }

  if (command === 'repeat') {
    if (!isMod(member)) return message.reply({ embeds: [embed(null, 'ليس لديك صلاحية.')] });
    const times = Math.min(parseInt(args[0]) || 1, 5);
    const text  = args.slice(1).join(' ');
    if (!text) return message.reply({ embeds: [embed(null, 'الرجاء ادخال النص.')] });
    for (let i = 0; i < times; i++) await message.channel.send(text);
    return;
  }

  // ══════════════════════════════════════════
  //  FUN / MISC
  // ══════════════════════════════════════════

  if (command === '8ball') {
    const q = args.join(' ');
    if (!q) return message.reply({ embeds: [embed(null, 'الرجاء ادخال سؤال.')] });
    const ans = ['نعم','لا','ربما','بالتأكيد','لا أعتقد','الأمور غير واضحة','اسأل مرة أخرى','بالتأكيد لا'];
    return message.reply({ embeds: [embed('كرة السحر 🎱', `**السؤال:** ${q}\n**الجواب:** ${ans[Math.floor(Math.random()*ans.length)]}`)] });
  }

  if (command === 'coin')   return message.reply({ embeds: [embed('عملة', `النتيجة: **${Math.random()<.5?'وجه':'كتابة'}**`)] });
  if (command === 'dice') {
    const s = parseInt(args[0]) || 6;
    return message.reply({ embeds: [embed('زهر', `النتيجة: **${Math.floor(Math.random()*s)+1}** / ${s}`)] });
  }

  if (command === 'choose') {
    const opts = args.join(' ').split(',').map(s => s.trim()).filter(Boolean);
    if (opts.length < 2) return message.reply({ embeds: [embed(null, 'ادخل خيارين مفصولين بفاصلة.')] });
    return message.reply({ embeds: [embed(null, `اخترت: **${opts[Math.floor(Math.random()*opts.length)]}**`)] });
  }

  if (command === 'afk') {
    if (!guild._afkList) guild._afkList = new Map();
    guild._afkList.set(message.author.id, { reason: args.join(' ') || 'غائب', time: Date.now() });
    return message.reply({ embeds: [embed(null, `تم تفعيل وضع الغياب.`)] });
  }

  if (command === 'unafk') {
    if (!guild._afkList) guild._afkList = new Map();
    guild._afkList.delete(message.author.id);
    return message.reply({ embeds: [embed(null, 'تم ايقاف وضع الغياب.')] });
  }

  if (command === 'calc') {
    const expr = args.join(' ');
    if (!expr) return message.reply({ embeds: [embed(null, 'الرجاء ادخال العملية.')] });
    try {
      if (!/^[0-9+\-*\/\.\s\(\)]+$/.test(expr)) throw new Error('invalid');
      const result = Function('"use strict";return('+expr+')')();
      return message.reply({ embeds: [embed('حاسبة', `${expr} = **${result}**`)] });
    } catch { return message.reply({ embeds: [embed(null, 'خطأ في العملية.')] }); }
  }

  if (command === 'encode') {
    const t = args.join(' ');
    if (!t) return message.reply({ embeds: [embed(null, 'الرجاء ادخال النص.')] });
    return message.reply({ embeds: [embed('Base64', `\`${Buffer.from(t).toString('base64')}\``)] });
  }

  if (command === 'decode') {
    const t = args.join(' ');
    if (!t) return message.reply({ embeds: [embed(null, 'الرجاء ادخال النص.')] });
    try { return message.reply({ embeds: [embed('فك Base64', Buffer.from(t,'base64').toString('utf-8'))] }); }
    catch { return message.reply({ embeds: [embed(null, 'تعذر فك التشفير.')] }); }
  }

  if (command === 'move') {
    if (!member.permissions.has(PermissionFlagsBits.MoveMembers)) return message.reply({ embeds: [embed(null, 'ليس لديك صلاحية.')] });
    const target = message.mentions.members.first();
    if (!target) return message.reply({ embeds: [embed(null, 'الرجاء منشنة العضو.')] });
    if (!member.voice.channel) return message.reply({ embeds: [embed(null, 'يجب ان تكون في قناة صوتية.')] });
    await target.voice.setChannel(member.voice.channel).catch(() => {});
    return message.reply({ embeds: [embed(null, `تم نقل ${target.user.username}.`)] });
  }

  if (command === 'deafen') {
    if (!member.permissions.has(PermissionFlagsBits.DeafenMembers)) return message.reply({ embeds: [embed(null, 'ليس لديك صلاحية.')] });
    const target = message.mentions.members.first();
    if (!target) return message.reply({ embeds: [embed(null, 'الرجاء منشنة العضو.')] });
    await target.voice.setDeaf(true).catch(() => {});
    return message.reply({ embeds: [embed(null, `تم صم ${target.user.username}.`)] });
  }

  if (command === 'voicemute') {
    if (!member.permissions.has(PermissionFlagsBits.MuteMembers)) return message.reply({ embeds: [embed(null, 'ليس لديك صلاحية.')] });
    const target = message.mentions.members.first();
    if (!target) return message.reply({ embeds: [embed(null, 'الرجاء منشنة العضو.')] });
    await target.voice.setMute(true).catch(() => {});
    return message.reply({ embeds: [embed(null, `تم كتم صوت ${target.user.username}.`)] });
  }

  if (command === 'voiceunmute') {
    if (!member.permissions.has(PermissionFlagsBits.MuteMembers)) return message.reply({ embeds: [embed(null, 'ليس لديك صلاحية.')] });
    const target = message.mentions.members.first();
    if (!target) return message.reply({ embeds: [embed(null, 'الرجاء منشنة العضو.')] });
    await target.voice.setMute(false).catch(() => {});
    return message.reply({ embeds: [embed(null, `تم رفع كتم ${target.user.username}.`)] });
  }

  if (command === 'invites') {
    if (!member.permissions.has(PermissionFlagsBits.ManageGuild)) return message.reply({ embeds: [embed(null, 'ليس لديك صلاحية.')] });
    const invites = await guild.invites.fetch().catch(() => null);
    if (!invites) return message.reply({ embeds: [embed(null, 'تعذر جلب الدعوات.')] });
    const top = [...invites.sort((a,b)=>b.uses-a.uses).values()].slice(0,10);
    const list = top.map(i => `\`${i.code}\` — ${i.inviter?.username||'مجهول'} — ${i.uses} استخدام`).join('\n');
    return message.reply({ embeds: [embed('الدعوات', list || 'لا توجد.')] });
  }

  if (command === 'help') {
    return message.reply({ embeds: [new EmbedBuilder()
      .setTitle('قائمة الاوامر — JoyPiece').setColor(config.EMBED_COLOR).setFooter({ text: 'Developed by firas' }).setTimestamp()
      .addFields(
        { name: 'التذاكر',     value: '`!tickets` `!close` `!add` `!remove` `!rename` `!claim` `!ticketinfo` `!tickets-list`' },
        { name: 'الادارة',     value: '`!ban` `!unban` `!kick` `!mute` `!unmute` `!warn` `!warns` `!clearwarns` `!clear` `!slowmode` `!lock` `!unlock` `!lockdown` `!unlockdown` `!nick` `!role-add` `!role-remove` `!massrole` `!banlist`' },
        { name: 'المعلومات',   value: '`!userinfo` `!serverinfo` `!roleinfo` `!avatar` `!ping` `!uptime` `!botinfo` `!members` `!whois` `!id` `!joinpos` `!stats` `!invites`' },
        { name: 'القنوات',     value: '`!topic` `!nuke` `!create-channel` `!delete-channel` `!create-role` `!delete-role` `!setcolor` `!sethoist` `!setmentionable`' },
        { name: 'الرسائل',     value: '`!say` `!announce` `!embed` `!dm` `!poll` `!pin` `!unpin` `!repeat`' },
        { name: 'الصوت',       value: '`!move` `!deafen` `!voicemute` `!voiceunmute`' },
        { name: 'متنوع',       value: '`!8ball` `!coin` `!dice` `!choose` `!afk` `!unafk` `!calc` `!encode` `!decode` `!help`' },
      )] });
  }
}

module.exports = { handleCommand };
