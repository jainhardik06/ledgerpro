const fs = require('fs');
const path = require('path');

const routes = ['accounts', 'categories', 'recurring', 'clients'];

for (const entity of routes) {
  const p = path.join('src', 'app', 'api', entity, '[id]', 'route.ts');
  if (fs.existsSync(p)) {
    let code = fs.readFileSync(p, 'utf8');
    
    // Replace the problematic line with properly evaluated string replacement
    code = code.replace(/if \('.*?' === 'categories'\) updates = body\.name;/g, '');
    
    // But wait! For categories, I actually NEED 'updates = body.name'
    // So if it's categories, I replace the whole logic block:
    if (entity === 'categories') {
        code = code.replace('let updates = body;', 'let updates = body.name;');
    } else {
        code = code.replace('let updates = body;', 'let updates = body;');
    }

    fs.writeFileSync(p, code);
  }
}
console.log('TS Errors Fixed!');
