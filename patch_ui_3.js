const fs = require('fs');
let code = fs.readFileSync('src/components/MoneyOSDashboard.tsx', 'utf8');

const thOld = `<th className="px-6 py-4 text-right">Amount</th>`;
const thNew = `<th className="px-6 py-4 text-right">Amount</th><th className="px-6 py-4 text-right">Actions</th>`;
code = code.replace(thOld, thNew);

const tdOld = `<td className={\`px-6 py-4 font-black text-right \${t.type === 'Credit' ? 'text-emerald-500' : 'text-rose-500'}\`}>
                        {t.type === 'Credit' ? '+' : '-'}₹{t.amount.toLocaleString()}
                      </td>`;
const tdNew = `<td className={\`px-6 py-4 font-black text-right \${t.type === 'Credit' ? 'text-emerald-500' : 'text-rose-500'}\`}>
                        {t.type === 'Credit' ? '+' : '-'}₹{t.amount.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button onClick={() => { setEditingTxId(t.id); setTxType(t.type as any); setTxAmount(t.amount.toString()); setTxDesc(t.description); setTxDate(t.date); setTxCategory(t.category || ''); setTxAccountId(t.accountId || ''); setTxClientId(t.clientId || ''); setTxNotes(t.notes || ''); setIsTxModalOpen(true); }} className="text-indigo-500 mr-3 text-xs hover:text-indigo-400"><Edit2 className="w-4 h-4 inline"/></button>
                        <button onClick={() => handleDelete('transactions', t.id, t.description)} className="text-rose-500 text-xs hover:text-rose-400"><Trash2 className="w-4 h-4 inline"/></button>
                      </td>`;
code = code.replace(tdOld, tdNew);

fs.writeFileSync('src/components/MoneyOSDashboard.tsx', code);
console.log('Transactions table updated');
