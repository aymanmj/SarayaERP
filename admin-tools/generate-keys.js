const crypto = require("crypto");
const fs = require("fs");

console.log("🔑 Generating RSA-2048 Key Pair...");

const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: "spki",
    format: "pem",
  },
  privateKeyEncoding: {
    type: "pkcs8",
    format: "pem",
  },
});

fs.writeFileSync("private.key", privateKey);
fs.writeFileSync("public.key", publicKey);

const path = require('path');

// Define paths
const serverLicensingDir = path.join(__dirname, '..', 'server', 'src', 'licensing');
const publicKeyDest = path.join(serverLicensingDir, 'public.key');

try {
  // Ensure destination directory exists
  if (!fs.existsSync(serverLicensingDir)) {
    fs.mkdirSync(serverLicensingDir, { recursive: true });
  }

  // Copy public key to server (Host Path)
  fs.copyFileSync('public.key', publicKeyDest);
  console.log(`✅ Copied public.key to host path: ${publicKeyDest}`);

  // Copy public key to running container
  try {
    const { execSync } = require('child_process');
    console.log('🔄 Copying public.key to running container...');
    execSync('docker cp public.key saraya_backend:/app/src/licensing/');
    console.log('✅ Successfully copied public.key to container: /app/src/licensing/');
  } catch (dockerError) {
    console.error(`⚠️  Failed to copy to container (Container might be down): ${dockerError.message}`);
  }

} catch (err) {
  console.error(`❌ Failed to copy public.key: ${err.message}`);
}

console.log("✅ Keys generated successfully!");
console.log("📂 Files created: private.key, public.key");
console.log("🔒 KEEP 'private.key' SECRET on your laptop only!");

// // license-tools/generate-keys.js
// const crypto = require("crypto");
// const fs = require("fs");

// const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
//   modulusLength: 2048,
//   publicKeyEncoding: {
//     type: "spki",
//     format: "pem",
//   },
//   privateKeyEncoding: {
//     type: "pkcs8",
//     format: "pem",
//   },
// });

// fs.writeFileSync("private.key", privateKey);
// fs.writeFileSync("public.key", publicKey);

// console.log("✅ Keys generated successfully!");
// console.log(
//   "🔒 KEEP 'private.key' SAFE! Never share it or put it in the client app.",
// );
// console.log("🌍 Copy 'public.key' to your NestJS src/licensing folder.");
// // console.log("You can now use these keys to sign and verify licenses.");
