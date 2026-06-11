const fs = require('fs');
let code = fs.readFileSync('src/components/MoneyOSDashboard.tsx', 'utf8');

// 1. Add editing states and delete handlers
const statesStr = `const [searchQuery, setSearchQuery] = useState('');`;
const newStates = `const [searchQuery, setSearchQuery] = useState('');
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [editingRecurringId, setEditingRecurringId] = useState<string | null>(null);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);

  const handleDelete = async (endpoint: string, id: string, name: string) => {
    if (!confirm(\`Are you sure you want to delete \${name}?\`)) return;
    try {
      const res = await fetch(\`/api/\${endpoint}/\${id}\`, { method: 'DELETE' });
      if (res.ok) { showToast('Deleted successfully', 'success'); fetchData(); }
      else showToast('Failed to delete', 'error');
    } catch(e) { showToast('Error deleting', 'error'); }
  };
`;
code = code.replace(statesStr, newStates);

const txHandler = `const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    setTxLoading(true);
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: txType, amount: txAmount, description: txDesc, date: txDate, category: txCategory, accountId: txAccountId, clientId: txClientId, notes: txNotes })
      });
      if (res.ok) {
        showToast('Transaction added!', 'success');
        setIsTxModalOpen(false); setTxDesc(''); setTxAmount(''); setTxNotes('');
        fetchData();
      } else showToast('Failed to add', 'error');
    } catch (err) { showToast('Error adding transaction', 'error'); } 
    finally { setTxLoading(false); }
  };`;
const newTxHandler = `const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    setTxLoading(true);
    try {
      const url = editingTxId ? \`/api/transactions/\${editingTxId}\` : '/api/transactions';
      const method = editingTxId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: txType, amount: txAmount, description: txDesc, date: txDate, category: txCategory, accountId: txAccountId, clientId: txClientId, notes: txNotes })
      });
      if (res.ok) {
        showToast(\`Transaction \${editingTxId ? 'updated' : 'added'}!\`, 'success');
        setIsTxModalOpen(false); setTxDesc(''); setTxAmount(''); setTxNotes(''); setEditingTxId(null);
        fetchData();
      } else showToast('Failed to save', 'error');
    } catch (err) { showToast('Error saving transaction', 'error'); } 
    finally { setTxLoading(false); }
  };`;
code = code.replace(txHandler, newTxHandler);

const budHandler = `const handleAddBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/budgets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: budgetCategory, limitAmount: budgetLimit, month: new Date().toISOString().substring(0, 7) })
      });
      if (res.ok) { showToast('Budget set!', 'success'); setIsBudgetModalOpen(false); fetchData(); }
    } catch (err) { showToast('Failed to set budget', 'error'); }
  };`;
const newBudHandler = `const handleAddBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editingBudgetId ? \`/api/budgets/\${editingBudgetId}\` : '/api/budgets';
      const method = editingBudgetId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: budgetCategory, limitAmount: budgetLimit, month: new Date().toISOString().substring(0, 7) })
      });
      if (res.ok) { showToast('Budget saved!', 'success'); setIsBudgetModalOpen(false); setEditingBudgetId(null); fetchData(); }
    } catch (err) { showToast('Failed to save budget', 'error'); }
  };`;
code = code.replace(budHandler, newBudHandler);

const recHandler = `const handleAddRecurring = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/recurring', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: recType, description: recDesc, amount: recAmount, accountId: recAccountId, category: recCategory, interval: recInterval, nextRunDate: recNextRun })
      });
      if (res.ok) { showToast('Recurring added!', 'success'); setIsRecurringModalOpen(false); fetchData(); }
    } catch (err) { showToast('Failed to add recurring', 'error'); }
  };`;
const newRecHandler = `const handleAddRecurring = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editingRecurringId ? \`/api/recurring/\${editingRecurringId}\` : '/api/recurring';
      const method = editingRecurringId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: recType, description: recDesc, amount: recAmount, accountId: recAccountId, category: recCategory, interval: recInterval, nextRunDate: recNextRun })
      });
      if (res.ok) { showToast('Recurring saved!', 'success'); setIsRecurringModalOpen(false); setEditingRecurringId(null); fetchData(); }
    } catch (err) { showToast('Failed to save recurring', 'error'); }
  };`;
code = code.replace(recHandler, newRecHandler);

const cliHandler = `const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/clients', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: clientName, email: clientEmail })
      });
      if (res.ok) { showToast(\`\${singleClientTerm} added!\`, 'success'); setIsClientModalOpen(false); setClientName(''); fetchData(); }
    } catch (err) {}
  };`;
const newCliHandler = `const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editingClientId ? \`/api/clients/\${editingClientId}\` : '/api/clients';
      const method = editingClientId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: clientName, email: clientEmail })
      });
      if (res.ok) { showToast(\`\${singleClientTerm} saved!\`, 'success'); setIsClientModalOpen(false); setClientName(''); setEditingClientId(null); fetchData(); }
    } catch (err) {}
  };`;
code = code.replace(cliHandler, newCliHandler);

const catHandler = `const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/categories', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCategoryName })
      });
      if (res.ok) { showToast('Category added!', 'success'); setIsCategoryModalOpen(false); setNewCategoryName(''); fetchData(); }
    } catch (e) {}
  };`;
const newCatHandler = `const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editingCategoryId ? \`/api/categories/\${editingCategoryId}\` : '/api/categories';
      const method = editingCategoryId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCategoryName })
      });
      if (res.ok) { showToast('Category saved!', 'success'); setIsCategoryModalOpen(false); setNewCategoryName(''); setEditingCategoryId(null); fetchData(); }
    } catch (e) {}
  };`;
code = code.replace(catHandler, newCatHandler);

const accHandler = `const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newAccountName, type: newAccountType, initialBalance: Number(newAccountBalance) })
      });
      if (res.ok) { showToast('Account added!', 'success'); setIsAccountModalOpen(false); setNewAccountName(''); setNewAccountBalance('0'); fetchData(); }
    } catch (e) {}
  };`;
const newAccHandler = `const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editingAccountId ? \`/api/accounts/\${editingAccountId}\` : '/api/accounts';
      const method = editingAccountId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newAccountName, type: newAccountType, initialBalance: Number(newAccountBalance) })
      });
      if (res.ok) { showToast('Account saved!', 'success'); setIsAccountModalOpen(false); setNewAccountName(''); setNewAccountBalance('0'); setEditingAccountId(null); fetchData(); }
    } catch (e) {}
  };`;
code = code.replace(accHandler, newAccHandler);

fs.writeFileSync('src/components/MoneyOSDashboard.tsx', code);
console.log('States & Handlers updated');
