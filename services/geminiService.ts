import { GoogleGenAI, Type } from "@google/genai";
import { Creneau } from "../types";

const getEnv = (key: string) => {
  try {
    // @ts-ignore
    return typeof process !== 'undefined' && process.env ? process.env[key] : undefined;
  } catch {
    return undefined;
  }
};

const apiKey = getEnv('API_KEY') || "";
// On initialise, même sans clé, pour éviter que l'import ne plante. Les appels méthodes échoueront proprement.
const ai = new GoogleGenAI({ apiKey });

export const GeminiService = {
  /**
   * Generates a list of slots based on a natural language prompt and a date range.
   */
  generateSlots: async (startDate: Date, endDate: Date, prompt: string) => {
    if (!apiKey) {
        console.error("API_KEY manquante pour Gemini.");
        return [];
    }

    const systemInstruction = `
      You are an assistant for a recycling center scheduler.
      Generate a JSON list of time slots based on the user's request and the provided date range.
      The output should be an array of objects.
      Each object represents a pattern to apply within the date range.
      
      Schema:
      - dayOffset: number (0 = Monday, 1 = Tuesday, ... 6 = Sunday)
      - startHour: number (0-23)
      - startMinute: number (0-59)
      - endHour: number (0-23)
      - endMinute: number (0-59)
      - title: string (The label of the slot)

      Example: "Monday and Tuesday from 2pm to 4pm for 'Sorting'" -> 
      [{dayOffset: 0, startHour: 14, startMinute: 0, endHour: 16, endMinute: 0, title: 'Sorting'}, {dayOffset: 1, ...}]
    `;

    const userPrompt = `
      Date range context: From ${startDate.toDateString()} to ${endDate.toDateString()}.
      User Request: "${prompt}"
    `;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: userPrompt,
        config: {
            systemInstruction: systemInstruction,
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        dayOffset: { type: Type.INTEGER },
                        startHour: { type: Type.INTEGER },
                        startMinute: { type: Type.INTEGER },
                        endHour: { type: Type.INTEGER },
                        endMinute: { type: Type.INTEGER },
                        title: { type: Type.STRING }
                    },
                    required: ["dayOffset", "startHour", "endHour", "title"]
                }
            }
        }
      });

      const text = response.text;
      if (!text) return [];
      return JSON.parse(text);

    } catch (error) {
      console.error("Gemini Error:", error);
      return [];
    }
  },

  /**
   * Interprets a volunteer's voice command to find matching slots.
   */
  interpretVoiceCommand: async (
    transcript: string, 
    currentWeekStart: Date, 
    availableSlots: Creneau[]
  ): Promise<{ patternIds: string[], confirmationMessage: string, action: 'add' | 'remove' }> => {
    console.log(`[GeminiService] Démarrage interprétation. Texte: "${transcript}"`);
    
    if (!apiKey) {
        console.error("[GeminiService] ERREUR: Clé API manquante.");
        return { patternIds: [], confirmationMessage: "Configuration API manquante.", action: 'add' };
    }

    // Simply map slots to a minified list to save tokens
    // We include the month in the date to avoid ambiguity over a range of several weeks
    const minifiedSlots = availableSlots.map(s => ({
        id: s.id,
        day: new Date(s.date_debut).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }),
        time: `${new Date(s.date_debut).getHours()}h-${new Date(s.date_fin).getHours()}h`,
        title: s.titre
    }));
    
    console.log(`[GeminiService] Contexte envoyé: ${minifiedSlots.length} créneaux disponibles.`);

    const systemInstruction = `
      You are a helper matching a volunteer's spoken wish to available time slots.
      You have a list of available slots with IDs.
      
      Determine if the user wants to REGISTER ('add') or CANCEL/UNSUBSCRIBE ('remove').
      Keywords for 'remove': "annuler", "désinscrire", "enlever", "supprimer", "cancel", "unsubscribe".
      Default action is 'add'.

      Return a JSON object with:
      1. 'matchedIds': array of strings (IDs of the slots that match the user's intent).
      2. 'action': string ("add" or "remove").
      3. 'message': a polite confirmation message in French summarizing what was understood (e.g. "Je vous inscris pour mardi..." or "J'annule votre créneau de mardi...").
      
      If the user says "All mornings", select all slots in the morning.
      If the user says "Mardi boutique", select the specific slot.
      If the user refers to a date in the future (e.g. "next week", "in two weeks"), use the provided dates in the list.
    `;

    const userContent = `
      Context: Available slots starting from ${currentWeekStart.toLocaleDateString()}.
      Available Slots: ${JSON.stringify(minifiedSlots)}
      User Voice Transcript: "${transcript}"
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: userContent,
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        matchedIds: { type: Type.ARRAY, items: { type: Type.STRING } },
                        action: { type: Type.STRING, enum: ["add", "remove"] },
                        message: { type: Type.STRING }
                    }
                }
            }
        });

        const text = response.text;
        console.log(`[GeminiService] Réponse brute de l'IA:`, text);

        if (!text) return { patternIds: [], confirmationMessage: "Je n'ai pas compris.", action: 'add' };
        
        const result = JSON.parse(text);
        console.log(`[GeminiService] JSON parsé avec succès. IDs trouvés:`, result.matchedIds, "Action:", result.action);
        
        return {
            patternIds: result.matchedIds || [],
            confirmationMessage: result.message || "Commande traitée.",
            action: result.action || 'add'
        };

    } catch (e) {
        console.error("[GeminiService] Exception lors de l'appel Gemini:", e);
        return { patternIds: [], confirmationMessage: "Erreur d'analyse IA.", action: 'add' };
    }
  }
};