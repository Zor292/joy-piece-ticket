# JoyBase Ticket Bot v2

## Railway Secrets (Environment Variables)

| Variable | Value |
|---|---|
| `DISCORD_TOKEN` | توكن البوت من Discord Developer Portal |
| `CLIENT_ID` | Client ID للبوت |
| `GUILD_ID` | ID السيرفر |

---

## الخطوات

### 1. Discord Developer Portal
- https://discord.com/developers/applications
- New Application → Bot → Reset Token → انسخ التوكن
- Privileged Gateway Intents: فعّل الثلاث (Presence, Server Members, Message Content)
- OAuth2 → URL Generator → اختر `bot` → Permissions: **Administrator**
- ادخل البوت للسيرفر

### 2. Railway
- ارفع الملفات او اربط GitHub
- اضف Variables من الجدول اعلاه
- Start Command: `npm start`

---

## الاوامر (البادئة: !)

**نظام التذاكر:**
`!tickets` `!close` `!add` `!remove` `!rename` `!claim` `!ticketinfo` `!tickets-list`

**الادارة:**
`!ban` `!unban` `!kick` `!mute` `!unmute` `!warn` `!clearwarns` `!clear` `!slowmode`
`!lock` `!unlock` `!lockdown` `!unlockdown` `!nick` `!setnick`
`!role-add` `!role-remove` `!massrole` `!removeallrole` `!setcolor` `!sethoist` `!setmentionable`
`!banlist` `!move` `!deafen` `!undeafen` `!voicemute` `!voiceunmute`

**المعلومات:**
`!userinfo` `!serverinfo` `!roleinfo` `!avatar` `!ping` `!botinfo` `!members`
`!channels` `!roles` `!id` `!emojis` `!boosts` `!whois` `!invites` `!inviteinfo` `!joinpos`

**القنوات:**
`!topic` `!nuke` `!create-channel` `!delete-channel` `!create-role` `!delete-role`

**الرسائل:**
`!say` `!announce` `!embed` `!dm` `!poll` `!pin` `!unpin` `!repeat`

**متنوع:**
`!8ball` `!coin` `!dice` `!choose` `!afk` `!unafk` `!uptime` `!calc` `!encode` `!decode` `!stats` `!help`
