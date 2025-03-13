import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false
    }
});

// Modify auth state change handler
supabase.auth.onAuthStateChange((event, session) => {
    // Only redirect on explicit sign out
    if (event === 'SIGNED_OUT' && window.location.pathname.includes('/admin/')) {
        console.log('Signed out, redirecting...');
        setTimeout(() => window.location.href = '/auth/login.html', 1000);
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
