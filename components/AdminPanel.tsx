import React, { useState, useEffect, useMemo } from 'react';
import { Benevole, Creneau, Inscription } from '../types';
import { db } from '../services/mockDb';
import { Trash2, Edit, Plus, Calendar, Download, Wand2, Check, X, Save, ArrowRight, Copy, ChevronLeft, ChevronRight, ChevronDown, XCircle } from 'lucide-react';
import { GeminiService } from '../services/geminiService';
import { ConfirmModal } from './ConfirmModal';

interface AdminPanelProps {
  currentWeekStart: Date;
  currentWeekEnd: Date;
  benevoles: Benevole[];
  creneaux: Creneau[];
  inscriptions: Inscription[];
  refreshData: () => void;
  closeAdmin: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  currentWeekStart,
  currentWeekEnd,
  benevoles,
  creneaux,
  inscriptions,
  refreshData,
  closeAdmin
}) => {
  const [activeTab, setActiveTab] = useState<'benevoles' | 'creneaux' | 'export'>('benevoles');
  
  // Toggle States for Creneaux Tab
  const [sectionDuplicationOpen, setSectionDuplicationOpen] = useState(false);
  const [sectionAIOpen, setSectionAIOpen] = useState(false);
  const [sectionManualOpen, setSectionManualOpen] = useState(false);
  const [sectionOverviewOpen, setSectionOverviewOpen] = useState(true);

  // Admin Week Navigation State
  const [adminDate, setAdminDate] = useState(new Date(currentWeekStart));
  
  // Derived Admin Week
  const { adminWeekStart, adminWeekEnd } = useMemo(() => {
    const start = new Date(adminDate);
    const day = start.getDay();
    const diff = start.getDate() - day + (day === 0 ? -6 : 1);
    start.setDate(diff);
    start.setHours(0,0,0,0);
    
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23,59,59,999);
    
    return { adminWeekStart: start, adminWeekEnd: end };
  }, [adminDate]);

  // Modal State
  const [confirmConfig, setConfirmConfig] = useState<{
      isOpen: boolean;
      title: string;
      message: string;
      onConfirm: () => void;
  } | null>(null);

  // Benevoles State
  const [newBenevoleName, setNewBenevoleName] = useState('');
  
  // Editing State (Benevoles)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  // Editing State (Creneaux)
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [editingSlotData, setEditingSlotData] = useState({ start: '', end: '', title: '' });

  // Creneaux State
  const [promptAI, setPromptAI] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [manualSlot, setManualSlot] = useState({ date: '', start: '09:00', end: '12:00', title: 'Boutique' });

  // Duplication State
  const [copySourceDate, setCopySourceDate] = useState('');
  const [copyTargetDates, setCopyTargetDates] = useState<Set<string>>(new Set());
  const [calendarViewDate, setCalendarViewDate] = useState(new Date()); // Pour naviguer dans le calendrier de sélection

  // AI Generation Date Range State
  const formatDateForInput = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [aiStartDate, setAiStartDate] = useState(formatDateForInput(currentWeekStart));
  const [aiEndDate, setAiEndDate] = useState(formatDateForInput(currentWeekEnd));

  // Export State
  const [exportStart, setExportStart] = useState('');
  const [exportEnd, setExportEnd] = useState('');

  // --- Derived ---
  
  const filteredWeekSlots = useMemo(() => {
      return creneaux.filter(c => {
          const d = new Date(c.date_debut);
          return d >= adminWeekStart && d <= adminWeekEnd;
      }).sort((a,b) => new Date(a.date_debut).getTime() - new Date(b.date_debut).getTime());
  }, [creneaux, adminWeekStart, adminWeekEnd]);

  // --- Handlers ---

  const handleAdminWeekChange = (direction: 'prev' | 'next') => {
      const newDate = new Date(adminDate);
      newDate.setDate(adminDate.getDate() + (direction === 'next' ? 7 : -7));
      setAdminDate(newDate);
  };

  const handleAddBenevole = async () => {
    if (!newBenevoleName.trim()) return;
    try {
      await db.addBenevole(newBenevoleName);
      setNewBenevoleName('');
      refreshData();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const startEditBenevole = (b: Benevole) => {
    setEditingId(b.id);
    setEditName(b.nom);
  };

  const cancelEditBenevole = () => {
    setEditingId(null);
    setEditName('');
  };

  const saveEditBenevole = async () => {
    if (!editingId || !editName.trim()) return;
    try {
        await db.updateBenevole(editingId, editName.trim());
        refreshData();
        setEditingId(null);
        setEditName('');
    } catch (e: any) {
        alert("Erreur: " + e.message);
    }
  };

  const handleDeleteBenevole = (id: string) => {
    setConfirmConfig({
        isOpen: true,
        title: "Supprimer Bénévole",
        message: "Êtes-vous sûr ? Cela supprimera toutes ses inscriptions passées et futures.",
        onConfirm: async () => {
             try {
                await db.deleteBenevole(id);
                refreshData();
            } catch (e: any) {
                console.error("Erreur suppression bénévole:", e);
                alert(`Erreur lors de la suppression: ${e.message}`);
            } finally {
                setConfirmConfig(null);
            }
        }
    });
  };

  const handleGenerateSlotsAI = async () => {
    if (!aiStartDate || !aiEndDate) {
        alert("Veuillez définir une période.");
        return;
    }

    setIsGenerating(true);
    try {
      const startPeriod = new Date(aiStartDate);
      const endPeriod = new Date(aiEndDate);
      // Ensure end of day for the end date
      endPeriod.setHours(23, 59, 59, 999);

      // Prompt logic is handled in service
      // Note: We send the selected dates to the AI for context
      const patterns = await GeminiService.generateSlots(startPeriod, endPeriod, promptAI);
      
      const slotsToAdd: any[] = [];
      
      // Loop through every day in the range
      const loopDate = new Date(startPeriod);
      // Reset time part for correct looping
      loopDate.setHours(0,0,0,0);

      while (loopDate <= endPeriod) {
        // Javascript getDay(): 0 = Sunday, 1 = Monday...
        const jsDay = loopDate.getDay();
        
        // Gemini Schema (defined in service): 0 = Monday ... 6 = Sunday
        // Conversion:
        const geminiDay = jsDay === 0 ? 6 : jsDay - 1;

        // Find patterns that match this day
        const dayPatterns = patterns.filter(p => p.dayOffset === geminiDay);

        for (const p of dayPatterns) {
             const s = new Date(loopDate);
             s.setHours(p.startHour, p.startMinute, 0);
             
             const e = new Date(loopDate);
             e.setHours(p.endHour, p.endMinute, 0);

             if (s >= startPeriod && e <= endPeriod) {
                 slotsToAdd.push({
                    date_debut: s.toISOString(),
                    date_fin: e.toISOString(),
                    titre: p.title
                });
             }
        }

        loopDate.setDate(loopDate.getDate() + 1);
      }

      for (const s of slotsToAdd) {
        await db.addCreneau(s);
      }
      
      refreshData();
      setPromptAI('');
      alert(`${slotsToAdd.length} créneaux ajoutés sur la période.`);

    } catch (e) {
      console.error(e);
      alert("Erreur lors de la génération");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAddManualSlot = async () => {
    if (!manualSlot.date) return;
    try {
        const start = new Date(`${manualSlot.date}T${manualSlot.start}`);
        const end = new Date(`${manualSlot.date}T${manualSlot.end}`);
        
        await db.addCreneau({
            date_debut: start.toISOString(),
            date_fin: end.toISOString(),
            titre: manualSlot.title
        });
        refreshData();
    } catch (e: any) {
        alert("Erreur ajout créneau: " + e.message);
    }
  };

  const handleDeleteSlot = (id: string) => {
    setConfirmConfig({
        isOpen: true,
        title: "Supprimer Créneau",
        message: "Êtes-vous sûr de vouloir supprimer ce créneau ?",
        onConfirm: async () => {
            try {
                await db.deleteCreneau(id);
                refreshData();
            } catch (e: any) {
                console.error("Erreur suppression créneau:", e);
                alert(`Erreur lors de la suppression: ${e.message}`);
            } finally {
                setConfirmConfig(null);
            }
        }
    });
  }
  
  const handleRemoveInscription = (benevoleId: string, creneauId: string, benevoleName: string) => {
      setConfirmConfig({
        isOpen: true,
        title: "Désinscrire un bénévole",
        message: `Voulez-vous désinscrire ${benevoleName} de ce créneau ?`,
        onConfirm: async () => {
             try {
                await db.removeInscription(benevoleId, creneauId);
                refreshData();
            } catch (e: any) {
                console.error("Erreur désinscription:", e);
                alert(`Erreur: ${e.message}`);
            } finally {
                setConfirmConfig(null);
            }
        }
      });
  };

  // --- Edit Slot Logic ---

  const handleStartEditSlot = (creneau: Creneau) => {
      setEditingSlotId(creneau.id);
      const start = new Date(creneau.date_debut);
      const end = new Date(creneau.date_fin);
      setEditingSlotData({
          start: start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          end: end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          title: creneau.titre
      });
  };

  const handleCancelEditSlot = () => {
      setEditingSlotId(null);
      setEditingSlotData({ start: '', end: '', title: '' });
  };

  const handleSaveEditSlot = async (creneau: Creneau) => {
      try {
          // Reconstruct ISO dates keeping the original day
          const originalDate = new Date(creneau.date_debut);
          const yyyy = originalDate.getFullYear();
          const mm = String(originalDate.getMonth() + 1).padStart(2, '0');
          const dd = String(originalDate.getDate()).padStart(2, '0');
          const dateBase = `${yyyy}-${mm}-${dd}`;

          const newStart = new Date(`${dateBase}T${editingSlotData.start}`);
          const newEnd = new Date(`${dateBase}T${editingSlotData.end}`);

          await db.updateCreneau(creneau.id, {
              date_debut: newStart.toISOString(),
              date_fin: newEnd.toISOString(),
              titre: editingSlotData.title
          });

          refreshData();
          setEditingSlotId(null);
      } catch (e: any) {
          alert("Erreur update créneau: " + e.message);
      }
  };

  // --- Duplication Logic ---
  
  const getSourceSlots = () => {
    if (!copySourceDate) return [];
    // Filter slots that occur on copySourceDate
    // Assuming creneaux contains enough history/future or at least current week.
    // Ideally we might need to fetch if not loaded, but we rely on current data for now or fetch range
    return creneaux.filter(c => {
        const d = new Date(c.date_debut);
        // Format YYYY-MM-DD
        const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        return dateStr === copySourceDate;
    }).sort((a,b) => new Date(a.date_debut).getTime() - new Date(b.date_debut).getTime());
  };

  const toggleTargetDate = (dateStr: string) => {
    const newSet = new Set(copyTargetDates);
    if (newSet.has(dateStr)) {
        newSet.delete(dateStr);
    } else {
        newSet.add(dateStr);
    }
    setCopyTargetDates(newSet);
  };

  const handleDuplicate = async () => {
    const sourceSlots = getSourceSlots();
    if (sourceSlots.length === 0) return alert("Aucun créneau source à copier.");
    if (copyTargetDates.size === 0) return alert("Aucune date cible sélectionnée.");

    const slotsToAdd: any[] = [];

    // Cast explicitly to string[] to avoid TS unknown error
    const targetDates = Array.from(copyTargetDates) as string[];

    for (const targetDateStr of targetDates) {
        const targetDate = new Date(targetDateStr); // Midnight local
        
        for (const slot of sourceSlots) {
            const oldStart = new Date(slot.date_debut);
            const oldEnd = new Date(slot.date_fin);

            const newStart = new Date(targetDate);
            newStart.setHours(oldStart.getHours(), oldStart.getMinutes(), 0);

            const newEnd = new Date(targetDate);
            newEnd.setHours(oldEnd.getHours(), oldEnd.getMinutes(), 0);

            slotsToAdd.push({
                date_debut: newStart.toISOString(),
                date_fin: newEnd.toISOString(),
                titre: slot.titre
            });
        }
    }

    try {
        for (const s of slotsToAdd) {
            await db.addCreneau(s);
        }
        alert(`${slotsToAdd.length} créneaux créés (Duplication de ${sourceSlots.length} créneaux sur ${copyTargetDates.size} jours).`);
        refreshData();
        setCopyTargetDates(new Set());
    } catch (e: any) {
        console.error(e);
        alert("Erreur lors de la duplication: " + e.message);
    }
  };

  // --- Calendar Helper ---
  const renderMultiSelectCalendar = () => {
      const year = calendarViewDate.getFullYear();
      const month = calendarViewDate.getMonth();
      
      const firstDayOfMonth = new Date(year, month, 1);
      const lastDayOfMonth = new Date(year, month + 1, 0);
      
      const days: (Date | null)[] = [];
      // Padding for empty start days (Mon=1 ... Sun=0 in JS getDay)
      // We want Monday start: 0->Mon, ... 6->Sun
      let startDay = firstDayOfMonth.getDay(); 
      // Convert JS Sunday(0) to 7, then shift by 1 to make Mon=1
      let startOffset = startDay === 0 ? 6 : startDay - 1; 

      for (let i = 0; i < startOffset; i++) {
          days.push(null);
      }
      
      for (let d = 1; d <= lastDayOfMonth.getDate(); d++) {
          days.push(new Date(year, month, d));
      }

      const monthName = firstDayOfMonth.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

      return (
          <div className="bg-white border border-gray-300 rounded-lg p-3 w-full max-w-sm text-gray-900">
              <div className="flex justify-between items-center mb-2">
                  <button onClick={() => setCalendarViewDate(new Date(year, month - 1))} className="p-1 hover:bg-gray-100 rounded text-gray-700">
                      <ChevronLeft className="h-5 w-5" />
                  </button>
                  <span className="font-bold capitalize text-gray-900">{monthName}</span>
                  <button onClick={() => setCalendarViewDate(new Date(year, month + 1))} className="p-1 hover:bg-gray-100 rounded text-gray-700">
                      <ChevronRight className="h-5 w-5" />
                  </button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center text-xs mb-1 font-medium text-gray-700">
                  <div>L</div><div>M</div><div>M</div><div>J</div><div>V</div><div>S</div><div>D</div>
              </div>
              <div className="grid grid-cols-7 gap-1">
                  {days.map((d, idx) => {
                      if (!d) return <div key={idx} />;
                      const dateStr = formatDateForInput(d);
                      const isSelected = copyTargetDates.has(dateStr);
                      const isToday = dateStr === formatDateForInput(new Date());
                      const isSource = dateStr === copySourceDate;
                      
                      return (
                          <button 
                            key={idx}
                            onClick={() => toggleTargetDate(dateStr)}
                            className={`
                                h-8 w-8 rounded-full flex items-center justify-center text-sm transition-colors border
                                ${isSource ? 'bg-blue-200 border-blue-600 font-bold text-blue-900' : ''}
                                ${isSelected ? 'bg-teal-700 text-white shadow-md border-teal-800' : 'hover:bg-gray-100 text-gray-800 border-transparent'}
                                ${isToday && !isSelected && !isSource ? 'ring-2 ring-teal-500 text-teal-700 font-bold' : ''}
                            `}
                            title={isSource ? "Date Source" : isSelected ? "Date Cible (Sélectionnée)" : ""}
                            disabled={isSource} // Cannot copy to source itself
                          >
                              {d.getDate()}
                          </button>
                      );
                  })}
              </div>
              <div className="mt-2 text-xs text-gray-600 flex gap-3 justify-center">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 bg-blue-200 border border-blue-600 rounded-full"></span> Source</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 bg-teal-700 rounded-full"></span> Cible</span>
              </div>
          </div>
      );
  };

  // --- Render ---

  const handleExport = async () => {
    if (!exportStart || !exportEnd) return alert('Sélectionnez les dates.');
    const data = await db.getAllInscriptionsDetailed(exportStart, exportEnd);
    
    // Using window.XLSX from CDN
    const wb = (window as any).XLSX.utils.book_new();
    const ws = (window as any).XLSX.utils.json_to_sheet(data);
    (window as any).XLSX.utils.book_append_sheet(wb, ws, "Inscriptions");
    
    const dateStr = new Date().toISOString().replace(/[:T-]/g, '').slice(0, 14);
    (window as any).XLSX.writeFile(wb, `Export_Planning_${dateStr}.xlsx`);
  };

  return (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-95 z-50 overflow-y-auto">
      <div className="container mx-auto p-4 min-h-screen">
        <div className="flex justify-between items-center mb-6 text-white">
          <h2 className="text-2xl font-bold">Administration</h2>
          <button onClick={closeAdmin} className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded text-white font-medium">Fermer</button>
        </div>

        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          <button onClick={() => setActiveTab('benevoles')} className={`px-4 py-2 rounded font-medium ${activeTab === 'benevoles' ? 'bg-white text-gray-900 shadow' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'}`}>Bénévoles</button>
          <button onClick={() => setActiveTab('creneaux')} className={`px-4 py-2 rounded font-medium ${activeTab === 'creneaux' ? 'bg-white text-gray-900 shadow' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'}`}>Créneaux</button>
          <button onClick={() => setActiveTab('export')} className={`px-4 py-2 rounded font-medium ${activeTab === 'export' ? 'bg-white text-gray-900 shadow' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'}`}>Export Excel</button>
        </div>

        <div className="bg-white rounded-lg p-6 text-gray-900 shadow-xl border border-gray-200">
          {/* TAB: BENEVOLES */}
          {activeTab === 'benevoles' && (
            <div>
              <div className="flex gap-2 mb-4">
                <input 
                  type="text" 
                  value={newBenevoleName}
                  onChange={e => setNewBenevoleName(e.target.value)}
                  placeholder="Nom du bénévole"
                  className="border border-gray-300 bg-white text-gray-900 p-2 rounded flex-grow focus:ring-2 focus:ring-teal-500 outline-none"
                />
                <button onClick={handleAddBenevole} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded flex items-center gap-2 font-medium">
                  <Plus className="h-4 w-4" /> Ajouter
                </button>
              </div>
              <div className="grid gap-2 max-h-[60vh] overflow-y-auto">
                {benevoles.map(b => (
                  <div key={b.id} className="flex justify-between items-center p-2 bg-gray-50 border border-gray-200 rounded text-gray-900">
                    {editingId === b.id ? (
                        <div className="flex-grow flex items-center gap-2">
                            <input 
                                type="text" 
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="border border-gray-300 bg-white text-gray-900 p-1 rounded flex-grow"
                                autoFocus
                            />
                            <button onClick={saveEditBenevole} className="text-green-700 hover:bg-green-100 p-1 rounded">
                                <Save className="h-4 w-4" />
                            </button>
                            <button onClick={cancelEditBenevole} className="text-gray-600 hover:bg-gray-200 p-1 rounded">
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    ) : (
                        <>
                            <span className="font-medium">{b.nom}</span>
                            <div className="flex gap-2">
                                <button onClick={() => startEditBenevole(b)} className="text-blue-600 hover:text-blue-800">
                                    <Edit className="h-4 w-4" />
                                </button>
                                <button onClick={() => handleDeleteBenevole(b.id)} className="text-red-600 hover:text-red-800">
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB: CRENEAUX */}
          {activeTab === 'creneaux' && (
            <div className="space-y-4">
              
              {/* DUPLICATION TOOL */}
              <div className="border border-teal-200 rounded-lg bg-teal-50 shadow-sm overflow-hidden">
                <button 
                  onClick={() => setSectionDuplicationOpen(!sectionDuplicationOpen)}
                  className="w-full flex justify-between items-center p-4 bg-teal-200 hover:bg-teal-300 transition-colors text-teal-950 font-bold border-b border-teal-300"
                >
                    <span className="flex items-center gap-2"><Copy className="h-5 w-5" /> Ajout par duplication</span>
                    {sectionDuplicationOpen ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                </button>
                
                {sectionDuplicationOpen && (
                <div className="p-4 bg-white text-gray-900">
                    <div className="flex flex-col md:flex-row gap-6">
                        {/* Left: Source Selection */}
                        <div className="flex-1">
                            <label className="block text-sm font-bold text-gray-800 mb-2">1. Choisir la date source</label>
                            <input 
                                type="date" 
                                className="w-full border border-gray-300 bg-white text-gray-900 p-2 rounded mb-4 focus:ring-2 focus:ring-teal-500 outline-none"
                                value={copySourceDate}
                                onChange={(e) => setCopySourceDate(e.target.value)}
                            />
                            
                            <div className="bg-gray-50 border border-gray-200 rounded p-3 min-h-[150px] max-h-[250px] overflow-y-auto">
                                <p className="text-xs text-gray-600 mb-2 font-bold uppercase">Créneaux à copier :</p>
                                {getSourceSlots().length === 0 ? (
                                    <p className="text-sm text-gray-500 italic">Aucun créneau ce jour-là ou date non sélectionnée.</p>
                                ) : (
                                    <ul className="space-y-1">
                                        {getSourceSlots().map(s => (
                                            <li key={s.id} className="text-sm bg-white p-2 rounded border border-gray-200 flex justify-between text-gray-900 shadow-sm">
                                                <span>{new Date(s.date_debut).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} - {new Date(s.date_fin).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                                                <span className="font-semibold text-teal-800">{s.titre}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>

                        {/* Right: Target Multi-Selection */}
                        <div className="flex-1">
                            <label className="block text-sm font-bold text-gray-800 mb-2">2. Choisir les dates cibles ({copyTargetDates.size})</label>
                            <div className="flex justify-center md:justify-start">
                                {renderMultiSelectCalendar()}
                            </div>
                        </div>
                    </div>
                    
                    <div className="mt-4 flex justify-end">
                        <button 
                            onClick={handleDuplicate}
                            disabled={copyTargetDates.size === 0 || getSourceSlots().length === 0}
                            className="bg-teal-700 text-white px-6 py-2 rounded hover:bg-teal-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium shadow"
                        >
                            <Copy className="h-4 w-4" />
                            Dupliquer sur {copyTargetDates.size} date(s)
                        </button>
                    </div>
                </div>
                )}
              </div>

              {/* IA GENERATION */}
              <div className="border border-blue-200 rounded-lg bg-blue-50 shadow-sm overflow-hidden">
                <button 
                  onClick={() => setSectionAIOpen(!sectionAIOpen)}
                  className="w-full flex justify-between items-center p-4 bg-blue-200 hover:bg-blue-300 transition-colors text-blue-950 font-bold border-b border-blue-300"
                >
                    <span className="flex items-center gap-2"><Wand2 className="h-5 w-5" /> Ajout par prompt IA</span>
                    {sectionAIOpen ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                </button>
                
                {sectionAIOpen && (
                <div className="p-4 bg-white text-gray-900">
                    <div className="mb-4">
                        <label className="block text-sm font-bold text-gray-800 mb-1">Période de génération</label>
                        <div className="flex items-center gap-2 flex-wrap">
                            <input 
                                type="date" 
                                value={aiStartDate}
                                onChange={(e) => setAiStartDate(e.target.value)}
                                className="border border-gray-300 bg-white text-gray-900 p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                            <ArrowRight className="h-4 w-4 text-gray-500" />
                            <input 
                                type="date" 
                                value={aiEndDate}
                                onChange={(e) => setAiEndDate(e.target.value)}
                                className="border border-gray-300 bg-white text-gray-900 p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                    </div>

                    <div className="mb-2">
                        <label className="block text-sm font-bold text-gray-800 mb-1">Instruction pour l'assistant</label>
                        <textarea 
                            value={promptAI}
                            onChange={e => setPromptAI(e.target.value)}
                            className="w-full border border-gray-300 bg-white text-gray-900 p-3 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder='Ex: "Tous les matins de 9h à 12h sauf mercredi, et samedi après-midi 14h-17h"'
                            rows={3}
                        />
                    </div>

                    <button 
                    onClick={handleGenerateSlotsAI} 
                    disabled={isGenerating}
                    className="bg-blue-700 text-white px-4 py-2 rounded w-full hover:bg-blue-800 disabled:opacity-50 transition-colors font-medium flex justify-center items-center gap-2 shadow"
                    >
                    {isGenerating ? (
                        <>Génération en cours...</>
                    ) : (
                        <>
                            <Wand2 className="h-4 w-4" /> Générer les créneaux sur la période
                        </>
                    )}
                    </button>
                </div>
                )}
              </div>

              {/* MANUAL ADD */}
              <div className="border border-gray-300 rounded-lg shadow-sm bg-gray-50 overflow-hidden">
                <button 
                  onClick={() => setSectionManualOpen(!sectionManualOpen)}
                  className="w-full flex justify-between items-center p-4 bg-gray-200 hover:bg-gray-300 transition-colors text-gray-900 font-bold border-b border-gray-300"
                >
                    <span className="flex items-center gap-2"><Plus className="h-5 w-5" /> Ajout Unitaire</span>
                    {sectionManualOpen ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                </button>

                {sectionManualOpen && (
                <div className="p-4 bg-white text-gray-900">
                    <div className="flex flex-wrap gap-2 items-end">
                        <div className="flex-grow min-w-[150px]">
                            <label className="block text-xs font-bold text-gray-600 mb-1">Date</label>
                            <input type="date" className="border border-gray-300 bg-white text-gray-900 p-2 rounded w-full" value={manualSlot.date} onChange={e => setManualSlot({...manualSlot, date: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1">Début</label>
                            <input type="time" className="border border-gray-300 bg-white text-gray-900 p-2 rounded" value={manualSlot.start} onChange={e => setManualSlot({...manualSlot, start: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1">Fin</label>
                            <input type="time" className="border border-gray-300 bg-white text-gray-900 p-2 rounded" value={manualSlot.end} onChange={e => setManualSlot({...manualSlot, end: e.target.value})} />
                        </div>
                        <div className="flex-grow min-w-[200px]">
                            <label className="block text-xs font-bold text-gray-600 mb-1">Titre</label>
                            <input type="text" className="border border-gray-300 bg-white text-gray-900 p-2 rounded w-full" value={manualSlot.title} onChange={e => setManualSlot({...manualSlot, title: e.target.value})} placeholder="Intitulé" />
                        </div>
                        <button onClick={handleAddManualSlot} className="bg-gray-800 text-white px-4 py-2 rounded hover:bg-gray-900 h-[42px] mb-[1px] font-medium">Ajouter</button>
                    </div>
                </div>
                )}
              </div>

              {/* LIST OF WEEK SLOTS */}
              <div className="border border-gray-300 rounded-lg shadow-sm bg-gray-50 overflow-hidden">
                <button 
                  onClick={() => setSectionOverviewOpen(!sectionOverviewOpen)}
                  className="w-full flex justify-between items-center p-4 bg-gray-200 hover:bg-gray-300 transition-colors text-gray-900 font-bold border-b border-gray-300"
                >
                    <span className="flex items-center gap-2"><Calendar className="h-5 w-5" /> Modification et Suppression</span>
                    {sectionOverviewOpen ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                </button>

                {sectionOverviewOpen && (
                <div className="p-4 bg-white text-gray-900">
                    <div className="flex justify-between items-center mb-4 w-full">
                        {/* Admin Week Selector */}
                        <div className="flex items-center justify-between w-full bg-gray-100 border border-gray-300 p-3 rounded-lg shadow-sm">
                            <button onClick={() => handleAdminWeekChange('prev')} className="p-2 hover:bg-white hover:shadow rounded-full transition-all text-gray-800 bg-white/50 border border-gray-200">
                                <ChevronLeft className="h-6 w-6" />
                            </button>
                            <span className="text-lg md:text-xl font-black text-gray-900 px-4 uppercase tracking-wide text-center">
                                {adminWeekStart.toLocaleDateString('fr-FR', {day:'numeric', month:'short'})} - {adminWeekEnd.toLocaleDateString('fr-FR', {day:'numeric', month:'short', year: 'numeric'})}
                            </span>
                            <button onClick={() => handleAdminWeekChange('next')} className="p-2 hover:bg-white hover:shadow rounded-full transition-all text-gray-800 bg-white/50 border border-gray-200">
                                <ChevronRight className="h-6 w-6" />
                            </button>
                        </div>
                    </div>

                    <div className="max-h-[50vh] overflow-y-auto space-y-2">
                        {filteredWeekSlots.length === 0 && <p className="text-gray-500 italic text-center py-4">Aucun créneau sur cette semaine.</p>}
                        {filteredWeekSlots.map(c => {
                            // Find inscriptions for this slot
                            const slotInscriptions = inscriptions.filter(i => i.creneau_id === c.id);

                            return (
                            <div key={c.id} className="flex flex-col p-3 border border-gray-300 rounded hover:bg-gray-50 gap-2 bg-white shadow-sm text-gray-900">
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 w-full">
                                    {editingSlotId === c.id ? (
                                        <div className="flex flex-wrap gap-2 items-center w-full">
                                            <input 
                                                type="time" 
                                                className="border border-gray-300 bg-white text-gray-900 p-1 rounded" 
                                                value={editingSlotData.start}
                                                onChange={e => setEditingSlotData({...editingSlotData, start: e.target.value})}
                                            />
                                            <span className="text-gray-500">-</span>
                                            <input 
                                                type="time" 
                                                className="border border-gray-300 bg-white text-gray-900 p-1 rounded" 
                                                value={editingSlotData.end}
                                                onChange={e => setEditingSlotData({...editingSlotData, end: e.target.value})}
                                            />
                                            <input 
                                                type="text" 
                                                className="border border-gray-300 bg-white text-gray-900 p-1 rounded flex-grow min-w-[150px]" 
                                                value={editingSlotData.title}
                                                onChange={e => setEditingSlotData({...editingSlotData, title: e.target.value})}
                                            />
                                            <div className="flex gap-1 ml-auto">
                                                <button onClick={() => handleSaveEditSlot(c)} className="bg-green-100 text-green-700 p-1 rounded hover:bg-green-200">
                                                    <Save className="h-4 w-4" />
                                                </button>
                                                <button onClick={handleCancelEditSlot} className="bg-gray-100 text-gray-700 p-1 rounded hover:bg-gray-200">
                                                    <X className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="flex-grow">
                                                <span className="font-bold text-sm bg-gray-200 text-gray-800 px-1 rounded mr-2">
                                                    {new Date(c.date_debut).toLocaleDateString('fr-FR', {weekday: 'short', day: 'numeric'})}
                                                </span>
                                                <span className="text-sm mr-2 whitespace-nowrap text-gray-700 font-medium">
                                                    {new Date(c.date_debut).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} - 
                                                    {new Date(c.date_fin).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                                                </span>
                                                <span className="font-bold text-gray-900">{c.titre}</span>
                                            </div>
                                            <div className="flex gap-2 ml-auto">
                                                <button onClick={() => handleStartEditSlot(c)} className="text-blue-600 hover:bg-blue-100 p-1 rounded" title="Modifier">
                                                    <Edit className="h-4 w-4" />
                                                </button>
                                                <button onClick={() => handleDeleteSlot(c.id)} className="text-red-600 hover:bg-red-100 p-1 rounded" title="Supprimer">
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                                
                                {/* Volunteers List with Removal Option */}
                                <div className="flex flex-wrap gap-1 mt-1 pl-2 border-l-2 border-gray-300">
                                    {slotInscriptions.length === 0 && <span className="text-xs text-gray-500 italic">Aucun inscrit</span>}
                                    {slotInscriptions.map(i => {
                                        const b = benevoles.find(ben => ben.id === i.benevole_id);
                                        if (!b) return null;
                                        return (
                                            <span key={i.id} className="inline-flex items-center gap-1 bg-teal-50 text-teal-900 text-xs px-2 py-1 rounded-full border border-teal-200 font-medium">
                                                {b.nom}
                                                <button 
                                                    onClick={() => handleRemoveInscription(b.id, c.id, b.nom)}
                                                    className="text-teal-600 hover:text-red-600 transition-colors"
                                                    title="Désinscrire ce bénévole"
                                                >
                                                    <XCircle className="h-3 w-3" />
                                                </button>
                                            </span>
                                        );
                                    })}
                                </div>
                            </div>
                            )})}
                    </div>
                </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: EXPORT */}
          {activeTab === 'export' && (
             <div className="text-center py-10 text-gray-900">
                <Download className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <h3 className="text-xl font-bold mb-4">Exporter les inscriptions</h3>
                <div className="flex flex-col md:flex-row justify-center gap-4 items-center md:items-end mb-6">
                    <label className="text-left w-full md:w-auto">
                        <span className="block text-sm font-bold text-gray-700">Du</span>
                        <input type="date" value={exportStart} onChange={e => setExportStart(e.target.value)} className="border border-gray-300 bg-white text-gray-900 p-2 rounded w-full" />
                    </label>
                    <label className="text-left w-full md:w-auto">
                        <span className="block text-sm font-bold text-gray-700">Au</span>
                        <input type="date" value={exportEnd} onChange={e => setExportEnd(e.target.value)} className="border border-gray-300 bg-white text-gray-900 p-2 rounded w-full" />
                    </label>
                    <button onClick={handleExport} className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700 w-full md:w-auto mt-2 md:mt-0 font-medium shadow">
                        Télécharger .xlsx
                    </button>
                </div>
             </div>
          )}
        </div>
        
        {/* LOCAL CONFIRM MODAL FOR ADMIN */}
        {confirmConfig && (
            <ConfirmModal 
                isOpen={confirmConfig.isOpen}
                title={confirmConfig.title}
                message={confirmConfig.message}
                onConfirm={confirmConfig.onConfirm}
                onCancel={() => setConfirmConfig(null)}
            />
        )}
      </div>
    </div>
  );
};