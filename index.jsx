import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, 
  Settings, 
  Plus, 
  RefreshCw, 
  ExternalLink, 
  User, 
  MessageSquare,
  Clock,
  MoreHorizontal,
  X,
  Save,
  Trash2
} from 'lucide-react';

// Firebase Imports
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, onSnapshot, addDoc, deleteDoc, updateDoc } from 'firebase/firestore';

// --- CONFIGURACIÓN DE ENTORNO ---
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'chatwoot-kanban-sync';

const App = () => {
  // --- ESTADOS ---
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [panels, setPanels] = useState([]);
  const [activePanelId, setActivePanelId] = useState(null);
  const [config, setConfig] = useState({
    baseUrl: '',
    apiToken: '',
    accountId: ''
  });

  // 1. Autenticación (Regla 3)
  useEffect(() => {
    const initAuth = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token);
      } else {
        await signInAnonymously(auth);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // 2. Cargar Configuración Local
  useEffect(() => {
    const saved = localStorage.getItem('cw_kanban_config');
    if (saved) {
      const parsed = JSON.parse(saved);
      setConfig(parsed);
      if (parsed.apiToken && parsed.baseUrl && parsed.accountId) setIsConfigured(true);
    } else {
      setShowConfig(true);
    }
  }, []);

  // 3. Listener de Paneles en Firestore (Regla 1)
  useEffect(() => {
    if (!user) return;
    const q = collection(db, 'artifacts', appId, 'public', 'data', 'kanban_panels');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedPanels = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPanels(fetchedPanels);
      if (fetchedPanels.length > 0 && !activePanelId) setActivePanelId(fetchedPanels[0].id);
    });
    return () => unsubscribe();
  }, [user]);

  // 4. Sincronización con Chatwoot API
  const syncChatwootData = async () => {
    if (!isConfigured) return;
    setLoading(true);
    try {
      const headers = { 'api_access_token': config.apiToken, 'Content-Type': 'application/json' };
      // Obtenemos conversaciones (entradas)
      const res = await fetch(`${config.baseUrl}/api/v1/accounts/${config.accountId}/conversations`, { headers });
      const data = await res.json();
      if (data.payload) setConversations(data.payload);
    } catch (error) {
      console.error("Error sincronizando:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isConfigured) syncChatwootData();
    // Auto-sync cada 5 minutos
    const interval = setInterval(syncChatwootData, 300000);
    return () => clearInterval(interval);
  }, [isConfigured, config]);

  // --- LÓGICA DE FILTRADO ---
  const activePanelData = useMemo(() => panels.find(p => p.id === activePanelId), [panels, activePanelId]);

  const kanbanData = useMemo(() => {
    if (!activePanelData) return {};
    const groups = {};
    activePanelData.columns.forEach(col => groups[col.toLowerCase()] = []);
    
    conversations.forEach(conv => {
      conv.labels?.forEach(label => {
        const lowerLabel = label.toLowerCase();
        if (groups[lowerLabel]) groups[lowerLabel].push(conv);
      });
    });
    return groups;
  }, [conversations, activePanelData]);

  if (showConfig) return <ConfigView config={config} setConfig={setConfig} onSave={() => { setIsConfigured(true); setShowConfig(false); localStorage.setItem('cw_kanban_config', JSON.stringify(config)); }} />;

  return (
    <div className="flex h-screen bg-slate-50 font-sans overflow-hidden">
      {/* Sidebar de Paneles */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center gap-2 text-indigo-600 mb-2">
            <LayoutDashboard size={20} />
            <span className="font-bold text-lg tracking-tight">Kanban Sync</span>
          </div>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Dashboard App</p>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          <div className="flex items-center justify-between px-2 mb-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Tus Flujos</span>
            <button onClick={() => createNewPanel(db, appId)} className="text-indigo-600 hover:bg-indigo-50 p-1 rounded-md transition-all"><Plus size={14}/></button>
          </div>
          {panels.map(p => (
            <button 
              key={p.id}
              onClick={() => setActivePanelId(p.id)}
              className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-all flex items-center justify-between group ${activePanelId === p.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <span className="truncate">{p.name}</span>
              <Trash2 size={12} className={`opacity-0 group-hover:opacity-60 hover:!opacity-100 ${activePanelId === p.id ? 'text-white' : 'text-red-500'}`} onClick={(e) => { e.stopPropagation(); deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'kanban_panels', p.id)); }} />
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-100">
          <button onClick={() => setShowConfig(true)} className="w-full flex items-center gap-2 px-4 py-2 text-slate-500 hover:text-slate-800 text-sm font-medium transition-all">
            <Settings size={18} /> Configuración
          </button>
        </div>
      </aside>

      {/* Área Principal */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0">
          <h2 className="text-lg font-bold text-slate-800">{activePanelData?.name || 'Selecciona un Panel'}</h2>
          <div className="flex items-center gap-4">
            <button onClick={syncChatwootData} className={`p-2 rounded-full hover:bg-slate-100 text-slate-400 transition-all ${loading ? 'animate-spin text-indigo-600' : ''}`}>
              <RefreshCw size={20} />
            </button>
            <div className="h-8 w-px bg-slate-200" />
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs uppercase">
                {config.accountId}
              </div>
            </div>
          </div>
        </header>

        {/* Tablero Kanban */}
        <div className="flex-1 overflow-x-auto p-8 flex gap-6 items-start bg-slate-50/50">
          {activePanelData?.columns.map(col => (
            <div key={col} className="flex flex-col min-w-[320px] w-[320px] max-h-full">
              <div className="flex items-center justify-between mb-4 px-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-slate-700 capitalize text-sm">{col}</h3>
                  <span className="bg-slate-200 text-slate-500 text-[10px] font-bold px-2 py-0.5 rounded-full">{kanbanData[col.toLowerCase()]?.length || 0}</span>
                </div>
                <MoreHorizontal size={16} className="text-slate-300" />
              </div>

              <div className="space-y-4 overflow-y-auto pr-2 custom-scrollbar pb-10">
                {kanbanData[col.toLowerCase()]?.map(item => (
                  <div key={item.id} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all group cursor-pointer active:scale-95">
                    <div className="flex justify-between items-start mb-3">
                      <span className="text-[10px] font-bold text-slate-300 tracking-wider">#{item.id}</span>
                      <a href={`${config.baseUrl}/app/accounts/${config.accountId}/conversations/${item.id}`} target="_blank" rel="noreferrer" className="text-slate-300 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-all">
                        <ExternalLink size={14} />
                      </a>
                    </div>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-50 to-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs">
                        {item.meta.sender.name.charAt(0)}
                      </div>
                      <div className="overflow-hidden">
                        <h4 className="text-sm font-bold text-slate-800 truncate">{item.meta.sender.name}</h4>
                        <p className="text-[10px] text-slate-400 font-medium truncate">{item.meta.sender.email || 'Sin correo'}</p>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed mb-4">
                      {item.messages?.[0]?.content || "Sin mensajes recientes..."}
                    </p>
                    <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                      <div className="flex items-center gap-3 text-slate-400">
                        <div className="flex items-center gap-1 text-[10px] font-bold"><MessageSquare size={12}/> {item.messages_count}</div>
                        <div className="flex items-center gap-1 text-[10px] font-bold"><Clock size={12}/> {new Date(item.timestamp * 1000).toLocaleDateString()}</div>
                      </div>
                      <div className="flex -space-x-1">
                        {item.meta.assignee ? (
                          <img src={item.meta.assignee.avatar_url} className="w-6 h-6 rounded-full border-2 border-white shadow-sm" alt="agent" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-[8px] font-bold text-slate-400">?</div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          
          {!activePanelId && (
            <div className="flex-1 flex flex-col items-center justify-center h-64 border-2 border-dashed border-slate-200 rounded-3xl text-slate-400">
              <LayoutDashboard size={48} className="mb-4 opacity-10" />
              <p className="font-medium">Crea tu primer panel para empezar</p>
              <button onClick={() => createNewPanel(db, appId)} className="mt-4 bg-indigo-600 text-white px-6 py-2 rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-indigo-100">Crear Panel</button>
            </div>
          )}
        </div>
      </main>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
      `}} />
    </div>
  );
};

// --- COMPONENTES DE APOYO ---

const ConfigView = ({ config, setConfig, onSave }) => (
  <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6 font-sans">
    <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl w-full max-w-md border border-slate-200 text-center">
      <div className="bg-indigo-600 p-4 rounded-3xl text-white shadow-xl shadow-indigo-100 w-fit mx-auto mb-6"><Settings size={32} /></div>
      <h2 className="text-3xl font-black text-slate-900 mb-2 tracking-tighter">Configuración</h2>
      <p className="text-slate-400 text-sm mb-8 font-medium">Conecta tu Kanban con Chatwoot</p>
      <div className="space-y-4 text-left">
        <InputField label="Chatwoot Base URL" value={config.baseUrl} onChange={v => setConfig({...config, baseUrl: v})} placeholder="https://app.chatwoot.com" />
        <InputField label="Account ID" value={config.accountId} onChange={v => setConfig({...config, accountId: v})} placeholder="1" />
        <InputField label="API Access Token" value={config.apiToken} onChange={v => setConfig({...config, apiToken: v})} placeholder="Token de perfil de agente" type="password" />
        <button onClick={onSave} className="w-full bg-slate-900 hover:bg-indigo-600 text-white font-bold py-4 rounded-2xl shadow-xl mt-4 transition-all uppercase text-xs tracking-widest">Conectar Ahora</button>
      </div>
    </div>
  </div>
);

const InputField = ({ label, value, onChange, placeholder, type = "text" }) => (
  <div>
    <label className="text-[10px] font-black text-slate-400 uppercase ml-1 mb-2 block tracking-widest">{label}</label>
    <input type={type} value={value} onChange={e => onChange(e.target.value)} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium" placeholder={placeholder} />
  </div>
);

const createNewPanel = async (db, appId) => {
  const name = prompt("Nombre del nuevo panel (ej: Ventas):");
  if (!name) return;
  const columns = prompt("Etiquetas separadas por coma (ej: nuevo, interesado, cerrado):");
  if (!columns) return;
  
  await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'kanban_panels'), {
    name,
    columns: columns.split(',').map(c => c.trim()),
    createdAt: new Date().toISOString()
  });
};

export default App;
