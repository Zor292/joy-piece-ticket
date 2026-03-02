# JoyBase Ticket Bot

## Railway Secrets (Environment Variables)

Add these in Railway → Variables:

| Variable | Value |
|---|---|
| `DISCORD_TOKEN` | توكن البوت من Discord Developer Portal |
| `CLIENT_ID` | Client ID للبوت من Discord Developer Portal |
| `GUILD_ID` | ID السيرفر |

---

## الخطوات

### 1. انشاء البوت
- اذهب الى https://discord.com/developers/applications
- اضغط New Application
- اذهب الى Bot → Reset Token → انسخ التوكن
- فعل **Message Content Intent**, **Server Members Intent**, **Presence Intent**
- اذهب الى OAuth2 → URL Generator → اختر `bot` و `applications.commands`
- Permissions: Administrator (او على الاقل Manage Channels, Send Messages, Embed Links, Attach Files, Read Message History, Manage Messages)
- ادخل البوت للسيرفر

### 2. Railway
- ارفع الملفات او اربط GitHub repository
- اضف environment variables من الجدول اعلاه
- Start Command: `npm start`

### 3. Deploy Slash Commands (مرة واحدة فقط)
بعد ما يشتغل البوت على Railway، شغل:
```
node src/deploy-commands.js
```
او اضف في Railway custom deploy command مرة واحدة.

---

## الاوامر
- `/ticket-send` - يرسل لوحة التذاكر (يحتاج صلاحية Manage Server)

---

## ملاحظات
- البوت يحفظ بيانات التذاكر في الذاكرة. عند اعادة التشغيل تنمسح البيانات.
- الـ transcript يتم ارساله تلقائيا عند الاغلاق كملف HTML.
