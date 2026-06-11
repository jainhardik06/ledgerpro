const fs = require('fs');
let code = fs.readFileSync('src/app/page.tsx', 'utf8');

// 1. Add isSignup state
const stateOld = `const [authUsername, setAuthUsername] = useState('');`;
const stateNew = `const [isSignup, setIsSignup] = useState(false);\n  const [authTenantName, setAuthTenantName] = useState('');\n  const [authUsername, setAuthUsername] = useState('');`;
code = code.replace(stateOld, stateNew);

// 2. Modify handleAuthSubmit to handle both
const handlerOld = `const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: authUsername, password: authPassword })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setUser(data.user);
        setIsAuthenticated(true);
      } else {
        showToast(data.error || 'Authentication failed', 'error');
      }
    } catch (err) {
      showToast('Connection error occurred', 'error');
    } finally {
      setAuthLoading(false);
    }
  };`;

const handlerNew = `const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    try {
      const endpoint = isSignup ? '/api/auth/signup' : '/api/auth/login';
      const payload = isSignup 
        ? { tenantName: authTenantName, username: authUsername, password: authPassword }
        : { username: authUsername, password: authPassword };
        
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setUser(data.user);
        setIsAuthenticated(true);
        if (isSignup) showToast('Account created successfully!', 'success');
      } else {
        showToast(data.error || 'Authentication failed', 'error');
      }
    } catch (err) {
      showToast('Connection error occurred', 'error');
    } finally {
      setAuthLoading(false);
    }
  };`;
code = code.replace(handlerOld, handlerNew);

// 3. Update the form UI
const formOld = `<form onSubmit={handleAuthSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold mb-2">Username</label>
              <input type="text" value={authUsername} onChange={e => setAuthUsername(e.target.value)} className={\`w-full px-4 py-3.5 rounded-xl border outline-none font-medium transition \${darkMode ? 'bg-slate-950 border-slate-800 focus:border-indigo-500 text-white' : 'bg-slate-50 border-slate-300 focus:border-indigo-500 text-black'}\`} required />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Password</label>
              <input type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} className={\`w-full px-4 py-3.5 rounded-xl border outline-none font-medium transition \${darkMode ? 'bg-slate-950 border-slate-800 focus:border-indigo-500 text-white' : 'bg-slate-50 border-slate-300 focus:border-indigo-500 text-black'}\`} required />
            </div>
            <button type="submit" disabled={authLoading} className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold py-3.5 rounded-xl shadow-lg active:scale-[0.99] transition-all flex justify-center items-center gap-2 mt-4 cursor-pointer">
              {authLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <><LogIn className="w-4 h-4" /> Sign In</>}
            </button>
          </form>`;

const formNew = `<form onSubmit={handleAuthSubmit} className="space-y-5">
            {isSignup && (
              <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                <label className="block text-sm font-semibold mb-2">Organization / Company Name</label>
                <input type="text" value={authTenantName} onChange={e => setAuthTenantName(e.target.value)} className={\`w-full px-4 py-3.5 rounded-xl border outline-none font-medium transition \${darkMode ? 'bg-slate-950 border-slate-800 focus:border-indigo-500 text-white' : 'bg-slate-50 border-slate-300 focus:border-indigo-500 text-black'}\`} required={isSignup} />
              </div>
            )}
            <div>
              <label className="block text-sm font-semibold mb-2">{isSignup ? 'Admin Username' : 'Username'}</label>
              <input type="text" value={authUsername} onChange={e => setAuthUsername(e.target.value)} className={\`w-full px-4 py-3.5 rounded-xl border outline-none font-medium transition \${darkMode ? 'bg-slate-950 border-slate-800 focus:border-indigo-500 text-white' : 'bg-slate-50 border-slate-300 focus:border-indigo-500 text-black'}\`} required />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Password</label>
              <input type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} className={\`w-full px-4 py-3.5 rounded-xl border outline-none font-medium transition \${darkMode ? 'bg-slate-950 border-slate-800 focus:border-indigo-500 text-white' : 'bg-slate-50 border-slate-300 focus:border-indigo-500 text-black'}\`} required />
            </div>
            <button type="submit" disabled={authLoading} className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold py-3.5 rounded-xl shadow-lg active:scale-[0.99] transition-all flex justify-center items-center gap-2 mt-4 cursor-pointer">
              {authLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <><LogIn className="w-4 h-4" /> {isSignup ? 'Create Account' : 'Sign In'}</>}
            </button>

            <div className="text-center mt-6 pt-4 border-t border-slate-800/30">
              <button type="button" onClick={() => { setIsSignup(!isSignup); setAuthTenantName(''); setAuthUsername(''); setAuthPassword(''); }} className="text-sm font-semibold text-indigo-500 hover:text-indigo-400 transition-colors">
                {isSignup ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
              </button>
            </div>
          </form>`;

code = code.replace(formOld, formNew);

fs.writeFileSync('src/app/page.tsx', code);
console.log('Patched page.tsx successfully');
