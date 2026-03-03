/**
 * Components V2 REST helper - uses built-in https (no external deps)
 */
const https = require('https');

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const options = {
      hostname: 'discord.com',
      path: `/api/v10${path}`,
      method,
      headers: {
        'Authorization': `Bot ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    };
    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(raw)); } catch { resolve({}); }
        } else {
          reject(new Error(`Discord API ${res.statusCode}: ${raw}`));
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function sendV2(channelId, payload, token) {
  return request('POST', `/channels/${channelId}/messages`, {
    ...payload,
    flags: 32768,
  }, token);
}

async function replyV2(interactionId, interactionToken, payload, ephemeral, token) {
  return request('POST', `/interactions/${interactionId}/${interactionToken}/callback`, {
    type: 4,
    data: { ...payload, flags: ephemeral ? 32832 : 32768 },
  }, token);
}

async function followUpV2(appId, interactionToken, payload, ephemeral, token) {
  return request('POST', `/webhooks/${appId}/${interactionToken}`, {
    ...payload,
    flags: ephemeral ? 32832 : 32768,
  }, token);
}

module.exports = { sendV2, replyV2, followUpV2 };
