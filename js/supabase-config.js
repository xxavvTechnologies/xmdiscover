import { createClient } from 'https://esm.sh/@supabase/supabase-js'

const SUPABASE_URL = 'https://otwtruefoxylsodrcsph.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im90d3RydWVmb3h5bHNvZHJjc3BoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA2OTQwNTYsImV4cCI6MjA1NjI3MDA1Nn0.cXzN3Ss7-RTTZoGEzX6ZMmZ_RNIcXGngFUb3tNSvMas'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export { supabase }
