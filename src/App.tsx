import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  PlusCircle, 
  History, 
  AlertTriangle, 
  Database as DbIcon, 
  Search, 
  Download, 
  Trash2, 
  RefreshCw,
  Moon,
  Sun,
  FileText,
  Activity,
  Zap,
  TrendingUp,
  TrendingDown,
  Info,
  Edit2,
  Upload,
  Clock,
  ChevronRight,
  Menu,
  CheckCircle2,
  Filter,
  Eraser
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import * as XLSX from 'xlsx';

import { Network, DailyReport, VlanHistory, TabType, AlertHistory, Vlan } from './types';
import { parseReport, extractPortFromVlanName, analyzeAfterSave, getConsumptionComparison } from './services/vlanLogic';
import { storage } from './services/storage';
import { fetchFirebaseData } from './services/firebase';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Sub-components ---

const TabButton = ({ active, onClick, icon: Icon, label }: { active: boolean, onClick: () => void, icon: any, label: string }) => (
  <button 
    onClick={onClick}
    className={cn(
      "flex flex-col items-center justify-center gap-1 flex-1 transition-all duration-300 py-2",
      active ? "text-indigo-600" : "text-slate-400"
    )}
  >
    <div className={cn(
      "p-1.5 rounded-xl transition-all",
      active && "bg-indigo-50 dark:bg-indigo-900/20 scale-110"
    )}>
      <Icon size={24} />
    </div>
    <span className="text-[10px] font-bold">{label}</span>
    {active && <motion.div layoutId="nav-indicator" className="w-1 h-1 bg-indigo-600 rounded-full mt-0.5" />}
  </button>
);

// --- Main App ---

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('input');
  const [networks, setNetworks] = useState<Record<string, Network>>(storage.loadNetworks());
  const [currentNetworkId, setCurrentNetworkId] = useState<string>(storage.loadCurrentNetworkId());
  const [alertHistory, setAlertHistory] = useState<Record<string, AlertHistory>>(storage.loadAlertHistory());
  const [isDarkMode, setIsDarkMode] = useState(true);
  
  const [reportText, setReportText] = useState('');
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);
  const [isLoading, setIsLoading] = useState(false);
  const [filterPort, setFilterPort] = useState('الكل');
  const [isSequentialRunning, setIsSequentialRunning] = useState(false);
  const [sequentialLogs, setSequentialLogs] = useState<{time: string, message: string, type: string}[]>([]);
  const [lastFetchInfo, setLastFetchInfo] = useState<string>(localStorage.getItem('lastAutoSaveTime') || 'لم يتم الجلب بعد');
  const [isDirectDataVisible, setIsDirectDataVisible] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [showOnlyWeakInTable, setShowOnlyWeakInTable] = useState(false);

  const currentNetwork = networks[currentNetworkId];

  // --- Effects ---

  useEffect(() => {
    localStorage.setItem('appTheme', 'dark');
    document.documentElement.classList.add('dark');
  }, []);

  // Smart Auto Fetch Logic (After 6:00 AM)
  useEffect(() => {
    const checkAndFetch = () => {
      const now = new Date();
      const currentHour = now.getHours();
      
      if (currentHour >= 6) {
        const today = now.toISOString().split('T')[0];
        const lastSaveDate = localStorage.getItem('lastAutoSaveDate');
        
        if (lastSaveDate !== today) {
          runSequentialSave();
        }
      }
    };

    checkAndFetch();
    const interval = setInterval(checkAndFetch, 1800000); // Check every 30 mins
    return () => clearInterval(interval);
  }, []);

  // --- Logic ---

  const saveToStorage = useCallback((newNetworks: Record<string, Network>) => {
    setNetworks(newNetworks);
    storage.saveNetworks(newNetworks);
  }, []);

  const handleSave = useCallback((text: string, date: string, netId: string = currentNetworkId) => {
    const network = networks[netId];
    if (!network) return 0;

    const result = parseReport(text);
    if (!result.stats.success) return 0;

    const newNetworks = { ...networks };
    const targetNetwork = { ...newNetworks[netId] };
    
    targetNetwork.dailyReports[date] = {
      vlans: result.vlans,
      weak: result.vlans.filter(v => v.level === '❌').map(v => v.number),
      date: date,
      parsedAt: new Date().toISOString()
    };

    result.vlans.forEach(vlan => {
      const vlanId = vlan.id.toString();
      if (!targetNetwork.vlanData[vlanId]) {
        targetNetwork.vlanData[vlanId] = {
          id: vlan.id,
          number: vlan.number,
          name: vlan.name,
          fullName: vlan.name,
          days: {},
          originalName: vlan.name,
          firstSeen: date,
          lastReportedName: vlan.name
        };
      }
      targetNetwork.vlanData[vlanId].days[date] = {
        full: vlan.display,
        short: vlan.shortDisplay,
        level: vlan.level,
        mb: vlan.mb,
        reportedName: vlan.name,
        reportDate: date
      };
      targetNetwork.vlanData[vlanId].lastReportedName = vlan.name;
    });

    if (!targetNetwork.dates.includes(date)) {
      targetNetwork.dates = [...targetNetwork.dates, date].sort();
    }
    
    targetNetwork.lastModified = new Date().toISOString();
    newNetworks[netId] = targetNetwork;
    
    saveToStorage(newNetworks);
    
    const alerts = analyzeAfterSave(targetNetwork, date);
    if (alerts) {
      const newAlertHistory = { ...alertHistory, [date]: alerts };
      setAlertHistory(newAlertHistory);
      storage.saveAlertHistory(newAlertHistory);
    }

    return result.vlans.length;
  }, [networks, currentNetworkId, alertHistory, saveToStorage]);

  const runSequentialSave = async () => {
    if (isSequentialRunning) return;
    setIsSequentialRunning(true);
    setSequentialLogs([]);
    
    const addLog = (msg: string, type: string = 'info') => {
      setSequentialLogs(prev => [{ time: new Date().toLocaleTimeString('ar-SA'), message: msg, type }, ...prev]);
    };

    const today = new Date().toISOString().split('T')[0];
    const nets = ['R1', 'R2'];
    let totalSaved = 0;
    
    for (const netName of nets) {
      addLog(`جاري جلب بيانات ${netName}...`, 'info');
      try {
        const data = await fetchFirebaseData(netName);
        if (data) {
          const netId = netName === 'R1' ? 'network_1' : 'network_2';
          const count = handleSave(data, today, netId) || 0;
          totalSaved += count;
          addLog(`✅ تم حفظ ${count} فيلان في ${netName}`, 'success');
        }
      } catch (error) {
        addLog(`❌ فشل جلب ${netName}`, 'error');
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    
    if (totalSaved > 0) {
      const timeStr = new Date().toLocaleString('ar-SA');
      localStorage.setItem('lastAutoSaveDate', today);
      localStorage.setItem('lastAutoSaveTime', timeStr);
      setLastFetchInfo(timeStr);
    }
    
    setIsSequentialRunning(false);
  };

  const handleEditVlan = (vlanNumber: number) => {
    const vlanId = vlanNumber.toString();
    const vlan = (currentNetwork.vlanData as Record<string, VlanHistory>)[vlanId];
    if (!vlan) return;

    const newName = prompt(`تعديل اسم الفيلان V${vlanNumber}\nالاسم الحالي: ${vlan.name}`, vlan.name);
    if (newName && newName.trim()) {
      const newNetworks = { ...networks };
      (newNetworks[currentNetworkId].vlanData as Record<string, VlanHistory>)[vlanId].name = newName.trim();
      saveToStorage(newNetworks);
    }
  };

  const handleDeleteVlan = (vlanNumber: number) => {
    if (!confirm(`هل أنت متأكد من حذف الفيلان V${vlanNumber} وجميع بياناته؟`)) return;
    
    const newNetworks = { ...networks };
    const targetNetwork = { ...newNetworks[currentNetworkId] };
    delete (targetNetwork.vlanData as Record<string, VlanHistory>)[vlanNumber.toString()];
    
    Object.keys(targetNetwork.dailyReports).forEach(date => {
      const report = targetNetwork.dailyReports[date] as DailyReport;
      report.vlans = report.vlans.filter(v => v.number !== vlanNumber);
      report.weak = report.weak.filter(n => n !== vlanNumber);
    });

    saveToStorage(newNetworks);
  };

  const handleDeleteReport = async (date: string) => {
    if (!confirm(`هل أنت متأكد من حذف تقرير يوم ${date}؟`)) return;
    const newNetworks = { ...networks };
    const targetNetwork = { ...newNetworks[currentNetworkId] };
    delete targetNetwork.dailyReports[date];
    targetNetwork.dates = targetNetwork.dates.filter(d => d !== date);
    saveToStorage(newNetworks);
  };

  const handleDeleteAllReports = () => {
    if (!confirm("هل أنت متأكد من حذف جميع التقارير والبيانات؟ لا يمكن التراجع عن هذا الإجراء.")) return;
    const newNetworks = { ...networks };
    const targetNetwork = { ...newNetworks[currentNetworkId] };
    targetNetwork.dailyReports = {};
    targetNetwork.dates = [];
    targetNetwork.vlanData = {};
    newNetworks[currentNetworkId] = targetNetwork;
    saveToStorage(newNetworks);
  };

  // --- Computed ---

  const tableDates = useMemo(() => {
    // Latest date on the right (Descending order)
    return [...currentNetwork.dates].sort((a, b) => b.localeCompare(a));
  }, [currentNetwork.dates]);

  const ports = useMemo(() => {
    const p = new Set<string>(['الكل']);
    Object.values(currentNetwork.vlanData).forEach((v: VlanHistory) => p.add(extractPortFromVlanName(v.name)));
    return Array.from(p).sort();
  }, [currentNetwork]);

  const sortedVlans = useMemo(() => {
    let list = Object.values(currentNetwork.vlanData) as VlanHistory[];
    if (filterPort !== 'الكل') {
      list = list.filter(v => extractPortFromVlanName(v.name) === filterPort);
    }
    if (showOnlyWeakInTable && tableDates.length > 0) {
      const latestDate = tableDates[0];
      list = list.filter(v => {
        const dayData = v.days[latestDate];
        return dayData && dayData.mb < 5;
      });
    }
    return list.sort((a, b) => a.number - b.number);
  }, [currentNetwork, filterPort, showOnlyWeakInTable, tableDates]);

  const tableTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    let grandTotal = 0;
    tableDates.forEach(date => {
      let dayTotal = 0;
      sortedVlans.forEach(v => {
        dayTotal += v.days[date]?.mb || 0;
      });
      totals[date] = dayTotal;
      grandTotal += dayTotal;
    });
    return { totals, grandTotal };
  }, [tableDates, sortedVlans]);

  const weakVlans = useMemo(() => {
    return (Object.values(currentNetwork.vlanData) as VlanHistory[]).filter(vlan => 
      Object.values(vlan.days).some(day => day.level === '❌')
    ).sort((a, b) => a.number - b.number);
  }, [currentNetwork]);

  const handleBackupExport = () => {
    const data = { networks, alertHistory };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vlan_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  const handleBackupImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.networks) {
          setNetworks(data.networks);
          storage.saveNetworks(data.networks);
          if (data.alertHistory) {
            setAlertHistory(data.alertHistory);
            storage.saveAlertHistory(data.alertHistory);
          }
          alert("تم استيراد النسخة الاحتياطية بنجاح");
          window.location.reload();
        }
      } catch (err) {
        alert("ملف غير صالح");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className={cn(
      "min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100 selection:text-indigo-900",
      isDarkMode && "dark bg-slate-950 text-slate-100",
      "dir-rtl pb-24"
    )} dir="rtl">
      
      {/* Header */}
      <header className="sticky top-0 z-50 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-800 p-1 rounded-xl">
            {(Object.values(networks) as Network[]).map(n => (
              <button
                key={n.id}
                onClick={() => {
                  setCurrentNetworkId(n.id);
                  storage.saveCurrentNetworkId(n.id);
                }}
                className={cn(
                  "px-4 py-1 rounded-lg text-xs font-black transition-all",
                  currentNetworkId === n.id ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20" : "text-slate-400"
                )}
              >
                {n.name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <h1 className="font-black text-lg text-indigo-400 flex items-center gap-2">
            تتبع الفيولات
            <Zap size={20} fill="currentColor" className="text-indigo-500" />
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button className="p-2 bg-slate-800 text-slate-400 rounded-lg">
            <Menu size={20} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-4 max-w-6xl mx-auto space-y-6">
        
        {/* Last Fetch Info */}
        <div className="bg-indigo-50 dark:bg-indigo-900/20 px-4 py-2 rounded-xl flex items-center justify-between border border-indigo-100 dark:border-indigo-800/50">
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
            <Clock size={14} />
            <span className="text-[10px] font-black uppercase tracking-wider">آخر جلب تلقائي:</span>
          </div>
          <span className="text-[10px] font-bold text-indigo-700 dark:text-indigo-300">{lastFetchInfo}</span>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'input' && (
            <motion.div key="input" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="font-black text-lg flex items-center gap-2">
                    <span className="text-indigo-500">📅</span>
                    تاريخ التقرير
                  </h2>
                  <input 
                    type="date" 
                    value={reportDate}
                    onChange={(e) => setReportDate(e.target.value)}
                    className="bg-slate-100 dark:bg-slate-800 border-none rounded-xl px-4 py-2 text-sm font-bold text-center"
                  />
                </div>

                <button 
                  onClick={() => setIsDirectDataVisible(!isDirectDataVisible)}
                  className="w-full py-4 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-3xl font-black text-lg flex items-center justify-center gap-3 shadow-xl shadow-indigo-500/20"
                >
                  {isDirectDataVisible ? 'إخفاء البيانات المباشرة' : 'إظهار البيانات المباشرة'}
                  <motion.div animate={{ rotate: isDirectDataVisible ? 180 : 0 }}>
                    <ChevronRight size={24} />
                  </motion.div>
                </button>

                <AnimatePresence>
                  {isDirectDataVisible && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-3xl p-5 border-2 border-slate-100 dark:border-slate-800 space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="font-black text-amber-500 flex items-center gap-2">
                            📡 الحفظ التلقائي من Firebase
                          </h3>
                          <button className="px-4 py-1.5 bg-indigo-600 text-white rounded-xl text-xs font-black flex items-center gap-2">
                            <Search size={14} />
                            اختبار
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <button 
                            onClick={async () => {
                              setIsLoading(true);
                              const data = await fetchFirebaseData('R1');
                              if (data) setReportText(data);
                              setIsLoading(false);
                            }}
                            className="py-3 bg-indigo-500 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2"
                          >
                            R1 📡
                          </button>
                          <button 
                            onClick={async () => {
                              setIsLoading(true);
                              const data = await fetchFirebaseData('R2');
                              if (data) setReportText(data);
                              setIsLoading(false);
                            }}
                            className="py-3 bg-emerald-500 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2"
                          >
                            R2 📡
                          </button>
                          <button 
                            onClick={runSequentialSave}
                            className="py-3 bg-purple-500 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2"
                          >
                            🚀 جلب الكل
                          </button>
                          <button 
                            onClick={runSequentialSave}
                            className="py-3 bg-gradient-to-r from-blue-400 to-indigo-500 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2"
                          >
                            🔄 جلب تلقائي الآن
                          </button>
                        </div>

                        <div className="bg-slate-900/50 rounded-2xl p-4 border border-slate-700 space-y-2">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-black text-indigo-400 flex items-center gap-2">
                              🤖 الحفظ التلقائي
                            </h4>
                            <span className="text-[10px] font-bold text-amber-400">آخر حفظ: {lastFetchInfo.split(',')[0]}</span>
                          </div>
                          <p className="text-[10px] text-slate-400 font-bold leading-relaxed">سيتم الجلب تلقائياً عند فتح التطبيق إذا لم يتم الحفظ اليوم</p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="space-y-4">
                  <h3 className="font-black text-lg flex items-center gap-2">
                    📋 الصق تقرير الفيولات هنا
                  </h3>
                  <div className="relative">
                    <textarea 
                      value={reportText}
                      onChange={(e) => setReportText(e.target.value)}
                      placeholder="الصق تقرير الفيولات هنا..."
                      className="w-full h-64 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-3xl p-5 text-sm font-medium focus:border-indigo-500 focus:ring-0 transition-all resize-none"
                    />
                    <div className="absolute bottom-4 left-4 flex gap-2">
                      <button 
                        onClick={() => setReportText('')}
                        title="مسح الحقول"
                        className="w-12 h-12 bg-slate-200 dark:bg-slate-700 text-slate-500 rounded-full shadow-lg flex items-center justify-center hover:scale-110 active:scale-95 transition-all"
                      >
                        <Eraser size={24} />
                      </button>
                      <button 
                        onClick={() => handleSave(reportText, reportDate)}
                        className="w-14 h-14 bg-indigo-600 text-white rounded-full shadow-2xl shadow-indigo-500/50 flex items-center justify-center hover:scale-110 active:scale-95 transition-all"
                      >
                        <CheckCircle2 size={32} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'all' && (
            <motion.div key="all" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar flex-1">
                  {ports.map(p => (
                    <button
                      key={p}
                      onClick={() => setFilterPort(p)}
                      className={cn(
                        "px-5 py-2.5 rounded-2xl text-xs font-black whitespace-nowrap transition-all",
                        filterPort === p 
                          ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20" 
                          : "bg-white dark:bg-slate-900 text-slate-500 border border-slate-200 dark:border-slate-800"
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 mr-4">
                  <button 
                    onClick={() => setShowOnlyWeakInTable(!showOnlyWeakInTable)}
                    className={cn(
                      "px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all border",
                      showOnlyWeakInTable 
                        ? "bg-rose-600 text-white border-rose-500 shadow-lg shadow-rose-500/20" 
                        : "bg-slate-800 text-slate-400 border-slate-700"
                    )}
                  >
                    <Filter size={14} />
                    الطافيات فقط
                  </button>
                  <button onClick={() => setZoomLevel(prev => Math.max(0.5, prev - 0.1))} className="p-2 bg-slate-800 text-slate-400 rounded-xl border border-slate-700"><TrendingDown size={16} /></button>
                  <button onClick={() => setZoomLevel(prev => Math.min(2, prev + 0.1))} className="p-2 bg-slate-800 text-slate-400 rounded-xl border border-slate-700"><TrendingUp size={16} /></button>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <h3 className="font-black text-lg">جدول البيانات</h3>
                  <button onClick={() => {
                    const data = sortedVlans.map((v, i) => ({
                      '#': i + 1,
                      'رقم': `V${v.number}`,
                      'الاسم': v.name,
                      ...Object.fromEntries(tableDates.map(d => [d, v.days[d]?.mb || '-'])),
                      'الإجمالي': (Object.values(v.days).reduce((s, d) => s + (d as any).mb, 0) as number / 1024).toFixed(2)
                    }));
                    const ws = XLSX.utils.json_to_sheet(data);
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, "التقرير");
                    XLSX.writeFile(wb, `تقرير_فيولات_${currentNetwork.name}.xlsx`);
                  }} className="p-2.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 rounded-xl"><Download size={18} /></button>
                </div>
                <div className="overflow-x-auto">
                  <div style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'top right', width: `${100 / zoomLevel}%` }}>
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-400 uppercase tracking-widest font-black">
                        <tr>
                          <th className="p-4 w-10">#</th>
                          <th className="p-4">رقم</th>
                          <th className="p-4">الاسم</th>
                          {tableDates.map(d => (
                            <th key={d} className="p-4 text-center">{d.split('-').slice(1).join('/')}</th>
                          ))}
                          <th className="p-4 text-center">عمليات</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {sortedVlans.map((v, idx) => (
                          <tr key={v.number} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                            <td className="p-4 text-slate-400 font-bold">{idx + 1}</td>
                            <td className="p-4 font-black text-indigo-600">V{v.number}</td>
                            <td className="p-4 max-w-[120px] truncate font-bold text-slate-700 dark:text-slate-300">{v.name}</td>
                            {tableDates.map(d => {
                              const day = v.days[d];
                              const comp = getConsumptionComparison(v, d, tableDates);
                              return (
                                <td key={d} className={cn(
                                  "p-4 text-center font-black",
                                  day && (
                                    day.level === '❌' ? "bg-rose-50 dark:bg-rose-900/20 text-rose-600" :
                                    day.level === '🟢' ? "text-emerald-500" :
                                    day.level === '🟣' ? "text-indigo-500" :
                                    day.level === '🟠' ? "text-orange-500" : ""
                                  )
                                )}>
                                  <div className="flex flex-col items-center gap-0.5">
                                    <span>{day ? day.mb : '-'}</span>
                                    {comp && (
                                      <span className={cn(
                                        "text-[8px] flex items-center gap-0.5",
                                        comp.direction === 'up' ? "text-emerald-500" : "text-rose-500"
                                      )}>
                                        {comp.direction === 'up' ? <TrendingUp size={8} /> : <TrendingDown size={8} />}
                                        {comp.percentage}%
                                      </span>
                                    )}
                                  </div>
                                </td>
                              );
                            })}
                            <td className="p-4">
                              <div className="flex items-center justify-center gap-2">
                                <button onClick={() => handleEditVlan(v.number)} className="p-1.5 text-indigo-500 hover:bg-indigo-50 rounded-lg"><Edit2 size={14} /></button>
                                <button onClick={() => handleDeleteVlan(v.number)} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"><Trash2 size={14} /></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {/* Daily Totals Row */}
                        <tr className="bg-indigo-50/50 dark:bg-indigo-900/10 font-black border-t-2 border-indigo-200 dark:border-indigo-800">
                          <td colSpan={3} className="p-4 text-indigo-600">إجمالي اليوم (GB)</td>
                          {tableDates.map(d => (
                            <td key={d} className="p-4 text-center text-indigo-600">
                              {(tableTotals.totals[d] / 1024).toFixed(2)}
                            </td>
                          ))}
                          <td className="p-4 text-center text-indigo-600 bg-indigo-100 dark:bg-indigo-900/40">
                            {(tableTotals.grandTotal / 1024).toFixed(2)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'weak' && (
            <motion.div key="weak" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-lg text-rose-600 flex items-center gap-2">
                  <AlertTriangle size={20} />
                  الفيولات الطافية
                </h3>
                <div className="flex gap-2">
                  <button onClick={() => setZoomLevel(prev => Math.max(0.5, prev - 0.1))} className="p-2 bg-slate-800 text-slate-400 rounded-xl border border-slate-700"><TrendingDown size={16} /></button>
                  <button onClick={() => setZoomLevel(prev => Math.min(2, prev + 0.1))} className="p-2 bg-slate-800 text-slate-400 rounded-xl border border-slate-700"><TrendingUp size={16} /></button>
                </div>
              </div>
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <div style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'top right', width: `${100 / zoomLevel}%` }}>
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-400 uppercase tracking-widest font-black">
                        <tr>
                          <th className="p-4">رقم</th>
                          <th className="p-4">الاسم</th>
                          {tableDates.slice(0, 5).map(d => (
                            <th key={d} className="p-4 text-center">{d.split('-').slice(1).join('/')}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {weakVlans.map(v => (
                          <tr key={v.number} className="hover:bg-slate-50 transition-colors">
                            <td className="p-4 font-black text-rose-600">V{v.number}</td>
                            <td className="p-4 font-bold">{v.name}</td>
                            {tableDates.slice(0, 5).map(d => (
                              <td key={d} className={cn("p-4 text-center font-black", v.days[d]?.level === '❌' && "bg-rose-50 dark:bg-rose-900/20 text-rose-600")}>
                                {v.days[d] ? v.days[d].mb : '-'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'days' && (
            <motion.div key="days" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
              <div className="flex justify-end">
                <button 
                  onClick={handleDeleteAllReports}
                  className="px-6 py-3 bg-rose-600 text-white rounded-2xl font-black text-sm flex items-center gap-2 shadow-lg shadow-rose-500/20"
                >
                  <Trash2 size={18} />
                  حذف جميع الأيام
                </button>
              </div>
              <div className="space-y-3">
                {[...Object.values(currentNetwork.dailyReports) as DailyReport[]].sort((a, b) => b.date.localeCompare(a.date)).map(report => (
                  <div key={report.date} className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-xl flex flex-col items-center justify-center">
                        <span className="text-xs text-slate-500">{report.date.split('-')[1]}</span>
                        <span className="font-bold text-lg leading-none">{report.date.split('-')[2]}</span>
                      </div>
                      <div>
                        <h4 className="font-bold">{report.date}</h4>
                        <p className="text-xs text-slate-500">
                          {report.vlans.length} فيلان | {report.weak.length} طافية
                        </p>
                      </div>
                    </div>
                    <button 
                      onClick={() => handleDeleteReport(report.date)}
                      className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'backup' && (
            <motion.div key="backup" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-4">
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 space-y-6">
                <div className="text-center space-y-2">
                  <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center mx-auto text-indigo-600">
                    <DbIcon size={32} />
                  </div>
                  <h3 className="text-xl font-black">إدارة البيانات</h3>
                  <p className="text-xs text-slate-500">تصدير واستيراد النسخ الاحتياطية</p>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <button 
                    onClick={handleBackupExport}
                    className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black flex items-center justify-center gap-3 shadow-lg shadow-emerald-500/20"
                  >
                    <Download size={20} />
                    تصدير نسخة احتياطية (JSON)
                  </button>
                  
                  <label className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black flex items-center justify-center gap-3 shadow-lg shadow-indigo-500/20 cursor-pointer">
                    <Upload size={20} />
                    استيراد نسخة احتياطية
                    <input type="file" accept=".json" onChange={handleBackupImport} className="hidden" />
                  </label>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-t border-slate-200 dark:border-slate-800 px-2 pb-safe pt-1 h-20 flex items-center justify-around z-50 rounded-t-[32px] shadow-2xl">
        <TabButton active={activeTab === 'input'} onClick={() => setActiveTab('input')} icon={PlusCircle} label="إدخال" />
        <TabButton active={activeTab === 'all'} onClick={() => setActiveTab('all')} icon={FileText} label="الكل" />
        <TabButton active={activeTab === 'weak'} onClick={() => setActiveTab('weak')} icon={AlertTriangle} label="طافيات" />
        <TabButton active={activeTab === 'days'} onClick={() => setActiveTab('days')} icon={History} label="الأيام" />
        <TabButton active={activeTab === 'backup'} onClick={() => setActiveTab('backup')} icon={DbIcon} label="نسخ" />
      </nav>

      {/* Loading Overlay */}
      {isLoading && (
        <div className="fixed inset-0 z-[100] bg-white/50 dark:bg-slate-950/50 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white dark:bg-slate-900 p-8 rounded-[40px] shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col items-center gap-4">
            <RefreshCw size={48} className="text-indigo-600 animate-spin" />
            <p className="font-black text-lg tracking-tight">جاري المعالجة...</p>
          </div>
        </div>
      )}
    </div>
  );
}
