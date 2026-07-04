import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, 
  Upload, 
  TrendingUp, 
  ShoppingBag, 
  FileText, 
  DollarSign, 
  Plus, 
  Search, 
  Play, 
  Pause, 
  ChevronLeft, 
  Trash2, 
  Tag, 
  RefreshCw, 
  Sparkles,
  HelpCircle,
  CheckCircle2,
  Calendar,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Globe
} from 'lucide-react';

// Interfaces matching D1 database schemas
interface Note {
  id: string;
  type: 'voice' | 'invoice' | 'text';
  audio_key?: string;
  screenshot_key?: string;
  raw_transcript: string;
  structured_json: string; // JSON String
  summary: string;
  tag: string;
  created_at: string;
}

interface InventoryItem {
  id: string;
  name: string;
  sku?: string;
  quantity: number;
  price: number;
  currency: string;
  updated_at: string;
}

interface Transaction {
  id: string;
  amount: number;
  currency: string;
  description: string;
  transaction_type: 'income' | 'expense';
  created_at: string;
}

// Initial Mock Data (Fallback if Worker is not running)
const MOCK_NOTES: Note[] = [
  {
    id: "note_1",
    type: "voice",
    raw_transcript: "أهلاً لين، أريد إضافة 15 قطعة جديدة من العباءات المخملية السوداء للمخزون بسعر 450 درهم للقطعة وتعديل الـ SKU ليكون velvet-blk-01",
    summary: "إضافة 15 عباءة مخملية سوداء بسعر 450 درهم إماراتي للقطعة وتعيين الرمز velvet-blk-01.",
    tag: "inventory",
    structured_json: JSON.stringify({
      type: "inventory_update",
      items: [{ name: "عباءة مخملية سوداء", quantity: 15, price: 450, sku: "velvet-blk-01" }],
      currency: "AED"
    }),
    created_at: new Date(Date.now() - 1000 * 60 * 15).toISOString() // 15 mins ago
  },
  {
    id: "note_2",
    type: "invoice",
    raw_transcript: "إيصال دفع مستلم من منصة نون بقيمة 1,250 درهم إماراتي لعميلة في دبي كقيمة بيع فستانين مطرزين",
    summary: "مبيعات نون بقيمة 1,250 درهم إماراتي لفستانين مطرزين لعميلة في دبي.",
    tag: "sales",
    structured_json: JSON.stringify({
      type: "sale",
      amount: 1250,
      currency: "AED",
      description: "بيع فستانين مطرزين عبر نون - دبي"
    }),
    created_at: new Date(Date.now() - 1000 * 60 * 120).toISOString() // 2 hours ago
  },
  {
    id: "note_3",
    type: "voice",
    raw_transcript: "لين، سجلي فكرة إطلاق حملة إعلانية على انستغرام وتيك توك للترويج للمجموعة الرمضانية الجديدة في دبي وأبوظبي مع بداية الشهر القادم",
    summary: "تسجيل فكرة تسويقية لإطلاق حملة إعلانية للمجموعة الرمضانية على تيك توك وانستغرام الشهر القادم.",
    tag: "idea",
    structured_json: JSON.stringify({
      type: "todo",
      description: "إطلاق حملة إعلانية للمجموعة الرمضانية على وسائل التواصل الاجتماعي"
    }),
    created_at: new Date(Date.now() - 1000 * 60 * 360).toISOString() // 6 hours ago
  }
];

const MOCK_INVENTORY: InventoryItem[] = [
  { id: "inv_1", name: "عباءة مخملية سوداء", quantity: 15, price: 450, currency: "AED", updated_at: new Date().toISOString() },
  { id: "inv_2", name: "فستان حرير مطرز", quantity: 8, price: 625, currency: "AED", updated_at: new Date().toISOString() },
  { id: "inv_3", name: "قفطان شيفون pastel", quantity: 12, price: 380, currency: "AED", updated_at: new Date().toISOString() }
];

const MOCK_TRANSACTIONS: Transaction[] = [
  { id: "tx_1", amount: 1250, currency: "AED", description: "بيع فستانين مطرزين عبر نون - دبي", transaction_type: "income", created_at: new Date(Date.now() - 1000 * 60 * 120).toISOString() },
  { id: "tx_2", amount: 450, currency: "AED", description: "شراء خامات حرير طبيعي للتطريز", transaction_type: "expense", created_at: new Date(Date.now() - 1000 * 60 * 1440).toISOString() }
];

export default function App() {
  const [userId] = useState<string>("user_fnd_01");
  const [userName] = useState<string>("يُسرى");
  const [notes, setNotes] = useState<Note[]>(MOCK_NOTES);
  const [inventory, setInventory] = useState<InventoryItem[]>(MOCK_INVENTORY);
  const [transactions, setTransactions] = useState<Transaction[]>(MOCK_TRANSACTIONS);
  const [activeTab, setActiveTab] = useState<'all' | 'voice' | 'invoice' | 'inventory' | 'sales'>('all');
  const [search, setSearch] = useState<string>('');
  
  // Simulated API check
  const [isUsingRealApi, setIsUsingRealApi] = useState<boolean>(false);
  const [apiEndpoint] = useState<string>("http://localhost:8787/api");

  // Voice Recording Simulator State
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [soundwave, setSoundwave] = useState<number[]>([10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10]);
  const recordingTimer = useRef<NodeJS.Timeout | null>(null);
  const waveTimer = useRef<NodeJS.Timeout | null>(null);

  // Playback Simulation
  const [playingNoteId, setPlayingNoteId] = useState<string | null>(null);
  const [playbackProgress, setPlaybackProgress] = useState<number>(0);
  const playbackInterval = useRef<NodeJS.Timeout | null>(null);

  // File Upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadSuccessMsg, setUploadSuccessMsg] = useState<string | null>(null);

  // Drawer for JSON detailed view
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);

  // Fetch real data if API is online
  useEffect(() => {
    const checkApiStatus = async () => {
      try {
        const res = await fetch(`${apiEndpoint}/dashboard?userId=${userId}`);
        if (res.ok) {
          setIsUsingRealApi(true);
          // Load real data
          loadRealData();
        }
      } catch (e) {
        console.log("Local backend is not running, using high-fidelity mock environment.");
      }
    };
    checkApiStatus();
  }, []);

  const loadRealData = async () => {
    try {
      const [notesRes, invRes, txRes] = await Promise.all([
        fetch(`${apiEndpoint}/notes?userId=${userId}`),
        fetch(`${apiEndpoint}/inventory?userId=${userId}`),
        fetch(`${apiEndpoint}/transactions?userId=${userId}`)
      ]);
      if (notesRes.ok) setNotes(await notesRes.json());
      if (invRes.ok) setInventory(await invRes.json());
      if (txRes.ok) setTransactions(await txRes.json());
    } catch (e) {
      console.error("Error loading real API data:", e);
    }
  };

  // Recording Simulation Logic
  const startRecording = () => {
    setIsRecording(true);
    setRecordingSeconds(0);
    setPlayingNoteId(null);
    clearInterval(playbackInterval.current!);

    recordingTimer.current = setInterval(() => {
      setRecordingSeconds(prev => prev + 1);
    }, 1000);

    waveTimer.current = setInterval(() => {
      setSoundwave(Array.from({ length: 15 }, () => Math.floor(Math.random() * 40) + 8));
    }, 120);
  };

  const stopAndSaveRecording = async () => {
    if (recordingSeconds < 2) {
      alert("يرجى التسجيل لثانيتين على الأقل.");
      cancelRecording();
      return;
    }

    setIsUploading(true);
    clearInterval(recordingTimer.current!);
    clearInterval(waveTimer.current!);

    // Simulating Gemini Processing
    setTimeout(() => {
      const newNoteId = "note_" + Math.random().toString(36).substring(2, 9);
      const isInventory = Math.random() > 0.5;

      const newNote: Note = {
        id: newNoteId,
        type: 'voice',
        raw_transcript: isInventory 
          ? "أهلاً لين، حدثي المخزون بإضافة 5 قفاطين شيفون بسعر 380 درهم للقطعة" 
          : "مبيعات نقدية بقيمة 850 درهم من زبونة في عجمان لفستان حريري",
        summary: isInventory
          ? "تحديث المخزون: إضافة 5 قفاطين شيفون بسعر 380 درهم إماراتي."
          : "تسجيل دفعة مبيعات نقدية بقيمة 850 درهم لعميلة في عجمان.",
        tag: isInventory ? "inventory" : "sales",
        structured_json: JSON.stringify(
          isInventory 
            ? { type: "inventory_update", items: [{ name: "قفطان شيفون pastel", quantity: 5, price: 380 }] }
            : { type: "sale", amount: 850, currency: "AED", description: "بيع فستان حرير - عجمان" }
        ),
        created_at: new Date().toISOString()
      };

      // Add to local state
      setNotes(prev => [newNote, ...prev]);

      if (isInventory) {
        // Update mock inventory item
        setInventory(prev => prev.map(item => {
          if (item.name === "قفطان شيفون pastel") {
            return { ...item, quantity: item.quantity + 5, updated_at: new Date().toISOString() };
          }
          return item;
        }));
      } else {
        // Add transaction
        const newTx: Transaction = {
          id: "tx_" + Math.random().toString(36).substring(2, 9),
          amount: 850,
          currency: "AED",
          description: "بيع فستان حرير - عجمان",
          transaction_type: "income",
          created_at: new Date().toISOString()
        };
        setTransactions(prev => [newTx, ...prev]);
      }

      setIsRecording(false);
      setIsUploading(false);
    }, 2000);
  };

  const cancelRecording = () => {
    setIsRecording(false);
    clearInterval(recordingTimer.current!);
    clearInterval(waveTimer.current!);
    setSoundwave(Array.from({ length: 15 }, () => 10));
  };

  // Playback Simulation Logic
  const togglePlayAudio = (noteId: string) => {
    if (playingNoteId === noteId) {
      setPlayingNoteId(null);
      clearInterval(playbackInterval.current!);
    } else {
      setPlayingNoteId(noteId);
      setPlaybackProgress(0);
      playbackInterval.current = setInterval(() => {
        setPlaybackProgress(prev => {
          if (prev >= 100) {
            setPlayingNoteId(null);
            clearInterval(playbackInterval.current!);
            return 0;
          }
          return prev + 10;
        });
      }, 300);
    }
  };

  // Upload Invoice Screen Simulation
  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    setIsUploading(true);
    // Simulate R2 Upload & Gemini Processing
    setTimeout(() => {
      const newNoteId = "note_" + Math.random().toString(36).substring(2, 9);
      const amount = Math.floor(Math.random() * 400) + 150;
      
      const newNote: Note = {
        id: newNoteId,
        type: 'invoice',
        raw_transcript: `فاتورة رقم 987452 - إيصال شراء مستلزمات تغليف وصناديق شحن بقيمة ${amount} درهم إماراتي`,
        summary: `إثبات مصروفات: شراء صناديق شحن ومستلزمات تغليف بقيمة ${amount} درهم إماراتي.`,
        tag: "sales",
        structured_json: JSON.stringify({
          type: "expense",
          amount: amount,
          currency: "AED",
          description: "مصروفات شحن وتغليف"
        }),
        created_at: new Date().toISOString()
      };

      setNotes(prev => [newNote, ...prev]);
      
      // Update transaction list with expense
      const newTx: Transaction = {
        id: "tx_" + Math.random().toString(36).substring(2, 9),
        amount: amount,
        currency: "AED",
        description: "مصروفات شحن وتغليف",
        transaction_type: "expense",
        created_at: new Date().toISOString()
      };
      setTransactions(prev => [newTx, ...prev]);

      setIsUploading(false);
      setUploadSuccessMsg("تم رفع وتحليل الفاتورة بنجاح بواسطة لِين!");
      setTimeout(() => setUploadSuccessMsg(null), 3000);
    }, 2000);
  };

  const deleteNote = (id: string) => {
    setNotes(prev => prev.filter(n => n.id !== id));
  };

  // Statistics Calculation
  const totalIncome = transactions
    .filter(t => t.transaction_type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpenses = transactions
    .filter(t => t.transaction_type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);

  const filteredNotes = notes.filter(n => {
    if (activeTab === 'voice' && n.type !== 'voice') return false;
    if (activeTab === 'invoice' && n.type !== 'invoice') return false;
    if (activeTab === 'inventory' && n.tag !== 'inventory') return false;
    if (activeTab === 'sales' && n.tag !== 'sales') return false;
    
    if (search) {
      const q = search.toLowerCase();
      return n.raw_transcript.toLowerCase().includes(q) || n.summary.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-[#FAF6F0] text-[#2B2B2B] flex flex-col font-sans transition-all duration-300">
      
      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-white/70 border-b border-[#E5D5C5]/40 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-brand-olive text-white p-2.5 rounded-2xl flex items-center justify-center shadow-lg shadow-brand-olive/20">
            <Sparkles className="w-5 h-5 text-brand-sand animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-brand-olive flex items-center gap-1.5">
              لِين
              <span className="text-xs bg-brand-warm text-brand-clay font-medium px-2 py-0.5 rounded-full border border-brand-clay/10">
                مساعد الذكاء الاصطناعي
              </span>
            </h1>
            <p className="text-[11px] text-gray-500">منصة إدارة الأعمال الذكية للمؤسِّسات</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 bg-[#F4ECE1]/60 px-3 py-1.5 rounded-xl border border-brand-sand/30">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
            <span className="text-xs text-brand-olive font-medium">سيدة الأعمال: {userName}</span>
            <span className="text-xs text-gray-400">|</span>
            <span className="text-[10px] bg-brand-clay text-white px-2 py-0.5 rounded-md font-bold">باقة الريادة</span>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <Globe className="w-4 h-4 text-brand-clay" />
            <span className="font-semibold text-brand-olive">AED</span>
          </div>

          {/* Real API Status Indicator */}
          <div className="flex items-center gap-1">
            <span className={`w-2.5 h-2.5 rounded-full ${isUsingRealApi ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
            <span className="text-[10px] font-semibold text-gray-500 hidden md:inline">
              {isUsingRealApi ? 'الخلفية متصلة' : 'بيئة محاكاة'}
            </span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Quick Actions & State Status (Col 4) */}
        <section className="lg:col-span-4 space-y-6">
          
          {/* Smart Mic / Voice Input Card */}
          <div className="bg-white rounded-3xl p-6 border border-[#E5D5C5]/40 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#F4ECE1]/40 rounded-full blur-3xl -z-10"></div>
            
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-bold text-brand-olive text-lg">ميكروفون لِين الذكي</h3>
                <p className="text-xs text-gray-500">اضغطي للتحدث وسجلي تفاصيل مبيعاتكِ أو مخزونكِ بالصوت</p>
              </div>
              <div className="bg-brand-warm/60 p-2 rounded-xl text-brand-clay">
                <Mic className="w-4 h-4" />
              </div>
            </div>

            {/* Recorder Interface */}
            <div className="flex flex-col items-center justify-center py-6">
              {isRecording ? (
                <div className="w-full flex flex-col items-center space-y-4">
                  {/* Waveform Animation */}
                  <div className="flex items-end justify-center gap-1.5 h-16 w-full px-4">
                    {soundwave.map((height, i) => (
                      <div 
                        key={i} 
                        style={{ height: `${height}%` }} 
                        className="w-1.5 bg-brand-clay rounded-full transition-all duration-100 ease-out"
                      ></div>
                    ))}
                  </div>
                  
                  {/* Timer */}
                  <div className="text-xl font-bold font-mono text-brand-olive">
                    {String(Math.floor(recordingSeconds / 60)).padStart(2, '0')}:
                    {String(recordingSeconds % 60).padStart(2, '0')}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-4 w-full">
                    <button 
                      onClick={cancelRecording} 
                      className="flex-1 py-2.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold transition"
                    >
                      إلغاء
                    </button>
                    <button 
                      onClick={stopAndSaveRecording} 
                      className="flex-1 py-2.5 bg-brand-olive text-white rounded-xl hover:bg-[#233226]/90 text-xs font-semibold transition flex items-center justify-center gap-1 shadow-md shadow-brand-olive/10"
                    >
                      حفظ وتحليل
                    </button>
                  </div>
                </div>
              ) : (
                <button 
                  onClick={startRecording}
                  disabled={isUploading}
                  className="w-24 h-24 rounded-full bg-gradient-to-tr from-brand-clay to-[#E09070] text-white flex items-center justify-center shadow-lg shadow-brand-clay/35 hover:scale-105 active:scale-95 transition-transform duration-200 disabled:opacity-50"
                >
                  <Mic className="w-10 h-10 animate-pulse" />
                </button>
              )}

              {!isRecording && !isUploading && (
                <span className="text-xs text-gray-400 mt-4">انقري لبدء تسجيل صوت فوري</span>
              )}
              {isUploading && (
                <div className="flex items-center gap-2 mt-4 text-xs text-brand-clay font-medium animate-pulse">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  أهلاً بكِ، أقوم بتحليل الصوت واستخراج البيانات فوراً...
                </div>
              )}
            </div>
          </div>

          {/* Quick Invoice Upload */}
          <div className="bg-white rounded-3xl p-6 border border-[#E5D5C5]/40 shadow-sm">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-bold text-brand-olive text-lg">تحميل الفواتير الورقية</h3>
                <p className="text-xs text-gray-500">أرفقي لقطة شاشة للتحويل البنكي أو صورة إيصال المصروفات</p>
              </div>
              <div className="bg-brand-warm/60 p-2 rounded-xl text-brand-clay">
                <Upload className="w-4 h-4" />
              </div>
            </div>

            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              accept="image/*" 
              className="hidden" 
            />

            <button 
              onClick={triggerFileUpload}
              disabled={isUploading}
              className="w-full border-2 border-dashed border-brand-sand/50 rounded-2xl p-6 flex flex-col items-center justify-center gap-2 text-brand-olive hover:border-brand-clay/50 hover:bg-[#FAF6F0]/30 transition group"
            >
              <Upload className="w-8 h-8 text-brand-clay group-hover:scale-110 transition-transform" />
              <span className="text-xs font-semibold">تصفح الصور أو إسقاط الفاتورة هنا</span>
              <span className="text-[10px] text-gray-400">JPG, PNG تصل إلى 5 ميجا</span>
            </button>

            {uploadSuccessMsg && (
              <div className="mt-3 bg-emerald-50 border border-emerald-100 rounded-xl p-2.5 flex items-center gap-2 text-[11px] text-emerald-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{uploadSuccessMsg}</span>
              </div>
            )}
          </div>

          {/* Quick Inventory List */}
          <div className="bg-white rounded-3xl p-6 border border-[#E5D5C5]/40 shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-brand-olive text-lg">المخزون السريع</h3>
              <span className="text-[10px] bg-brand-warm text-brand-olive font-bold px-2 py-0.5 rounded-md">
                {inventory.length} منتجات
              </span>
            </div>

            <div className="space-y-3">
              {inventory.map((item) => (
                <div key={item.id} className="flex justify-between items-center p-3 rounded-2xl bg-[#FAF6F0]/40 border border-gray-100 hover:border-brand-sand/20 transition">
                  <div>
                    <h4 className="text-xs font-bold text-brand-olive">{item.name}</h4>
                    <span className="text-[10px] text-gray-400">آخر تحديث: {new Date(item.updated_at).toLocaleDateString('ar-AE')}</span>
                  </div>
                  <div className="text-left">
                    <div className="text-xs font-bold text-brand-clay font-mono">{item.quantity} قطع</div>
                    <div className="text-[10px] text-gray-400 font-mono">{item.price} AED</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </section>

        {/* Right Column: Analytics & Notes Stream (Col 8) */}
        <section className="lg:col-span-8 space-y-6">
          
          {/* Quick Analytics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            
            {/* Stat 1 */}
            <div className="bg-white rounded-2xl p-4 border border-[#E5D5C5]/30 shadow-sm">
              <div className="flex justify-between items-center text-gray-400 mb-2">
                <span className="text-[11px] font-medium text-gray-500">إجمالي المبيعات</span>
                <div className="bg-emerald-50 p-1.5 rounded-lg text-emerald-600">
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="text-lg font-bold text-brand-olive font-mono">{totalIncome.toLocaleString()}</div>
              <span className="text-[10px] text-emerald-600 font-medium">AED</span>
            </div>

            {/* Stat 2 */}
            <div className="bg-white rounded-2xl p-4 border border-[#E5D5C5]/30 shadow-sm">
              <div className="flex justify-between items-center text-gray-400 mb-2">
                <span className="text-[11px] font-medium text-gray-500">المصروفات</span>
                <div className="bg-rose-50 p-1.5 rounded-lg text-rose-600">
                  <ArrowDownRight className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="text-lg font-bold text-brand-olive font-mono">{totalExpenses.toLocaleString()}</div>
              <span className="text-[10px] text-rose-600 font-medium">AED</span>
            </div>

            {/* Stat 3 */}
            <div className="bg-white rounded-2xl p-4 border border-[#E5D5C5]/30 shadow-sm">
              <div className="flex justify-between items-center text-gray-400 mb-2">
                <span className="text-[11px] font-medium text-gray-500">المخزون الكلي</span>
                <div className="bg-amber-50 p-1.5 rounded-lg text-amber-600">
                  <ShoppingBag className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="text-lg font-bold text-brand-olive font-mono">
                {inventory.reduce((acc, curr) => acc + curr.quantity, 0)}
              </div>
              <span className="text-[10px] text-gray-400">قطعة متوفرة</span>
            </div>

            {/* Stat 4 */}
            <div className="bg-white rounded-2xl p-4 border border-[#E5D5C5]/30 shadow-sm">
              <div className="flex justify-between items-center text-gray-400 mb-2">
                <span className="text-[11px] font-medium text-gray-500">ملاحظات الذكاء</span>
                <div className="bg-blue-50 p-1.5 rounded-lg text-blue-600">
                  <FileText className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="text-lg font-bold text-brand-olive font-mono">{notes.length}</div>
              <span className="text-[10px] text-gray-400">مدخلات معالجة</span>
            </div>

          </div>

          {/* Notes Log stream */}
          <div className="bg-white rounded-3xl p-6 border border-[#E5D5C5]/40 shadow-sm space-y-6">
            
            {/* Filters & Search */}
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center border-b border-gray-100 pb-4">
              <div>
                <h3 className="font-bold text-brand-olive text-lg">سجل الملاحظات والعمليات</h3>
                <p className="text-xs text-gray-500">مراجعة البيانات المستخلصة وتدقيقات الذكاء الاصطناعي</p>
              </div>
              
              {/* Search input */}
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-gray-400 absolute right-3 top-2.5" />
                <input 
                  type="text" 
                  placeholder="بحث في التفريغ والملخص..." 
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-[#FAF6F0]/80 border border-brand-sand/30 rounded-xl pr-9 pl-3 py-1.5 text-xs focus:outline-none focus:border-brand-clay transition"
                />
              </div>
            </div>

            {/* Tabs */}
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'all', label: 'الكل' },
                { id: 'voice', label: 'التسجيلات الصوتية' },
                { id: 'invoice', label: 'الفواتير والإيصالات' },
                { id: 'inventory', label: 'تحديثات المخزون' },
                { id: 'sales', label: 'المبيعات والمالية' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`text-xs font-semibold px-4 py-2 rounded-xl transition ${
                    activeTab === tab.id 
                      ? 'bg-brand-olive text-white shadow-md' 
                      : 'bg-[#FAF6F0]/80 text-brand-olive/80 hover:bg-[#FAF6F0] border border-gray-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* List */}
            <div className="space-y-4">
              {filteredNotes.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center text-center">
                  <div className="bg-[#FAF6F0] p-4 rounded-full mb-3 text-brand-clay/60">
                    <Search className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-brand-olive">لم نجد أي نتائج متطابقة</h4>
                  <p className="text-xs text-gray-400 mt-1">جربي تغيير الكلمات أو التبديل بين التبويبات</p>
                </div>
              ) : (
                filteredNotes.map((note) => {
                  const struct = JSON.parse(note.structured_json);
                  const isPlaying = playingNoteId === note.id;

                  return (
                    <div 
                      key={note.id} 
                      className="group border border-gray-100 hover:border-brand-sand/30 rounded-2xl p-4 sm:p-5 bg-[#FAF6F0]/20 hover:bg-white transition duration-200 relative overflow-hidden"
                    >
                      {/* Left-align trash icon for deleting note */}
                      <button 
                        onClick={() => deleteNote(note.id)}
                        className="absolute top-4 left-4 text-gray-300 hover:text-red-500 transition opacity-0 group-hover:opacity-100"
                        title="حذف المدخل"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                            note.type === 'voice' ? 'bg-[#FAF6F0] text-brand-clay border border-brand-clay/10' : 'bg-brand-warm text-brand-olive'
                          }`}>
                            {note.type === 'voice' ? 'ملاحظة صوتية' : 'مستند / فاتورة'}
                          </span>
                          <span className="text-[10px] text-gray-400 flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(note.created_at).toLocaleTimeString('ar-AE', { hour: '2-digit', minute: '2-digit' })} - {new Date(note.created_at).toLocaleDateString('ar-AE')}
                          </span>
                        </div>

                        {/* Tag identifier */}
                        <div className="flex items-center gap-1.5">
                          <Tag className="w-3.5 h-3.5 text-brand-clay" />
                          <span className="text-[11px] font-medium text-brand-olive/80">
                            {note.tag === 'inventory' ? 'المخزون' : note.tag === 'sales' ? 'المالية' : note.tag === 'idea' ? 'أفكار' : 'عام'}
                          </span>
                        </div>
                      </div>

                      {/* Summary */}
                      <h4 className="text-sm font-bold text-brand-olive mb-1 flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-brand-clay shrink-0" />
                        {note.summary}
                      </h4>

                      {/* Audio simulation interface if voice */}
                      {note.type === 'voice' && (
                        <div className="my-3 bg-white border border-[#E5D5C5]/30 rounded-xl p-3 flex items-center gap-3">
                          <button 
                            onClick={() => togglePlayAudio(note.id)}
                            className="bg-brand-warm text-brand-clay p-2 rounded-lg hover:bg-brand-clay hover:text-white transition"
                          >
                            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 text-brand-clay" />}
                          </button>
                          
                          {/* Progress line */}
                          <div className="flex-1 bg-gray-100 h-1.5 rounded-full overflow-hidden">
                            <div 
                              style={{ width: `${isPlaying ? playbackProgress : 0}%` }} 
                              className="bg-brand-clay h-full transition-all duration-300 ease-out"
                            ></div>
                          </div>
                          
                          <span className="text-[10px] text-gray-400 font-mono">0:08</span>
                        </div>
                      )}

                      {/* Raw Transcript toggleable */}
                      <p className="text-xs text-gray-500 leading-relaxed bg-[#FAF6F0]/30 rounded-xl p-3 border border-[#E5D5C5]/10 font-mono">
                        "{note.raw_transcript}"
                      </p>

                      {/* Actions footer */}
                      <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between items-center">
                        <div className="flex items-center gap-4">
                          {struct.amount && (
                            <span className="text-xs font-bold text-brand-olive font-mono">
                              القيمة المستخرجة: <span className="text-brand-clay">{struct.amount} AED</span>
                            </span>
                          )}
                          {struct.items && (
                            <span className="text-xs text-gray-500 font-medium">
                              المخزون المحدث: <span className="font-bold text-brand-olive">{struct.items[0]?.name} (+{struct.items[0]?.quantity})</span>
                            </span>
                          )}
                        </div>

                        <button 
                          onClick={() => setSelectedNote(note)}
                          className="text-[11px] font-bold text-brand-clay hover:underline flex items-center gap-1"
                        >
                          عرض تفاصيل استجابة الـ JSON
                          <ChevronLeft className="w-3 h-3" />
                        </button>
                      </div>

                    </div>
                  );
                })
              )}
            </div>

          </div>

        </section>

      </main>

      {/* JSON Viewer Drawer / Modal */}
      {selectedNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2B2B2B]/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden border border-[#E5D5C5]/50 shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-brand-olive text-white p-5 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-md flex items-center gap-2">
                  <Layers className="w-5 h-5 text-brand-sand" />
                  تفاصيل استجابة JSON للذكاء الاصطناعي
                </h3>
                <p className="text-[10px] text-brand-sand/80">البيانات المهيكلة المخزنة في قاعدة البيانات D1</p>
              </div>
              <button 
                onClick={() => setSelectedNote(null)}
                className="text-white/80 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-xl text-xs font-bold transition"
              >
                إغلاق
              </button>
            </div>
            
            <div className="p-5 flex-1 overflow-y-auto max-h-96">
              <pre className="text-left bg-gray-50 text-[#2B2B2B] p-4 rounded-2xl text-xs font-mono overflow-x-auto border border-gray-100">
                {JSON.stringify(JSON.parse(selectedNote.structured_json), null, 2)}
              </pre>
              
              <div className="mt-4 space-y-2">
                <h4 className="text-xs font-bold text-brand-olive">محتوى التفريغ الحرفي (Raw Transcript):</h4>
                <p className="text-xs text-gray-500 bg-[#FAF6F0] p-3 rounded-xl border border-brand-sand/20">
                  {selectedNote.raw_transcript}
                </p>
              </div>
            </div>

            <div className="bg-gray-50 px-5 py-4 border-t border-gray-100 flex justify-end">
              <button 
                onClick={() => setSelectedNote(null)}
                className="px-5 py-2 bg-brand-olive text-white rounded-xl text-xs font-semibold hover:bg-brand-olive/90 transition"
              >
                فهمت ذلك
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-white border-t border-[#E5D5C5]/40 py-6 px-6 text-center text-xs text-gray-500">
        <p>© {new Date().getFullYear()} لِين (MeetLeen) • تم البناء والتطوير بالكامل على Cloudflare Edge</p>
      </footer>

    </div>
  );
}
