import { supabase, getPagePath } from './supabase.js';
import { notifications } from './services/notifications.js';

export async function handleLogin(email, password) {
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;

        notifications.show('Welcome back!', 'success');
        window.location.href = getPagePath('/discover');
    } catch (error) {
        notifications.show('Login failed: ' + error.message, 'error');
        throw error;
    }
}

export async function handleSignup(email, password, username) {
    try {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: { username }
            }
        });

        if (error) throw error;

        notifications.show('Account created successfully! Please check your email.', 'success');
        window.location.href = getPagePath('/auth/verify');
    } catch (error) {
        notifications.show('Signup failed: ' + error.message, 'error');
        throw error;
    }
}

export async function handleLogout() {
    try {
        await supabase.auth.signOut();
        notifications.show('You have been logged out', 'info');
        window.location.href = getPagePath('/');
    } catch (error) {
        notifications.show('Logout failed: ' + error.message, 'error');
    }
}
