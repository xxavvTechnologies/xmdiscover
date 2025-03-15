import { supabase, getPagePath } from '../supabase.js';
import { uploadImage } from '../storage.js';

class ProfilePage {
    constructor() {
        this.profileId = new URLSearchParams(window.location.search).get('id');
        this.init();
    }

    async init() {
        try {
            // If no profile ID is provided, get current user's profile
            if (!this.profileId) {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) {
                    window.location.href = getPagePath('/auth/login');
                    return;
                }
                this.profileId = session.user.id;
            }

            await this.loadProfile();

        } catch (error) {
            console.error('Failed to initialize profile page:', error);
        }
    }

    async loadProfile() {
        try {
            const { data: profile, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', this.profileId)
                .single();

            if (error) throw error;
            if (!profile) {
                alert('Profile not found');
                window.location.href = getPagePath('/discover');
                return;
            }

            await this.updateUI(profile);
            await Promise.all([
                this.loadUserPlaylists(profile.id),
                this.loadLikedSongs(profile.id)
            ]);

        } catch (error) {
            console.error('Failed to load profile:', error);
        }
    }

    async updateUI(profile) {  // Make this async
        document.title = `${profile.display_name || profile.username} - xM DiScover`;
        
        const avatar = document.querySelector('.profile-avatar');
        if (avatar) {
            avatar.style.backgroundImage = `url('${profile.avatar_url || 'https://juywatmqwykgdjfqexho.supabase.co/storage/v1/object/public/images/system/default%20user.png'}')`;
        }

        document.querySelector('.profile-name').textContent = profile.display_name || profile.username;
        document.querySelector('.profile-username').textContent = `@${profile.username}`;

        // Add edit button if own profile - fixed async/await usage
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.id === this.profileId) {
            const header = document.querySelector('.profile-info');
            header.insertAdjacentHTML('beforeend', `
                <button class="edit-profile-btn">Edit Profile</button>
            `);
            this.setupEditProfile();
        }
    }

    async loadUserPlaylists(userId) {
        const { data: playlists } = await supabase
            .from('playlists')
            .select('*')
            .eq('creator_id', userId)
            .eq('is_public', true)
            .order('created_at', { ascending: false });

        const container = document.querySelector('.playlist-grid');
        if (container) {
            if (!playlists?.length) {
                container.innerHTML = '<p>No public playlists</p>';
                return;
            }

            container.innerHTML = playlists.map(playlist => `
                <div class="playlist-card" onclick="window.location.href='${getPagePath('/pages/playlist')}?id=${playlist.id}'">
                    <div class="playlist-img" style="background-image: url('${playlist.cover_url}')"></div>
                    <h3>${playlist.name}</h3>
                    <p>${playlist.description || ''}</p>
                </div>
            `).join('');
        }
    }

    async loadLikedSongs(userId) {
        // Only show likes section on own profile
        const { data: { session } } = await supabase.auth.getSession();
        const isOwnProfile = userId === session?.user?.id;
        
        const likedSection = document.querySelector('.liked-songs');
        if (!isOwnProfile) {
            likedSection.remove();
            return;
        }

        const { data: likes, error } = await supabase
            .from('likes')
            .select(`
                song_id,
                created_at,
                song:song_id (
                    id,
                    title,
                    duration,
                    cover_url,
                    artists (
                        name
                    )
                )
            `)
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(10);

        if (error) {
            console.error('Error loading likes:', error);
            likedSection.remove();
            return;
        }

        const container = document.querySelector('.track-list');
        if (container) {
            if (!likes?.length) {
                container.innerHTML = '<p>No liked songs yet</p>';
                return;
            }

            container.innerHTML = likes.map((like, index) => `
                <div class="track-item" data-track-id="${like.song.id}">
                    <span class="track-number">${index + 1}</span>
                    <div class="track-info">
                        <h4>${like.song.title}</h4>
                        <p>${like.song.artists.name}</p>
                    </div>
                    <span class="track-duration">${like.song.duration}</span>
                </div>
            `).join('');
        }
    }

    setupEditProfile() {
        const editBtn = document.querySelector('.edit-profile-btn');
        editBtn?.addEventListener('click', () => {
            const modal = document.createElement('div');
            modal.className = 'edit-profile-modal';
            modal.innerHTML = `
                <div class="modal-content">
                    <h2>Edit Profile</h2>
                    <form id="edit-profile-form">
                        <div class="form-group">
                            <label for="display_name">Display Name</label>
                            <input type="text" id="display_name" name="display_name" value="${document.querySelector('.profile-name').textContent}">
                        </div>
                        <div class="form-group">
                            <label for="avatar">Profile Picture</label>
                            <input type="file" id="avatar" name="avatar" accept="image/*">
                        </div>
                        <div class="form-actions">
                            <button type="submit" class="save-btn">Save Changes</button>
                            <button type="button" class="cancel-btn">Cancel</button>
                        </div>
                    </form>
                </div>
            `;

            document.body.appendChild(modal);
            this.setupEditForm(modal);
        });
    }

    setupEditForm(modal) {
        const form = modal.querySelector('form');
        const cancelBtn = modal.querySelector('.cancel-btn');

        cancelBtn.addEventListener('click', () => {
            modal.remove();
        });

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = form.querySelector('.save-btn');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Saving...';

            try {
                const updates = {
                    display_name: form.display_name.value,
                };

                const avatarFile = form.avatar.files[0];
                if (avatarFile) {
                    const avatarUrl = await uploadImage(avatarFile, 'avatars');
                    updates.avatar_url = avatarUrl;
                }

                const { error } = await supabase
                    .from('profiles')
                    .update(updates)
                    .eq('id', this.profileId);

                if (error) throw error;
                window.location.reload();

            } catch (error) {
                console.error('Failed to update profile:', error);
                alert('Failed to update profile');
                submitBtn.disabled = false;
                submitBtn.textContent = 'Save Changes';
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new ProfilePage();
});
