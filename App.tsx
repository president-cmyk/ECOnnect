import React, { useState, useEffect, useMemo } from 'react';
import { Header } from './components/Header';
import { AdminPanel } from './components/AdminPanel';
import { VoiceCommand } from './components/VoiceCommand';
import { ConfirmModal } from './components/ConfirmModal';
import { db } from './services/mockDb';
import { Benevole, CreneauDisplay, Creneau, Inscription } from './types';
import { ChevronLeft, ChevronRight, LogOut, UserPlus, CheckCircle, Calendar as CalendarIcon, XCircle, History, Search, PlusCircle, ChevronDown, ChevronUp } from 'lucide-react';

const App: React.FC = () => {
  // --- State ---
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<Benevole | null>(null);
  const [currentDate, setCurrentDate] = useState(new Date()); // Reference date for the week
  
  // Modal State
  const [confirmConfig, setConfirmConfig] = useState<{
      isOpen: boolean;
      title: string;
      message: string;
      onConfirm: () => void;
  } | null>(null);
  
  // Data State
  const [benevoles, setBenevoles] = useState<Benevole[]>([]);
  const [creneaux, setCreneaux] = useState<Creneau[]>([]);
  const [inscriptions, setInscriptions] = useState<Inscription[]>([]);
  
  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [showMyPlanning, setShowMyPlanning] = useState(false);

  // --- Derived State (Memoized) ---
  
  // Calculate start (Monday) and end (Sunday) of the week
  const { weekStart, weekEnd } = useMemo(() => {
    const start = new Date(currentDate);
    const day = start.getDay();
    const diff = start.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is sunday
    start.setDate(diff);
    start.setHours(0,0,0,0);
    
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23,59,59,999);
    
    return { weekStart: start, weekEnd: end };
  }, [currentDate]);

  // Combine Data for Display
  const creneauxDisplay: CreneauDisplay[] = useMemo(() => {
    return creneaux.map(c => ({
      ...c,
      inscrits: inscriptions
        .filter(i => i.creneau_id === c.id)
        .map(i => benevoles.find(b => b.id === i.benevole_id)!)
        .filter(Boolean) // Remove undefined if sync issue
    }));
  }, [creneaux, inscriptions, benevoles]);

  // Logic for filtering volunteers or showing recent history
  const filteredBenevoles = useMemo(() => {
    // Si la recherche est vide, on montre l'historique (top 8)
    if (!searchQuery.trim()) {
        return [...benevoles]
            .filter(b => b.derniere_connexion) // On ne garde que ceux qui se sont déjà connectés
            .sort((a, b) => new Date(b.derniere_connexion!).getTime() - new Date(a.derniere_connexion!).getTime())
            .slice(0, 8);
    }
    // Sinon on filtre par nom
    return benevoles.filter(b => 
        b.nom.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [benevoles, searchQuery]);

  // Check if the exact name already exists (case insensitive) to decide whether to show "Create"
  const exactMatchExists = useMemo(() => {
      if (!searchQuery) return false;
      return benevoles.some(b => b.nom.toLowerCase() === searchQuery.trim().toLowerCase());
  }, [benevoles, searchQuery]);

  const currentUserSlots = useMemo(() => {
      if (!currentUser) return [];
      // On filtre pour ne garder que les créneaux où l'utilisateur est inscrit
      // ET qui sont dans la semaine actuellement affichée (weekStart -> weekEnd)
      return creneauxDisplay.filter(c => {
          const start = new Date(c.date_debut);
          const isRegistered = c.inscrits.some(b => b.id === currentUser.id);
          const isInCurrentView = start >= weekStart && start <= weekEnd;
          return isRegistered && isInCurrentView;
      });
  }, [creneauxDisplay, currentUser, weekStart, weekEnd]);

  // --- Effects ---

  const refreshData = async () => {
    try {
      // Calculate a date 10 weeks from the start of the current week 
      // to allow voice commands for inscription AND cancellation up to 10 weeks out.
      const futureDate = new Date(weekStart);
      futureDate.setDate(futureDate.getDate() + 70); // 10 weeks

      const [b, c, i] = await Promise.all([
        db.getBenevoles(),
        // Get slots for a wider range (current week + 10 weeks)
        db.getCreneaux(
            new Date(weekStart.getTime() - 86400000).toISOString(), 
            futureDate.toISOString()
        ),
        db.getInscriptions()
      ]);
      setBenevoles(b);
      setCreneaux(c);
      setInscriptions(i);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    refreshData();
  }, [currentDate]); // Refresh when changing weeks

  // --- Handlers ---

  const handleWeekChange = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    newDate.setDate(currentDate.getDate() + (direction === 'next' ? 7 : -7));
    setCurrentDate(newDate);
  };

  const handleLogin = async (b: Benevole) => {
    setCurrentUser(b);
    setSearchQuery(b.nom);
    setIsInputFocused(false);
    
    // Update last connection in DB
    try {
        await db.updateLastConnection(b.id);
        // We trigger a silent refresh to update the list for future searches
        refreshData(); 
    } catch (e) {
        console.error("Failed to update last connection", e);
    }
  };

  const handleCreateAndLogin = async () => {
    if (!searchQuery) return;
    try {
      const newB = await db.addBenevole(searchQuery);
      // Wait for the new user to be added, then login
      // Add local update just in case refresh is slow
      const updatedList = [...benevoles, newB];
      setBenevoles(updatedList);
      
      handleLogin(newB);
    } catch (e) {
      alert("Erreur lors de la création");
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setSearchQuery('');
    setShowMyPlanning(false);
  };

  const handleSubscribe = async (slotId: string) => {
    if (!currentUser) return;
    try {
      await db.addInscription(currentUser.id, slotId);
      refreshData();
    } catch (e: any) {
      console.error(e);
      alert("Erreur inscription: " + e.message);
    }
  };

  const handleUnsubscribe = (slotId: string) => {
    if (!currentUser) return;
    console.log("Action désinscription demandée par", currentUser.nom, "(ID:", currentUser.id, ") sur créneau ID:", slotId);
    
    // Open Custom Modal instead of window.confirm
    setConfirmConfig({
        isOpen: true,
        title: "Désinscription",
        message: "Voulez-vous vraiment vous désinscrire de ce créneau ?",
        onConfirm: async () => {
            try {
                await db.removeInscription(currentUser.id, slotId);
                console.log("Désinscription effectuée côté client, rafraîchissement...");
                await refreshData();
            } catch (e: any) {
                console.error("Erreur désinscription UI:", e);
                alert(`Erreur: ${e.message}`);
            } finally {
                setConfirmConfig(null);
            }
        }
    });
  };

  const handleVoiceConfirm = async (slotIds: string[], action: 'add' | 'remove') => {
    if (!currentUser) return;
    
    // Process registrations
    if (action === 'add') {
        for (const sid of slotIds) {
            // Check if already subscribed to avoid error alerts
            const already = inscriptions.some(i => i.benevole_id === currentUser.id && i.creneau_id === sid);
            if (!already) {
                try {
                    await db.addInscription(currentUser.id, sid);
                } catch (e) {
                    console.error("Erreur inscription multiple", e);
                }
            }
        }
    } 
    // Process cancellations
    else if (action === 'remove') {
        for (const sid of slotIds) {
             try {
                // MockDB removeInscription handles logic even if not found (count 0)
                await db.removeInscription(currentUser.id, sid);
            } catch (e) {
                console.error("Erreur désinscription multiple", e);
            }
        }
    }

    refreshData();
  };

  // --- Render Helpers ---

  const renderDays = () => {
    const days = [];
    const tempD = new Date(weekStart);
    for(let i=0; i<7; i++) {
        days.push(new Date(tempD));
        tempD.setDate(tempD.getDate() + 1);
    }
    return days;
  };

  return (
    // MAIN LAYOUT: Full Screen Height, Flex Column
    <div className="h-screen bg-gray-50 flex flex-col font-sans overflow-hidden">
      
      {/* 1. FIXED HEADER */}
      <div className="flex-none">
          <Header onAdminClick={() => setIsAdminOpen(true)} />
      </div>

      {isAdminOpen && (
        <AdminPanel 
          currentWeekStart={weekStart}
          currentWeekEnd={weekEnd}
          benevoles={benevoles}
          creneaux={creneaux}
          inscriptions={inscriptions}
          refreshData={refreshData}
          closeAdmin={() => setIsAdminOpen(false)}
        />
      )}

      {/* GLOBAL CONFIRM MODAL */}
      {confirmConfig && (
        <ConfirmModal 
            isOpen={confirmConfig.isOpen}
            title={confirmConfig.title}
            message={confirmConfig.message}
            onConfirm={confirmConfig.onConfirm}
            onCancel={() => setConfirmConfig(null)}
        />
      )}

      {/* 2. FIXED CONTROLS AREA (Search + Week) */}
      <div className="flex-none z-30 bg-white shadow-md">
            {/* LOGIN BAR - No margin, border bottom */}
            <div className="p-3 border-b border-gray-200">
                <div className="flex items-center gap-3 w-full">
                    {currentUser ? (
                        <div className="flex items-center gap-3 w-full">
                            <div className="flex-grow">
                                <div 
                                    className="font-bold text-lg text-teal-800 flex items-center gap-2 cursor-pointer select-none" 
                                    onClick={() => setShowMyPlanning(!showMyPlanning)}
                                    title={showMyPlanning ? "Masquer mon planning" : "Voir mon planning"}
                                >
                                    {currentUser.nom}
                                    <span className="bg-teal-100 text-teal-800 text-xs px-2 py-1 rounded-full">{currentUserSlots.length} créneaux</span>
                                    {showMyPlanning ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                </div>
                                
                                {/* My Planning Expandable */}
                                {showMyPlanning && (
                                    <div className="mt-2 p-3 bg-teal-50 rounded border border-teal-100 animate-in fade-in slide-in-from-top-2 max-h-[150px] overflow-y-auto">
                                        <h4 className="text-sm font-bold text-teal-800 mb-2">
                                            Mon planning cette semaine ({weekStart.toLocaleDateString('fr-FR', {day: 'numeric', month: 'short'})} - {weekEnd.toLocaleDateString('fr-FR', {day: 'numeric', month: 'short'})}):
                                        </h4>
                                        <div className="flex flex-wrap gap-2">
                                            {currentUserSlots.length === 0 && <span className="text-gray-500 text-sm">Aucun créneau cette semaine.</span>}
                                            {currentUserSlots.sort((a,b) => new Date(a.date_debut).getTime() - new Date(b.date_debut).getTime()).map(c => (
                                                <span key={c.id} className="inline-flex items-center bg-teal-600 text-white px-2 py-1 rounded text-sm shadow-sm">
                                                    {new Date(c.date_debut).toLocaleDateString('fr-FR', {weekday:'short'})} {new Date(c.date_debut).getHours()}h-{new Date(c.date_fin).getHours()}h
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <VoiceCommand 
                                currentWeekStart={weekStart} 
                                availableSlots={creneaux} 
                                onConfirm={handleVoiceConfirm}
                            />
                            
                            <button onClick={handleLogout} className="text-red-500 hover:bg-red-50 p-2 rounded-full" title="Déconnexion">
                                <LogOut className="h-6 w-6" />
                            </button>
                        </div>
                    ) : (
                        <div className="relative w-full">
                            <div className="relative">
                                <input 
                                    type="text" 
                                    className="w-full border-2 border-teal-500 rounded-lg py-3 pl-10 pr-4 text-lg focus:outline-none focus:ring-2 focus:ring-teal-300"
                                    placeholder="Tapez votre nom..."
                                    value={searchQuery}
                                    onFocus={() => setIsInputFocused(true)}
                                    onBlur={() => {
                                        // Delay to allow clicking on the dropdown items
                                        setTimeout(() => setIsInputFocused(false), 200);
                                    }}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-teal-500 h-5 w-5" />
                            </div>
                            
                            {/* Dropdown Results */}
                            {((isInputFocused || searchQuery.length > 0)) && (
                                <div className="absolute top-full left-0 right-0 bg-white shadow-xl border rounded-b-lg mt-1 max-h-60 overflow-y-auto z-50">
                                    <div className="bg-gray-50 px-3 py-1 text-xs font-bold text-gray-500 uppercase flex items-center gap-1">
                                        {!searchQuery ? <><History className="h-3 w-3" /> Dernières connexions</> : <><Search className="h-3 w-3" /> Résultats</>}
                                    </div>
                                    {filteredBenevoles.map(b => (
                                        <div key={b.id} onClick={() => handleLogin(b)} className="p-3 bg-white text-black hover:bg-teal-50 cursor-pointer border-b last:border-0 text-lg flex justify-between items-center group">
                                            <span>{b.nom}</span>
                                            {!searchQuery && b.derniere_connexion && (
                                                <span className="text-xs text-gray-400 group-hover:text-teal-600">{new Date(b.derniere_connexion).toLocaleDateString()}</span>
                                            )}
                                        </div>
                                    ))}
                                    {filteredBenevoles.length === 0 && !searchQuery && <div className="p-4 text-center text-gray-400 text-sm italic">Aucune connexion récente.</div>}
                                    {searchQuery && !exactMatchExists && (
                                        <div onClick={handleCreateAndLogin} className="p-3 bg-white hover:bg-teal-50 cursor-pointer text-teal-700 font-bold flex items-center gap-2 border-t">
                                            <UserPlus className="h-5 w-5" /> Créer "{searchQuery}"
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* WEEK SELECTOR - Toolbar style */}
            <div className="flex justify-between items-center bg-gray-50 p-2 border-b border-gray-200">
                <button onClick={() => handleWeekChange('prev')} className="px-8 py-2 bg-white border border-gray-300 rounded shadow-sm hover:bg-gray-100 flex items-center justify-center">
                    <ChevronLeft className="h-5 w-5 text-gray-700" />
                </button>
                <div className="text-center">
                    <h2 className="text-xl md:text-2xl font-bold text-gray-800 uppercase">
                        {weekStart.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} 
                        {' - '} {weekEnd.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </h2>
                </div>
                <button onClick={() => handleWeekChange('next')} className="px-8 py-2 bg-white border border-gray-300 rounded shadow-sm hover:bg-gray-100 flex items-center justify-center">
                    <ChevronRight className="h-5 w-5 text-gray-700" />
                </button>
            </div>
      </div>

      {/* 3. SCROLLABLE CALENDAR AREA */}
      {/* Takes all remaining height. No internal padding to maximize space */}
      <main className="flex-grow overflow-auto relative bg-white">
            <div className="flex min-w-[800px] h-full divide-x divide-gray-100">
                {renderDays().map((day, index) => {
                    const daySlots = creneauxDisplay.filter(c => {
                        const d = new Date(c.date_debut);
                        return d.getDate() === day.getDate() && d.getMonth() === day.getMonth();
                    }).sort((a,b) => new Date(a.date_debut).getTime() - new Date(b.date_debut).getTime());

                    const isToday = day.toDateString() === new Date().toDateString();

                    return (
                        <div key={index} className={`flex-1 min-w-[140px] flex flex-col ${isToday ? 'bg-blue-50/30' : ''}`}>
                            {/* Day Header - STICKY to the container top, Squared off */}
                            <div className={`text-center p-2 font-bold border-b sticky top-0 z-10 shadow-sm ${isToday ? 'bg-blue-100 text-blue-900 border-blue-200' : 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                                <div className="text-sm uppercase">{day.toLocaleDateString('fr-FR', { weekday: 'long' })}</div>
                                <div className="text-2xl">{day.getDate()}</div>
                            </div>

                            {/* Slots Container */}
                            <div className="flex flex-col gap-2 p-2 pb-4">
                                {daySlots.map(slot => {
                                    const isRegistered = currentUser && slot.inscrits.some(b => b.id === currentUser.id);
                                    
                                    return (
                                        <div key={slot.id} className="relative bg-white border border-gray-300 rounded-lg shadow-sm p-2 flex flex-col gap-1 hover:shadow-md transition-shadow">
                                            {/* Action Button */}
                                            {currentUser && (
                                                <div className="absolute top-1 right-1">
                                                    {!isRegistered ? (
                                                        <button 
                                                            onClick={() => handleSubscribe(slot.id)}
                                                            className="transition-colors hover:scale-105"
                                                            title="M'inscrire"
                                                        >
                                                            <PlusCircle className="h-6 w-6 text-green-600 hover:text-green-700 fill-white" />
                                                            <span className="sr-only">S'inscrire</span>
                                                        </button>
                                                    ) : null}
                                                </div>
                                            )}

                                            {/* Time & Title */}
                                            <div className="font-bold text-gray-900 text-lg leading-tight pr-6">
                                                {new Date(slot.date_debut).getHours()}h-{new Date(slot.date_fin).getHours()}h
                                            </div>
                                            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                                {slot.titre}
                                            </div>

                                            {/* Volunteers List */}
                                            <div className="mt-2 flex flex-wrap gap-1">
                                                {slot.inscrits.map(b => {
                                                    const isMe = currentUser?.id === b.id;
                                                    return (
                                                        <span 
                                                            key={b.id} 
                                                            className={`
                                                                text-sm px-2 py-1 rounded text-white font-medium flex items-center gap-1
                                                                ${isMe ? 'bg-green-600 shadow-md ring-2 ring-green-200' : 'bg-gray-800'}
                                                            `}
                                                        >
                                                            {b.nom}
                                                            {isMe && (
                                                                <button 
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleUnsubscribe(slot.id);
                                                                    }} 
                                                                    className="ml-1 hover:text-red-200" 
                                                                    title="Me désinscrire"
                                                                >
                                                                    <XCircle className="h-3 w-3" />
                                                                </button>
                                                            )}
                                                        </span>
                                                    );
                                                })}
                                                {slot.inscrits.length === 0 && (
                                                    <span className="text-xs text-gray-400 italic">Personne</span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
      </main>
    </div>
  );
};

export default App;