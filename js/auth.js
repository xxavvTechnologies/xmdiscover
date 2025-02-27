import { supabase } from './supabase-config.js';

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });
        if (error) throw error;
        window.location.href = 'home.html';
    } catch (error) {
        alert(error.message);
    }
}

async function handleSignup(e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const username = document.getElementById('username').value;

    try {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    username: username
                }
            }
        });
        if (error) throw error;

        // Create profile with default user role
        const { error: profileError } = await supabase.from('profiles').insert([
            {
                id: data.user.id,  // Changed from user_id to id
                username,
                user_role: 'user',  // Set default role
                created_at: new Date()
            }
        ]);

        if (profileError) throw profileError;
        alert('Please check your email for verification');
    } catch (error) {
        alert('Error during signup: ' + error.message);
    }
}

// Add event listeners based on current page
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');

if (loginForm) loginForm.addEventListener('submit', handleLogin);
if (signupForm) signupForm.addEventListener('submit', handleSignup);
