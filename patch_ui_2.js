const fs = require('fs');
let code = fs.readFileSync('src/components/MoneyOSDashboard.tsx', 'utf8');

// Add Edit2 to imports
code = code.replace(/Trash2,/g, 'Trash2, Edit2,');

// Clients modification
const clientOld = `<h3 className="text-lg font-bold">{c.name}</h3>`;
const clientNew = `<div className="flex justify-between items-center"><h3 className="text-lg font-bold">{c.name}</h3><div className="flex gap-2"><button onClick={() => { setEditingClientId(c.id); setClientName(c.name); setClientEmail(c.email || ''); setIsClientModalOpen(true); }} className="text-indigo-500 hover:text-indigo-400"><Edit2 className="w-4 h-4"/></button><button onClick={() => handleDelete('clients', c.id, c.name)} className="text-rose-500 hover:text-rose-400"><Trash2 className="w-4 h-4"/></button></div></div>`;
code = code.replace(clientOld, clientNew);

// Budgets modification
const budOld = `<span className="text-sm font-bold text-slate-500">₹{spent} / ₹{b.limitAmount}</span>`;
const budNew = `<div className="flex items-center gap-3"><span className="text-sm font-bold text-slate-500">₹{spent} / ₹{b.limitAmount}</span><button onClick={() => { setEditingBudgetId(b.id); setBudgetCategory(b.category); setBudgetLimit(b.limitAmount.toString()); setIsBudgetModalOpen(true); }} className="text-indigo-500 hover:text-indigo-400"><Edit2 className="w-4 h-4"/></button><button onClick={() => handleDelete('budgets', b.id, b.category)} className="text-rose-500 hover:text-rose-400"><Trash2 className="w-4 h-4"/></button></div>`;
code = code.replace(budOld, budNew);

// Recurring modification
const recOld = `<h3 className="text-lg font-bold">{r.description}</h3>`;
const recNew = `<div className="flex justify-between items-start"><h3 className="text-lg font-bold">{r.description}</h3><div className="flex gap-2"><button onClick={() => { setEditingRecurringId(r.id); setRecType(r.type as any); setRecAmount(r.amount.toString()); setRecDesc(r.description); setRecCategory(r.category || ''); setRecAccountId(r.accountId || ''); setRecInterval(r.interval as any); setRecNextRun(r.nextRunDate); setIsRecurringModalOpen(true); }} className="text-indigo-500 hover:text-indigo-400"><Edit2 className="w-4 h-4"/></button><button onClick={() => handleDelete('recurring', r.id, r.description)} className="text-rose-500 hover:text-rose-400"><Trash2 className="w-4 h-4"/></button></div></div>`;
code = code.replace(recOld, recNew);

// Settings -> Add Categories and Accounts Tables
const settingsBlockOld = `<h3 className="font-bold mb-4">Application Mode</h3>`;
const settingsBlockNew = `<div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              {/* Categories Table */}
              <div className={\`p-6 rounded-3xl border shadow-lg \${darkMode ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200'}\`}>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold">Manage Categories</h3>
                  <button onClick={() => { setEditingCategoryId(null); setNewCategoryName(''); setIsCategoryModalOpen(true); }} className="text-indigo-500 hover:text-indigo-400 font-bold text-sm flex items-center gap-1"><Plus className="w-4 h-4"/> Add</button>
                </div>
                <div className="max-h-64 overflow-y-auto pr-2">
                  <table className="w-full text-sm text-left">
                    <tbody>
                      {categories.map(c => (
                        <tr key={c.id} className="border-b last:border-0 border-slate-800/20">
                          <td className="py-3 font-semibold">{c.name}</td>
                          <td className="py-3 text-right">
                            <button onClick={() => { setEditingCategoryId(c.id); setNewCategoryName(c.name); setIsCategoryModalOpen(true); }} className="text-indigo-500 mr-3 text-xs"><Edit2 className="w-4 h-4 inline"/></button>
                            <button onClick={() => handleDelete('categories', c.id, c.name)} className="text-rose-500 text-xs"><Trash2 className="w-4 h-4 inline"/></button>
                          </td>
                        </tr>
                      ))}
                      {categories.length===0 && <tr><td colSpan={2} className="py-4 text-center text-slate-500">No categories.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Accounts Table */}
              <div className={\`p-6 rounded-3xl border shadow-lg \${darkMode ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200'}\`}>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold">Manage Accounts</h3>
                  <button onClick={() => { setEditingAccountId(null); setNewAccountName(''); setNewAccountBalance('0'); setIsAccountModalOpen(true); }} className="text-indigo-500 hover:text-indigo-400 font-bold text-sm flex items-center gap-1"><Plus className="w-4 h-4"/> Add</button>
                </div>
                <div className="max-h-64 overflow-y-auto pr-2">
                  <table className="w-full text-sm text-left">
                    <tbody>
                      {accounts.map(a => (
                        <tr key={a.id} className="border-b last:border-0 border-slate-800/20">
                          <td className="py-3 font-semibold">{a.name} <span className="text-xs text-slate-500 ml-1">({a.type})</span></td>
                          <td className="py-3 font-mono text-xs">₹{a.initialBalance}</td>
                          <td className="py-3 text-right">
                            <button onClick={() => { setEditingAccountId(a.id); setNewAccountName(a.name); setNewAccountType(a.type); setNewAccountBalance(a.initialBalance.toString()); setIsAccountModalOpen(true); }} className="text-indigo-500 mr-3 text-xs"><Edit2 className="w-4 h-4 inline"/></button>
                            <button onClick={() => handleDelete('accounts', a.id, a.name)} className="text-rose-500 text-xs"><Trash2 className="w-4 h-4 inline"/></button>
                          </td>
                        </tr>
                      ))}
                      {accounts.length===0 && <tr><td colSpan={3} className="py-4 text-center text-slate-500">No accounts.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <h3 className="font-bold mb-4">Application Mode</h3>`;
code = code.replace(settingsBlockOld, settingsBlockNew);

fs.writeFileSync('src/components/MoneyOSDashboard.tsx', code);
console.log('UI tabs updated');
