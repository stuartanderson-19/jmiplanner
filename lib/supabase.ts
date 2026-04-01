import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Browser client (anon key)
export const supabase = createClient(url, anon)

// Server client (service role — never expose to browser)
export const supabaseAdmin = () => createClient(url, service)
