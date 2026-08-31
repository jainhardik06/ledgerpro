const fetch = require('node-fetch') || globalThis.fetch;

async function signup() {
  const res = await fetch('http://localhost:3000/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'user@example.com',
      password: 'password123',
      workspaceName: 'My Workspace'
    })
  });
  console.log(res.status, await res.json());
}
signup();
