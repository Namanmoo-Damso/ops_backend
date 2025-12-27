import { AccessToken } from 'livekit-server-sdk';

const roomName = process.argv[2] || 'demo-room';
const identity = process.argv[3] || `user-${Date.now()}`;
const name = process.argv[4] || identity;
const role = process.argv[5] || 'host';

const livekitUrl = process.env.LIVEKIT_URL;
const apiKey = process.env.LIVEKIT_API_KEY;
const apiSecret = process.env.LIVEKIT_API_SECRET;

if (!livekitUrl || !apiKey || !apiSecret) {
  console.error('Missing LIVEKIT_URL, LIVEKIT_API_KEY, or LIVEKIT_API_SECRET');
  process.exit(1);
}

const token = new AccessToken(apiKey, apiSecret, {
  identity,
  name,
  ttl: 600,
});

token.addGrant({
  roomJoin: true,
  room: roomName,
  canPublish: role !== 'observer',
  canSubscribe: true,
  canPublishData: role !== 'observer',
  roomAdmin: role === 'host',
});

const jwt = token.toJwt();

console.log('LIVEKIT_URL=' + livekitUrl);
console.log('ROOM=' + roomName);
console.log('IDENTITY=' + identity);
console.log('ROLE=' + role);
console.log('TOKEN=' + jwt);
