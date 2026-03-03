const {
  PermissionFlagsBits,
  EmbedBuilder,
  ChannelType,
  AttachmentBuilder,
} = require('discord.js');
const config  = require('./config');
const db      = require('./database');
const { sendV2 } = require('./rest');

const openTickets = new Map();

async function loadOpenTickets() {
  try {
    const tickets = await db.getAllOpenTickets(process.env.GUILD_ID);
    for (const t of tickets) {
      openTickets.set(t.channelId, {
        type: t.type, ownerId: t.ownerId,
        claimedBy: t.claimedBy, openedAt: t.openedAt, number: t.number,
      });
    }
    console.log(`[DB] Loaded ${tickets.length} open tickets`);
  } catch (err) {
    console.error('[DB] loadOpenTickets:', err.message);
  }
}

async function createTicket(interaction, ticketType) {
  const guild      = interaction.guild;
  const user       = interaction.user;
  const typeConfig = config.TICKET_TYPES[ticketType];
  if (!typeConfig) return;

  const existing = [...openTickets.values()].find(
    t => t.ownerId === user.id && t.type === ticketType
  );
  if (existing) {
    await interaction.editReply({ content: 'لديك تكت مفتوح من هذا النوع بالفعل.' });
    return;
  }

  const ticketNum   = await db.getNextTicketNumber();
  const cleanName   = user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) || 'user';
  const channelName = `ticket-${ticketNum}-${cleanName}`;

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: config.TICKET_CATEGORY_ID,
    permissionOverwrites: [
      { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: user.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles],
      },
      {
        id: typeConfig.adminRole,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages,
                PermissionFlagsBits.AttachFiles],
      },
    ],
  });

  await db.saveTicket({ channelId: channel.id, guildId: guild.id, type: ticketType, ownerId: user.id, number: ticketNum });
  openTickets.set(channel.id, { type: ticketType, ownerId: user.id, claimedBy: null, openedAt: new Date(), number: ticketNum });

  // ── Mention message (outside container so it pings) ──
  await channel.send({ content: `<@${user.id}> <@&${typeConfig.adminRole}>` });

  // ── Components V2 ticket panel ──
  const container = {
    type: 17,
    accent_color: config.EMBED_COLOR,
    components: [
      { type: 11, items: [{ media: { url: config.IMAGE_URL } }] },
      { type: 10, content: `## ${typeConfig.title}` },
      { type: 14 },
      { type: 10, content: `**قبل المتابعة يرجى قراءة القوانين التالية:**\n\n${config.RULES_DESCRIPTION}` },
      { type: 14 },
      {
        type: 1,
        components: [
          { type: 2, custom_id: `ticket_senior_${channel.id}`,  label: 'استدعاء عليا',   style: 1 },
          { type: 2, custom_id: `ticket_support_${channel.id}`, label: 'استدعاء سبورت', style: 2 },
          { type: 2, custom_id: `ticket_claim_${channel.id}`,   label: 'استلام تكت',    style: 3 },
          { type: 2, custom_id: `ticket_close_${channel.id}`,   label: 'اغلاق',         style: 4 },
        ],
      },
      {
        type: 1,
        components: [{
          type: 3,
          custom_id: `ticket_manage_${channel.id}`,
          placeholder: 'تعديل التذكرة',
          options: [
            { label: 'استدعاء صاحب التذكرة', value: 'call_owner',    emoji: { name: '📣' } },
            { label: 'تعديل اسم التذكرة',    value: 'rename',       emoji: { name: '✏️' } },
            { label: 'اضافة عضو للتذكرة',    value: 'add_member',   emoji: { name: '➕' } },
            { label: 'ازالة عضو من التذكرة', value: 'remove_member', emoji: { name: '➖' } },
          ],
        }],
      },
      { type: 14 },
      { type: 10, content: `-# Developed by firas • JoyPiece` },
    ],
  };

  await sendV2(channel.id, { components: [container] }, process.env.DISCORD_TOKEN);
  await interaction.editReply({ content: `تم فتح التكت: <#${channel.id}>` });
}

async function closeTicket(interaction, channelId) {
  const channel    = interaction.guild.channels.cache.get(channelId);
  const ticketData = openTickets.get(channelId);
  if (!channel || !ticketData) return;

  const messages = await channel.messages.fetch({ limit: 100 });
  const sorted   = [...messages.values()].reverse();
  const html     = generateTranscriptHTML(sorted, ticketData, channel.name);

  await db.closeTicketDB(channelId, interaction.user.id);

  const logChannel = interaction.guild.channels.cache.get(config.LOG_CHANNEL_ID);
  if (logChannel) {
    const typeConfig = config.TICKET_TYPES[ticketData.type];
    const logEmbed = new EmbedBuilder()
      .setTitle('تم اغلاق تكت')
      .addFields(
        { name: 'رقم التكت',    value: `#${ticketData.number}`,          inline: true },
        { name: 'صاحب التكت',   value: `<@${ticketData.ownerId}>`,        inline: true },
        { name: 'النوع',        value: typeConfig?.label || ticketData.type, inline: true },
        { name: 'اغلق بواسطة', value: `<@${interaction.user.id}>`,        inline: true },
        { name: 'اسم القناة',   value: channel.name,                       inline: true },
      )
      .setColor(0xe74c3c)
      .setFooter({ text: 'Developed by firas' })
      .setTimestamp();

    const buf = Buffer.from(html, 'utf-8');
    const att = new AttachmentBuilder(buf, { name: `transcript-${channel.name}.html` });
    await logChannel.send({ embeds: [logEmbed], files: [att] });
  }

  openTickets.delete(channelId);
  await channel.send({ content: 'جاري اغلاق التكت...' });
  setTimeout(() => channel.delete().catch(() => {}), 3000);
}

// ── Discord-style transcript ────────────────────────────────────
function generateTranscriptHTML(messages, ticketData, channelName) {
  const typeConfig = config.TICKET_TYPES[ticketData.type];

  function getUserColor(id) {
    const colors = ['#7289da','#43b581','#faa61a','#f04747','#99aab5','#5865f2','#eb459e','#3ba55c','#ed4245','#e67e22'];
    let h = 0; for (const c of id) h = c.charCodeAt(0) + ((h << 5) - h);
    return colors[Math.abs(h) % colors.length];
  }

  function fmtTime(d) {
    return d.toLocaleString('en-US', { month:'numeric', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit', hour12:true });
  }

  function esc(t) {
    return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function renderEmbeds(embeds) {
    return (embeds||[]).map(e => {
      const col = e.color ? `#${e.color.toString(16).padStart(6,'0')}` : '#4f545c';
      const title = e.title ? `<div class="e-title">${esc(e.title)}</div>` : '';
      const desc  = e.description ? `<div class="e-desc">${esc(e.description)}</div>` : '';
      const img   = e.image?.url ? `<img class="e-img" src="${esc(e.image.url)}"/>` : '';
      const thumb = e.thumbnail?.url ? `<img class="e-thumb" src="${esc(e.thumbnail.url)}"/>` : '';
      const foot  = e.footer?.text ? `<div class="e-foot">${esc(e.footer.text)}</div>` : '';
      return `<div class="embed" style="border-left-color:${col}"><div class="e-body">${thumb?`<div>${thumb}</div>`:''}<div>${title}${desc}${foot}</div></div>${img}</div>`;
    }).join('');
  }

  function renderAtts(atts) {
    if (!atts?.size) return '';
    return [...atts.values()].map(a => {
      if (/\.(png|jpg|jpeg|gif|webp)$/i.test(a.name)) return `<img class="att-img" src="${esc(a.url)}"/>`;
      return `<a class="att-file" href="${esc(a.url)}" target="_blank">📎 ${esc(a.name)}</a>`;
    }).join('');
  }

  function renderContent(txt) {
    if (!txt) return '';
    let h = esc(txt);
    h = h.replace(/&lt;@!?(\d+)&gt;/g, '<span class="mention">@$1</span>');
    h = h.replace(/&lt;@&amp;(\d+)&gt;/g, '<span class="mention rm">@role</span>');
    h = h.replace(/&lt;#(\d+)&gt;/g, '<span class="mention">#channel</span>');
    h = h.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    h = h.replace(/\*(.*?)\*/g, '<em>$1</em>');
    h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
    return h;
  }

  // Group consecutive messages
  const groups = [];
  let lastId = null, lastTime = null;
  for (const msg of messages) {
    const diff = lastTime ? (msg.createdAt - lastTime)/60000 : 99;
    if (msg.author.id === lastId && diff < 7) { groups[groups.length-1].msgs.push(msg); }
    else { groups.push({ author: msg.author, msgs: [msg] }); lastId = msg.author.id; }
    lastTime = msg.createdAt;
  }

  const rows = groups.map(g => {
    const a = g.author;
    const first = g.msgs[0];
    const avatar = a.displayAvatarURL ? a.displayAvatarURL({ extension:'png', size:64 }) : `https://cdn.discordapp.com/embed/avatars/0.png`;
    const lines = g.msgs.map(m => {
      const txt = renderContent(m.content);
      const emb = renderEmbeds(m.embeds);
      const att = renderAtts(m.attachments);
      const ed  = m.editedAt ? '<span class="edited">(edited)</span>' : '';
      return `<div class="mline">${txt?`<div class="mtxt">${txt}${ed}</div>`:''}${emb}${att}</div>`;
    }).join('');
    return `<div class="mgroup">
      <img class="av" src="${esc(avatar)}" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'"/>
      <div class="mright">
        <div class="mhead">
          <span class="uname" style="color:${getUserColor(a.id)}">${esc(a.username)}${a.bot?'<span class="btag">BOT</span>':''}</span>
          <span class="ts">${fmtTime(first.createdAt)}</span>
        </div>
        ${lines}
      </div>
    </div>`;
  }).join('');

  return `<!DOCTYPE html><html lang="ar"><head><meta charset="UTF-8"/><title>Transcript — ${esc(channelName)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'gg sans','Noto Sans',Arial,sans-serif;background:#313338;color:#dcddde;font-size:16px}
.hdr{background:#2b2d31;padding:12px 16px;display:flex;align-items:center;gap:8px;border-bottom:1px solid #1e1f22;position:sticky;top:0;z-index:9}
.hch{font-weight:700;color:#f2f3f5;font-size:16px}.htop{color:#b5bac1;font-size:13px;margin-left:8px;border-left:1px solid #4e5058;padding-left:8px}
.ibar{background:#2b2d31;padding:8px 16px;display:flex;gap:16px;flex-wrap:wrap;border-bottom:1px solid #1e1f22;font-size:12px;color:#b5bac1}
.ibar strong{color:#e3e5e8}
.wrap{padding:16px 0}
.mgroup{display:flex;gap:16px;padding:2px 16px;min-height:44px}
.mgroup:hover{background:rgba(0,0,0,.06)}
.av{width:40px;height:40px;border-radius:50%;object-fit:cover;margin-top:2px;flex-shrink:0}
.mright{flex:1;min-width:0}
.mhead{display:flex;align-items:baseline;gap:8px;margin-bottom:2px}
.uname{font-weight:500;font-size:1rem}
.btag{background:#5865f2;color:#fff;font-size:10px;font-weight:700;padding:1px 4px;border-radius:3px;margin-left:4px;text-transform:uppercase}
.ts{color:#a3a6aa;font-size:.75rem}
.mline{margin-bottom:2px}
.mtxt{color:#dcddde;font-size:1rem;line-height:1.375;word-break:break-word;white-space:pre-wrap}
.mtxt strong{font-weight:700}.mtxt em{font-style:italic}
.mtxt code{background:#2e3035;border-radius:3px;padding:0 4px;font-family:Consolas,monospace;font-size:.875rem}
.edited{color:#a3a6aa;font-size:.625rem;margin-left:4px}
.mention{color:#c9cdfb;background:rgba(88,101,242,.3);border-radius:3px;padding:0 2px}
.rm{color:#e9c46a;background:rgba(233,196,106,.1)}
.embed{background:#2b2d31;border-radius:4px;border-left:4px solid #4f545c;margin-top:4px;max-width:520px;overflow:hidden}
.e-body{display:flex;padding:8px 10px 8px 12px;gap:10px}
.e-title{color:#fff;font-weight:600;font-size:.9375rem;margin-bottom:4px}
.e-desc{color:#dcddde;font-size:.875rem;line-height:1.3;white-space:pre-wrap}
.e-foot{color:#a3a6aa;font-size:.75rem;margin-top:6px}
.e-img{width:100%;max-width:400px;display:block}
.e-thumb{width:80px;height:80px;border-radius:3px;object-fit:cover}
.att-img{max-width:400px;max-height:300px;border-radius:3px;margin-top:4px;display:block}
.att-file{display:inline-flex;align-items:center;gap:6px;background:#2b2d31;border:1px solid #1e1f22;border-radius:3px;padding:6px 10px;margin-top:4px;color:#00b0f4;font-size:.875rem;text-decoration:none}
.ftr{text-align:center;padding:16px;color:#a3a6aa;font-size:.75rem;border-top:1px solid #3f4147;margin-top:8px}
::-webkit-scrollbar{width:8px}::-webkit-scrollbar-track{background:#2b2d31}::-webkit-scrollbar-thumb{background:#1a1b1e;border-radius:4px}
</style></head><body>
<div class="hdr"><span style="color:#80848e;font-size:20px">#</span><span class="hch">${esc(channelName)}</span><span class="htop">JoyPiece Ticket Transcript</span></div>
<div class="ibar">
  <span>رقم التكت: <strong>#${ticketData.number}</strong></span>
  <span>صاحب التكت: <strong>${ticketData.ownerId}</strong></span>
  <span>نوع التكت: <strong>${typeConfig?.label||ticketData.type}</strong></span>
  <span>عدد الرسائل: <strong>${messages.length}</strong></span>
</div>
<div class="wrap">${rows}</div>
<div class="ftr">تم تصدير ${messages.length} رسالة • JoyPiece Ticket System • Developed by firas</div>
</body></html>`;
}

module.exports = { createTicket, closeTicket, openTickets, loadOpenTickets };
