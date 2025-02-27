import { supabase } from './supabase-config.js';

export async function requireAuth() {
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) {
        window.location.href = '/pages/login.html';
        return null;
    }
    
    return user;
}
