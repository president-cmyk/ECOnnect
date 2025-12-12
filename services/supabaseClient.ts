import { createClient } from '@supabase/supabase-js';

// Récupération sécurisée des variables d'environnement
const getEnv = (key: string) => {
  try {
    // @ts-ignore
    return typeof process !== 'undefined' && process.env ? process.env[key] : undefined;
  } catch {
    return undefined;
  }
};

const supabaseUrl = 'https://fsvdelgjatnlgaiccmuk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzdmRlbGdqYXRubGdhaWNjbXVrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0NTYzMjMsImV4cCI6MjA4MTAzMjMyM30.7He29JLE3gty6oiM-CbuqhqlwRYDxNW-rzXJqOMEzLk';



// createClient lance une erreur si l'URL est vide.
// On utilise une valeur de repli pour éviter le crash de l'application si les variables ne sont pas définies.
// Les appels API échoueront ensuite proprement au lieu de bloquer le chargement du script.
const url = supabaseUrl || 'https://fsvdelgjatnlgaiccmuk.supabase.co';
const key = supabaseKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzdmRlbGdqYXRubGdhaWNjbXVrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0NTYzMjMsImV4cCI6MjA4MTAzMjMyM30.7He29JLE3gty6oiM-CbuqhqlwRYDxNW-rzXJqOMEzLk';

if (!supabaseUrl || !supabaseKey) {
  console.warn("⚠️ ATTENTION: SUPABASE_URL ou SUPABASE_ANON_KEY manquant. Vérifiez votre configuration.");
}

export const supabase = createClient(url, key);