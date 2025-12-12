export interface Benevole {
  id: string;
  nom: string;
  derniere_connexion?: string; // ISO String pour le tri
}

export interface Creneau {
  id: string;
  date_debut: string; // ISO String
  date_fin: string;   // ISO String
  titre: string;
}

export interface Inscription {
  id: string;
  benevole_id: string;
  creneau_id: string;
}

// Combined type for UI display
export interface CreneauDisplay extends Creneau {
  inscrits: Benevole[];
}

export enum ViewMode {
  CALENDAR = 'CALENDAR',
  ADMIN = 'ADMIN'
}

export interface GeminiSlotResponse {
  creneaux: {
    dayOffset: number; // 0 for Monday, 6 for Sunday (relative to start date)
    startHour: number;
    startMinute: number;
    endHour: number;
    endMinute: number;
    title: string;
  }[];
}