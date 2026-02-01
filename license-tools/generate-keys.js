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

console.log("✅ Keys generated successfully!");
console.log("📂 Files created: private.key, public.key");
console.log(
  "⚠️  IMPORTANT: Move 'public.key' to 'server/src/licensing/' directory.",
);
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
