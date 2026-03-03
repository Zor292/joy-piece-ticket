const mongoose = require('mongoose');

async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('[DB] Connected to MongoDB');
  } catch (err) {
    console.error('[DB] Connection failed:', err.message);
    process.exit(1);
  }
}

const counterSchema = new mongoose.Schema({
  _id: { type: String, default: 'ticket_counter' },
  count: { type: Number, default: 0 },
});
const Counter = mongoose.model('Counter', counterSchema);

async function getNextTicketNumber() {
  const doc = await Counter.findByIdAndUpdate(
    'ticket_counter',
    { $inc: { count: 1 } },
    { new: true, upsert: true }
  );
  return doc.count;
}

const ticketSchema = new mongoose.Schema({
  channelId:  { type: String, required: true, unique: true },
  guildId:    { type: String, required: true },
  type:       { type: String, required: true },
  ownerId:    { type: String, required: true },
  number:     { type: Number, required: true },
  claimedBy:  { type: String, default: null },
  status:     { type: String, default: 'open' },
  openedAt:   { type: Date, default: Date.now },
  closedAt:   { type: Date, default: null },
  closedBy:   { type: String, default: null },
});
const Ticket = mongoose.model('Ticket', ticketSchema);

const warnSchema = new mongoose.Schema({
  guildId:  { type: String, required: true },
  userId:   { type: String, required: true },
  warns: [{
    reason:    { type: String },
    moderator: { type: String },
    date:      { type: Date, default: Date.now },
  }],
});
const Warning = mongoose.model('Warning', warnSchema);

async function saveTicket(data)              { await Ticket.create(data); }
async function getTicket(channelId)          { return await Ticket.findOne({ channelId }); }
async function updateTicket(channelId, upd)  { return await Ticket.findOneAndUpdate({ channelId }, upd, { new: true }); }
async function closeTicketDB(channelId, by)  { return await Ticket.findOneAndUpdate({ channelId }, { status: 'closed', closedAt: new Date(), closedBy: by }, { new: true }); }
async function getAllOpenTickets(guildId)     { return await Ticket.find({ guildId, status: 'open' }); }
async function addWarning(gid, uid, reason, mod) { return await Warning.findOneAndUpdate({ guildId: gid, userId: uid }, { $push: { warns: { reason, moderator: mod } } }, { new: true, upsert: true }); }
async function getWarnings(gid, uid)         { return await Warning.findOne({ guildId: gid, userId: uid }); }
async function clearWarnings(gid, uid)       { return await Warning.findOneAndUpdate({ guildId: gid, userId: uid }, { $set: { warns: [] } }, { new: true }); }

module.exports = { connectDB, getNextTicketNumber, saveTicket, getTicket, updateTicket, closeTicketDB, getAllOpenTickets, addWarning, getWarnings, clearWarnings, Ticket, Warning };
