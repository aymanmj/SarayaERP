const fs = require('fs');
const jwt = require('jsonwebtoken');
const privateKey = fs.readFileSync('private.key', 'utf8');
const payload = {
  hwId: '468067510a6c',
  hospitalName: 'Saraya International Hospital',
  expiryDate: '2026-12-31',
  plan: 'ENTERPRISE',
  maxUsers: -1,
  modules: ['LAB', 'RADIOLOGY', 'PHARMACY', 'HR', 'ASSETS', 'ACCOUNTS', 'CDSS']
};
const token = jwt.sign(payload, privateKey, { algorithm: 'RS256' });
fs.writeFileSync('token.txt', token);
console.log('Token written to token.txt');
