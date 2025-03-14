import { auth, supabase } from '../js/supabase.js';

// Check if already authenticated first
async function checkAuth() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        console.log('Already authenticated, redirecting...');
        window.location.href = '/index.html';
        return true;
    }
    return false;
}

// Debounce function to prevent rapid repeated submissions
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        if (timeout) {
            return;
        }
        timeout = setTimeout(() => {
            func.apply(this, args);
            timeout = null;
        }, wait);
    };
}

document.addEventListener('DOMContentLoaded', async () => {
    // Check auth status first
    if (await checkAuth()) return;

    // Get form containers
    const loginFormContainer = document.querySelector('.login-form-container');
    const signupFormContainer = document.querySelector('.signup-form-container');
    const forgotFormContainer = document.querySelector('.forgot-form-container');

    if (!loginFormContainer || !signupFormContainer || !forgotFormContainer) {
        console.error('Form containers not found');
        return;
    }

    // Function to toggle between forms
    function showForm(type) {
        const titles = {
            login: 'Login',
            signup: 'Create Account',
            forgot: 'Reset Password'
        };

        const title = document.querySelector('.auth-card h1');
        if (title) title.textContent = titles[type];

        // Hide all forms first
        [loginFormContainer, signupFormContainer, forgotFormContainer].forEach(container => {
            container.style.display = 'none';
        });

        // Show selected form
        switch (type) {
            case 'login':
                loginFormContainer.style.display = 'block';
                break;
            case 'signup':
                signupFormContainer.style.display = 'block';
                break;
            case 'forgot':
                forgotFormContainer.style.display = 'block';
                break;
        }
    }

    // Add click handlers to all form toggle links
    document.querySelectorAll('[data-form]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            showForm(e.target.dataset.form);
        });
    });

    // Handle login form submit
    const loginForm = loginFormContainer.querySelector('form');
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitButton = loginForm.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.textContent = 'Logging in...';
        
        try {
            const email = loginForm.querySelector('#login-email').value;
            const password = loginForm.querySelector('#login-password').value;
            
            // Login with Supabase
            const { data, error: loginError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });
            
            if (loginError) throw loginError;

            console.log('Login successful, checking profile...');
            
            // Check if profile exists
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', data.user.id)
                .single();

            console.log('Profile check result:', { profile, profileError });
            
            // Create profile if it doesn't exist
            if (!profile) {
                console.log('Creating new profile...');
                const { error: createError } = await supabase
                    .from('profiles')
                    .insert([{
                        id: data.user.id,
                        username: email.split('@')[0],
                        display_name: email.split('@')[0],
                        role: 'user'
                    }]);

                if (createError) {
                    console.error('Profile creation error:', createError);
                    throw createError;
                }
                console.log('Profile created successfully');
            }

            window.location.href = '/index.html';

        } catch (error) {
            console.error('Login failed:', error);
            alert('Login failed: ' + error.message);
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Log In';
        }
    });

    // Handle signup form submit
    const signupForm = signupFormContainer.querySelector('form');
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitButton = signupForm.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.textContent = 'Creating Account...';

        try {
            const email = signupForm.querySelector('#signup-email').value;
            const password = signupForm.querySelector('#signup-password').value;
            const username = signupForm.querySelector('#signup-username').value;

            const { data: { user }, error: signupError } = await supabase.auth.signUp({
                email,
                password,
            });

            if (signupError) throw signupError;

            if (user) {
                const { error: profileError } = await supabase.from('profiles').insert([{
                    id: user.id,
                    username: username,
                    display_name: username,
                }]);

                if (profileError) throw profileError;

                alert('Account created! Please check your email to confirm your account.');
                showForm('login');
            }

        } catch (error) {
            console.error('Signup failed:', error);
            alert('Signup failed: ' + error.message);
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Create Account';
        }
    });

    // Handle forgot password form submit
    const forgotForm = forgotFormContainer.querySelector('form');
    forgotForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitButton = forgotForm.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.textContent = 'Sending...';

        try {
            const email = forgotForm.querySelector('#forgot-email').value;
            const { error } = await supabase.auth.resetPasswordForEmail(email);
            
            if (error) throw error;
            alert('Password reset instructions sent to your email!');
            showForm('login');

        } catch (error) {
            console.error('Password reset failed:', error);
            alert('Password reset failed: ' + error.message);
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Send Reset Link';
        }
    });

    // Show login form by default
    showForm('login');
});
