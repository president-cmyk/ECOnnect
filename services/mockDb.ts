import { supabase } from './supabaseClient';
import { Benevole, Creneau, Inscription } from '../types';

export const db = {
  getBenevoles: async (): Promise<Benevole[]> => {
    const { data, error } = await supabase
      .from('Benevoles')
      .select('*')
      .order('nom', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  addBenevole: async (nom: string): Promise<Benevole> => {
    const { data: existing } = await supabase
        .from('Benevoles')
        .select('id')
        .ilike('nom', nom)
        .maybeSingle();

    if (existing) throw new Error("Ce bénévole existe déjà");

    const { data, error } = await supabase
      .from('Benevoles')
      .insert([{ nom }])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  updateBenevole: async (id: string, nom: string): Promise<void> => {
     // Vérification qu'aucun AUTRE bénévole ne porte ce nom
     const { data: existing } = await supabase
        .from('Benevoles')
        .select('id')
        .ilike('nom', nom)
        .neq('id', id) // On exclut le bénévole actuel de la recherche
        .maybeSingle();

     if (existing) {
         throw new Error("Ce nom est déjà utilisé par un autre bénévole.");
     }

     const { error } = await supabase
        .from('Benevoles')
        .update({ nom })
        .eq('id', id);
     if (error) throw error;
  },

  updateLastConnection: async (id: string): Promise<void> => {
    // Mise à jour silencieuse de la date de dernière connexion
    // On ne jette pas d'erreur critique si ça échoue (fonctionnalité non bloquante)
    try {
        await supabase
            .from('Benevoles')
            .update({ derniere_connexion: new Date().toISOString() })
            .eq('id', id);
    } catch (e) {
        console.warn("Impossible de mettre à jour la date de connexion", e);
    }
  },

  deleteBenevole: async (id: string): Promise<void> => {
    // 1. Supprimer d'abord les inscriptions liées (sécurité si ON DELETE CASCADE manquant)
    const { error: errorInsc } = await supabase
        .from('Inscriptions')
        .delete()
        .eq('benevole_id', id);
    if (errorInsc) throw errorInsc;

    // 2. Supprimer le bénévole
    const { error } = await supabase
        .from('Benevoles')
        .delete()
        .eq('id', id);
    if (error) throw error;
  },

  getCreneaux: async (startStr: string, endStr: string): Promise<Creneau[]> => {
    const { data, error } = await supabase
      .from('Creneaux')
      .select('*')
      .gte('date_debut', startStr)
      .lte('date_fin', endStr);
    
    if (error) throw error;
    return data || [];
  },

  addCreneau: async (c: Omit<Creneau, 'id'>): Promise<Creneau> => {
    const { data, error } = await supabase
      .from('Creneaux')
      .insert([c])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  updateCreneau: async (id: string, updates: Partial<Creneau>): Promise<void> => {
    const { error } = await supabase
      .from('Creneaux')
      .update(updates)
      .eq('id', id);
    if (error) throw error;
  },

  deleteCreneau: async (id: string): Promise<void> => {
    // 1. Supprimer d'abord les inscriptions liées
    const { error: errorInsc } = await supabase
        .from('Inscriptions')
        .delete()
        .eq('creneau_id', id);
    if (errorInsc) throw errorInsc;

    // 2. Supprimer le créneau
    const { error } = await supabase
      .from('Creneaux')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  getInscriptions: async (): Promise<Inscription[]> => {
    const { data, error } = await supabase
      .from('Inscriptions')
      .select('*');
    if (error) throw error;
    return data || [];
  },

  addInscription: async (benevole_id: string, creneau_id: string): Promise<Inscription> => {
    const { data, error } = await supabase
      .from('Inscriptions')
      .insert([{ benevole_id, creneau_id }])
      .select()
      .single();

    if (error) {
        if (error.code === '23505') throw new Error("Déjà inscrit");
        throw error;
    }
    return data;
  },

  removeInscription: async (benevole_id: string, creneau_id: string): Promise<void> => {
    console.log(`[DB] Tentative suppression inscription - Benevole: ${benevole_id}, Creneau: ${creneau_id}`);
    
    // On demande le 'count' pour savoir si quelque chose a vraiment été supprimé
    const { error, count } = await supabase
      .from('Inscriptions')
      .delete({ count: 'exact' })
      .eq('benevole_id', benevole_id)
      .eq('creneau_id', creneau_id);
      
    if (error) {
        console.error("[DB] Erreur Supabase Delete:", error);
        throw error;
    }

    if (count === 0) {
        console.warn("[DB] Attention: Aucune ligne supprimée. L'inscription n'existait peut-être plus ou les IDs sont incorrects.");
    } else {
        console.log(`[DB] Succès: ${count} inscription(s) supprimée(s).`);
    }
  },
  
  getAllInscriptionsDetailed: async (startStr: string, endStr: string) => {
    const { data, error } = await supabase
        .from('Inscriptions')
        .select(`
            *,
            Benevoles (nom),
            Creneaux!inner (titre, date_debut, date_fin)
        `)
        .gte('Creneaux.date_debut', startStr)
        .lte('Creneaux.date_fin', endStr);

    if (error) throw error;

    return (data || []).map((row: any) => ({
        Date: new Date(row.Creneaux.date_debut).toLocaleDateString(),
        HeureDebut: new Date(row.Creneaux.date_debut).toLocaleTimeString(),
        HeureFin: new Date(row.Creneaux.date_fin).toLocaleTimeString(),
        Intitule: row.Creneaux.titre,
        Benevole: row.Benevoles?.nom || 'Inconnu'
    }));
  }
};