// Private values are written to a new, owner-only file, never stdout.
import {generateKeyPairSync,randomBytes} from 'node:crypto';
import {writeFileSync} from 'node:fs';
const [output,subject]=process.argv.slice(2);
if(!output||!/^mailto:[^\s@]+@[^\s@]+$/.test(subject||''))throw Error('Usage: node generate-keys.mjs /private/path.env mailto:owner@example.org');
const {privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),jwk=privateKey.export({format:'jwk'});
const publicKey=Buffer.concat([Buffer.from([4]),Buffer.from(jwk.x,'base64url'),Buffer.from(jwk.y,'base64url')]).toString('base64url');
writeFileSync(output,`PLAYROOM_VAPID_SUBJECT=${subject}\nPLAYROOM_VAPID_PUBLIC_KEY=${publicKey}\nPLAYROOM_VAPID_PRIVATE_KEY=${jwk.d}\nPLAYROOM_PUSH_SECRET=${randomBytes(32).toString('hex')}\n`,{mode:0o600,flag:'wx'});
console.log('Created private environment file. Public VAPID key: '+publicKey);
