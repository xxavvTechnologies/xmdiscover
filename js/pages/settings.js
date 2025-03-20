import { supabase, getPagePath } from '../supabase.js';
import { uploadImage } from '../storage.js';
import { notifications } from '../services/notifications.js';

class SettingsPage {
    constructor() {
        this.init();
    }

    async init() {
        try {
            // Check authentication
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                window.location.href = getPagePath('/auth/login');
                return;
            }

            await this.loadUserSettings();
            this.setupEventListeners();
            
        } catch (error) {
            console.error('Failed to initialize settings:', error);
            notifications.show('Failed to load settings', 'error');
        }
    }

    async loadUserSettings() {
        const { data: { session } } = await supabase.auth.getSession();
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)  // Add filter for current user's ID
            .single();

        if (error) throw error;
        if (!profile) throw new Error('Profile not found');

        // Update form fields
        document.getElementById('display-name').value = profile.display_name || '';
        document.getElementById('username').value = profile.username || '';
        document.getElementById('email').value = profile.email || '';
        document.getElementById('public-profile').checked = profile.public_profile || false;
        document.getElementById('show-listening').checked = profile.show_listening || false;

        // Update avatar preview
        const avatar = document.querySelector('.current-avatar');
        if (avatar) {
            avatar.style.backgroundImage = `url('${profile.avatar_url || 'https://juywatmqwykgdjfqexho.supabase.co/storage/v1/object/public/images/system/default%20user.png'}')`;
        }
    }

    setupEventListeners() {
        // Handle account form submit
        const accountForm = document.getElementById('account-form');
        accountForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = accountForm.querySelector('button[type="submit"]');
            submitBtn.disabled = true;

            try {
                const updates = {
                    username: accountForm.username.value,
                    display_name: accountForm.display_name.value,
                };

                // Handle avatar upload
                const avatarFile = accountForm.avatar.files[0];
                if (avatarFile) {
                    const avatarUrl = await uploadImage(avatarFile, 'avatars');
                    updates.avatar_url = avatarUrl;
                }

                const { error } = await supabase
                    .from('profiles')
                    .update(updates);

                if (error) throw error;
                notifications.show('Account settings updated', 'success');

            } catch (error) {
                console.error('Failed to update account:', error);
                notifications.show('Failed to update account: ' + error.message, 'error');
            } finally {
                submitBtn.disabled = false;
            }
        });

        // Handle privacy form submit
        const privacyForm = document.getElementById('privacy-form');
        privacyForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = privacyForm.querySelector('button[type="submit"]');
            submitBtn.disabled = true;

            try {
                const { error } = await supabase
                    .from('profiles')
                    .update({
                        public_profile: privacyForm.public_profile.checked,
                        show_listening: privacyForm.show_listening.checked
                    });

                if (error) throw error;
                notifications.show('Privacy settings updated', 'success');

            } catch (error) {
                console.error('Failed to update privacy settings:', error);
                notifications.show('Failed to update privacy settings', 'error');
            } finally {
                submitBtn.disabled = false;
            }
        });

        // Handle avatar change button
        const changeAvatarBtn = document.querySelector('.change-avatar-btn');
        const avatarInput = document.getElementById('avatar');
        changeAvatarBtn?.addEventListener('click', () => {
            avatarInput?.click();
        });

        // Preview avatar image
        avatarInput?.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                const avatar = document.querySelector('.current-avatar');
                if (avatar) {
                    avatar.style.backgroundImage = `url('${e.target.result}')`;
                }
            };
            reader.readAsDataURL(file);
        });

        // Handle account deletion
        const deleteBtn = document.querySelector('.delete-account-btn');
        deleteBtn?.addEventListener('click', async () => {
            if (!confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
                return;
            }

            try {
                const { error } = await supabase.rpc('delete_user');
                if (error) throw error;

                await supabase.auth.signOut();
                window.location.href = getPagePath('/');
                
            } catch (error) {
                console.error('Failed to delete account:', error);
                notifications.show('Failed to delete account', 'error');
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new SettingsPage();
});
