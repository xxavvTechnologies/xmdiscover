import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false
    }
});

export const auth = {
    async signUp(email, password) {
        const { data: { user }, error } = await supabase.auth.signUp({
            email,
            password,
        });
        if (error) throw error;
        
        // Create profile for new user
        if (user) {
            const { error: profileError } = await supabase
                .from('profiles')
                .insert([{
                    id: user.id,
                    username: email.split('@')[0],
                    display_name: email.split('@')[0],
                }]);
            
            if (profileError) throw profileError;
        }
        
        return user;
    },

    async signIn(email, password) {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });
        if (error) throw error;
        return data;
    },

    async signOut() {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
    },

    async getSession() {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;
        return session;
    }
};
