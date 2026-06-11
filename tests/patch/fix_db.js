const fs = require('fs');
let code = fs.readFileSync('src/lib/db.ts', 'utf8');

// The appended code block started with export async function updateClient
// And had export async function deleteClient at the end.
// We will split by "export async function deleteClient" and see if there are more than 1 occurrences.

const parts = code.split('export async function deleteClient');
if (parts.length > 2) {
  console.log('Duplicate found! Removing the last one.');
  // The last part contains the duplicate declaration.
  // Actually, let's just find the last export async function deleteClient block and remove it.
  
  const lastIndex = code.lastIndexOf('export async function deleteClient');
  if (lastIndex !== code.indexOf('export async function deleteClient')) {
    code = code.substring(0, lastIndex);
    fs.writeFileSync('src/lib/db.ts', code);
    console.log('Fixed duplicate');
  }
}
