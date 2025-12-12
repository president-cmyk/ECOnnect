import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Loader2, Check, X } from 'lucide-react';
import { GeminiService } from '../services/geminiService';
import { Creneau } from '../types';

interface VoiceCommandProps {
  currentWeekStart: Date;
  availableSlots: Creneau[];
  onConfirm: (slotIds: string[], action: 'add' | 'remove') => void;
}

export const VoiceCommand: React.FC<VoiceCommandProps> = ({ currentWeekStart, availableSlots, onConfirm }) => {
  const [isListening, setIsListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [feedback, setFeedback] = useState<{ ids: string[], msg: string, action: 'add' | 'remove' } | null>(null);
  
  const recognitionRef = useRef<any>(null);

  // Browser Speech Recognition Support
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const toggleListening = () => {
    if (isListening) {
      console.log("🎤 [VoiceCommand] Arrêt manuel de l'écoute.");
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    if (!SpeechRecognition) {
      alert("La reconnaissance vocale n'est pas supportée par votre navigateur (essayez Chrome).");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'fr-FR';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognitionRef.current = recognition;

    recognition.onstart = () => {
        console.log("🎤 [VoiceCommand] Micro ouvert, écoute en cours...");
        setIsListening(true);
    };
    
    recognition.onresult = async (event: any) => {
      const text = event.results[0][0].transcript;
      console.log(`🎤 [VoiceCommand] Texte capturé: "${text}"`);
      setTranscript(text);
      // isListening will be set to false by onend
      await processCommand(text);
    };

    recognition.onerror = (event: any) => {
      // Handle specific errors gracefully
      if (event.error === 'no-speech') {
         console.warn("Speech recognition: No speech detected.");
         setFeedback({ ids: [], msg: "Je n'ai rien entendu. Réessayez.", action: 'add' });
      } else if (event.error === 'aborted') {
         console.warn("Speech recognition: Aborted.");
         // User stopped or interrupted, no feedback needed usually
      } else if (event.error === 'not-allowed') {
         console.error("Speech recognition: Not allowed.");
         setFeedback({ ids: [], msg: "Accès micro refusé.", action: 'add' });
      } else {
         console.error("Speech recognition error:", event.error);
         setFeedback({ ids: [], msg: "Erreur technique.", action: 'add' });
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      console.log("🎤 [VoiceCommand] Fin de l'événement vocal (onend).");
      setIsListening(false);
      recognitionRef.current = null;
    };

    try {
      recognition.start();
    } catch (e) {
      console.error("Failed to start recognition", e);
    }
  };

  const processCommand = async (text: string) => {
    console.log(`🔄 [VoiceCommand] Envoi au service Gemini: "${text}"`);
    setProcessing(true);
    const result = await GeminiService.interpretVoiceCommand(text, currentWeekStart, availableSlots);
    console.log("✅ [VoiceCommand] Réponse reçue de Gemini:", result);
    
    setFeedback({ ids: result.patternIds, msg: result.confirmationMessage, action: result.action });
    setProcessing(false);
  };

  const handleConfirm = () => {
    if (feedback && feedback.ids.length > 0) {
      console.log(`✅ [VoiceCommand] Confirmation utilisateur pour les IDs: ${feedback.ids.join(', ')} (Action: ${feedback.action})`);
      onConfirm(feedback.ids, feedback.action);
      setFeedback(null);
      setTranscript('');
    }
  };

  const handleCancel = () => {
    console.log("❌ [VoiceCommand] Annulation utilisateur.");
    setFeedback(null);
    setTranscript('');
  };

  return (
    <div className="flex items-center gap-2">
      {!feedback ? (
        <button
          onClick={toggleListening}
          disabled={processing}
          className={`p-2 rounded-full transition-colors ${
            isListening ? 'bg-red-500 animate-pulse text-white' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
          }`}
          title={isListening ? "Arrêter l'écoute" : "Commande vocale (ex: 'Inscris-moi mardi matin' ou 'Annule ma participation')"}
        >
          {processing ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : isListening ? (
             <MicOff className="h-5 w-5" />
          ) : (
             <Mic className="h-5 w-5" />
          )}
        </button>
      ) : (
        <div className="absolute top-16 left-0 right-0 z-50 mx-auto max-w-md p-4 bg-white shadow-xl rounded-lg border border-gray-200 animate-in fade-in slide-in-from-top-4">
            <h4 className={`font-bold mb-1 flex items-center gap-2 ${feedback.action === 'remove' ? 'text-red-700' : 'text-green-700'}`}>
                {feedback.action === 'remove' ? 'Confirmer la désinscription' : 'Confirmer l\'inscription'}
            </h4>
            <p className="text-sm text-gray-600 italic mb-2">"{transcript}"</p>
            <p className="font-medium mb-4 text-gray-800">{feedback.msg}</p>
            <div className="flex justify-end gap-2">
                <button onClick={handleCancel} className="px-3 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 flex items-center gap-1">
                    <X className="h-4 w-4" /> Annuler
                </button>
                {feedback.ids.length > 0 && (
                    <button 
                        onClick={handleConfirm} 
                        className={`px-3 py-1 rounded text-white flex items-center gap-1 ${feedback.action === 'remove' ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}
                    >
                        <Check className="h-4 w-4" /> Valider ({feedback.ids.length})
                    </button>
                )}
            </div>
        </div>
      )}
    </div>
  );
};