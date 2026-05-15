// Utilisation: node server/scripts/hash-passwords.js
// Génère les hashes bcrypt pour le fichier schema.sql

const bcrypt = require('bcryptjs');

const users = [
  { email: 'marc.bouchard@votre-concessionnaire.com',    password: 'ServiceTrack2024!' },
  { email: 'julie.dion@votre-concessionnaire.com',       password: 'ServiceTrack2024!' },
  { email: 'patrick.tremblay@votre-concessionnaire.com', password: 'ServiceTrack2024!' },
  { email: 'sophie.lavoie@votre-concessionnaire.com',    password: 'ServiceTrack2024!' },
  { email: 'admin@votre-concessionnaire.com',            password: 'AdminTrack2024!' },
];

async function main() {
  console.log('-- Copiez ces valeurs dans schema.sql\n');
  for (const u of users) {
    const hash = await bcrypt.hash(u.password, 12);
    console.log(`-- ${u.email}`);
    console.log(`'${hash}',\n`);
  }
}

main().catch(console.error);
