import { createClient } from '@supabase/supabase-js'

// Read environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Check if variables are set
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase environment variables not found. Make sure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in frontend/.env')
  // Optionally throw an error or handle this scenario appropriately
  // For now, we'll let it proceed but log the error. In a real app, throwing might be better.
  // throw new Error('Supabase URL and Anon Key must be provided in .env')
}

// Create and export the Supabase client
// We assert non-null here because we logged an error if they are missing.
// In a stricter setup, you might handle the potentially null values differently.
export const supabase = createClient(supabaseUrl!, supabaseAnonKey!)

console.log('Supabase client initialized.'); // Add a log to confirm initialization