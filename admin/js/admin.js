import { supabase } from '../../js/supabase.js';
import { getDashboardStats } from './stats.js';

class AdminUI {
    constructor() {
        this.initialized = false;
        this.init();
    }

    async init() {
        if (this.initialized) return;
        
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                console.error('No session found');
                setTimeout(() => window.location.href = '/auth/login.html', 2000);
                return;
            }

            // Single admin check during initialization
            const { data: profile, error } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', session.user.id)
                .single();

            if (error) {
                console.error('Error fetching profile:', error);
                alert('Error checking admin status: ' + error.message);
                return;
            }

            if (profile?.role !== 'admin') {
                console.error('Not an admin:', profile);
                alert('Access denied. Admin privileges required.');
                setTimeout(() => window.location.href = '../index.html', 2000);
                return;
            }

            // Store admin status and user info
            this.isAdmin = true;
            this.userId = session.user.id;
            this.initialized = true;

            // Setup listeners and load data
            this.setupEventListeners();
            this.loadPageData();

            // Add auth state change listener
            supabase.auth.onAuthStateChange((event, session) => {
                if (event === 'SIGNED_OUT' || !session) {
                    window.location.href = '/auth/login.html';
                }
            });

        } catch (error) {
            console.error('Admin initialization failed:', error);
            alert('Error: ' + error.message);
        }
    }

    setupEventListeners() {
        // Setup logout button
        const logoutBtn = document.querySelector('.admin-header-actions .admin-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.handleLogout());
        }

        // Setup action buttons with auth check
        document.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleAction(e));
        });
    }

    async handleLogout() {
        try {
            await supabase.auth.signOut();
            window.location.href = '/auth/login.html';
        } catch (error) {
            console.error('Logout failed:', error);
        }
    }

    async loadPageData() {
        const currentPage = window.location.pathname.split('/').pop();
        
        try {
            switch(currentPage) {
                case 'index.html':
                    await this.loadDashboard();
                    break;
                case 'artists.html':
                    await this.loadArtists();
                    break;
                case 'albums.html':
                    await this.loadAlbums();
                    break;
                case 'songs.html':
                    await this.loadSongs();
                    break;
                case 'playlists.html':
                    await this.loadPlaylists();
                    break;
            }
        } catch (error) {
            console.error('Error loading data:', error);
            alert('Failed to load data');
        }
    }

    async loadDashboard() {
        const stats = await getDashboardStats();
        Object.entries(stats).forEach(([key, value]) => {
            const statElement = document.querySelector(`[data-stat="${key}"]`);
            if (statElement) {
                statElement.textContent = value;
            }
        });
    }

    async loadArtists() {
        const { data: artists, error } = await supabase
            .from('artists')
            .select('*');
        if (error) throw error;
        
        const container = document.querySelector('.admin-grid');
        if (!container) return;
        
        container.innerHTML = artists.map(artist => `
            <div class="admin-artist-card">
                <div class="admin-artist-image" style="background-image: url('${artist.image_url || ''}')"></div>
                <div class="admin-artist-info">
                    <h3>${artist.name}</h3>
                    <p>Genre: ${(artist.genres || []).join(', ')}</p>
                    <p>Status: ${artist.status}</p>
                </div>
                <div class="admin-actions">
                    <button class="admin-btn" data-action="edit" data-id="${artist.id}">Edit</button>
                    <button class="admin-btn" data-action="delete" data-id="${artist.id}">Delete</button>
                </div>
            </div>
        `).join('');
    }

    async loadAlbums() {
        const { data: albums, error } = await supabase
            .from('albums')
            .select('*, artists(name)');
        if (error) throw error;

        const tbody = document.querySelector('.admin-table tbody');
        if (!tbody) return;

        tbody.innerHTML = albums.map(album => `
            <tr>
                <td><div class="admin-album-cover" style="background-image: url('${album.cover_url || ''}')"></div></td>
                <td>${album.title}</td>
                <td>${album.artists?.name || 'Unknown'}</td>
                <td>${album.release_date || 'N/A'}</td>
                <td>-</td>
                <td>${album.status}</td>
                <td class="admin-actions">
                    <button class="admin-btn" data-action="edit" data-id="${album.id}">Edit</button>
                    <button class="admin-btn" data-action="delete" data-id="${album.id}">Delete</button>
                </td>
            </tr>
        `).join('');
    }

    async loadSongs() {
        const { data: songs, error } = await supabase
            .from('songs')
            .select('*, artists(name), albums(title)');
        if (error) throw error;

        const tbody = document.querySelector('.admin-table tbody');
        if (!tbody) return;

        tbody.innerHTML = songs.map(song => `
            <tr>
                <td>${song.title}</td>
                <td>${song.artists?.name || 'Unknown'}</td>
                <td>${song.albums?.title || 'N/A'}</td>
                <td>${this.formatDuration(song.duration)}</td>
                <td class="admin-actions">
                    <button class="admin-btn" data-action="edit" data-id="${song.id}">Edit</button>
                    <button class="admin-btn" data-action="delete" data-id="${song.id}">Delete</button>
                </td>
            </tr>
        `).join('');
    }

    async loadPlaylists() {
        const { data: playlists, error } = await supabase
            .from('playlists')
            .select('*, profiles(username)');
        if (error) throw error;

        const tbody = document.querySelector('.admin-table tbody');
        if (!tbody) return;

        tbody.innerHTML = playlists.map(playlist => `
            <tr>
                <td>${playlist.name}</td>
                <td>-</td>
                <td>${playlist.profiles?.username || 'System'}</td>
                <td>${playlist.status}</td>
                <td class="admin-actions">
                    <button class="admin-btn" data-action="edit" data-id="${playlist.id}">Edit</button>
                    <button class="admin-btn" data-action="delete" data-id="${playlist.id}">Delete</button>
                </td>
            </tr>
        `).join('');
    }

    async handleAction(e) {
        const action = e.target.dataset.action;
        const type = e.target.dataset.type;
        const id = e.target.dataset.id;

        try {
            switch(action) {
                case 'create':
                    await this.showCreateForm(type);
                    break;
                case 'edit':
                    await this.showEditForm(type, id);
                    break;
                case 'delete':
                    if (confirm('Are you sure you want to delete this item?')) {
                        await this.deleteItem(type, id);
                        e.target.closest('tr, .admin-card')?.remove();
                    }
                    break;
            }
        } catch (error) {
            console.error('Action failed:', error);
            alert('Operation failed: ' + error.message);
        }
    }

    async showCreateForm(type) {
        const fields = this.getFormFields(type);
        const formHtml = `
            <div class="admin-modal">
                <div class="admin-form">
                    <h2>Add New ${type.charAt(0).toUpperCase() + type.slice(1)}</h2>
                    <form id="create-${type}-form">
                        ${fields.map(field => `
                            <div class="admin-form-group">
                                <label for="${field.name}">${field.label}</label>
                                <input type="${field.type}" id="${field.name}" name="${field.name}" required>
                            </div>
                        `).join('')}
                        <div class="admin-form-actions">
                            <button type="submit" class="admin-btn">Save</button>
                            <button type="button" class="admin-btn" onclick="this.closest('.admin-modal').remove()">Cancel</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', formHtml);
        const form = document.getElementById(`create-${type}-form`);
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = Object.fromEntries(new FormData(form));
            await this.createItem(type, formData);
            e.target.closest('.admin-modal').remove();
            this.loadPageData(); // Refresh the page data
        });
    }

    async showEditForm(type, id) {
        const item = await this.getItem(type, id);
        const fields = this.getFormFields(type);
        const formHtml = `
            <div class="admin-modal">
                <div class="admin-form">
                    <h2>Edit ${type.charAt(0).toUpperCase() + type.slice(1)}</h2>
                    <form id="edit-${type}-form">
                        ${fields.map(field => `
                            <div class="admin-form-group">
                                <label for="${field.name}">${field.label}</label>
                                <input type="${field.type}" id="${field.name}" name="${field.name}" 
                                    value="${item[field.name] || ''}" required>
                            </div>
                        `).join('')}
                        <div class="admin-form-actions">
                            <button type="submit" class="admin-btn">Update</button>
                            <button type="button" class="admin-btn" onclick="this.closest('.admin-modal').remove()">Cancel</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', formHtml);
        const form = document.getElementById(`edit-${type}-form`);
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = Object.fromEntries(new FormData(form));
            await this.updateItem(type, id, formData);
            e.target.closest('.admin-modal').remove();
            this.loadPageData(); // Refresh the page data
        });
    }

    getFormFields(type) {
        const fields = {
            artist: [
                { name: 'name', label: 'Artist Name', type: 'text' },
                { name: 'bio', label: 'Biography', type: 'text' },
                { name: 'image_url', label: 'Image URL', type: 'url' },
                { name: 'genres', label: 'Genres', type: 'text' }
            ],
            album: [
                { name: 'title', label: 'Album Title', type: 'text' },
                { name: 'artist_id', label: 'Artist', type: 'text' },
                { name: 'cover_url', label: 'Cover URL', type: 'url' },
                { name: 'release_date', label: 'Release Date', type: 'date' }
            ],
            song: [
                { name: 'title', label: 'Song Title', type: 'text' },
                { name: 'artist_id', label: 'Artist', type: 'text' },
                { name: 'album_id', label: 'Album', type: 'text' },
                { name: 'duration', label: 'Duration', type: 'text' },
                { name: 'audio_url', label: 'Audio URL', type: 'url' }
            ],
            playlist: [
                { name: 'name', label: 'Playlist Name', type: 'text' },
                { name: 'description', label: 'Description', type: 'text' },
                { name: 'cover_url', label: 'Cover URL', type: 'url' }
            ]
        };
        return fields[type] || [];
    }

    async getItem(type, id) {
        const { data, error } = await supabase
            .from(type + 's')
            .select('*')
            .eq('id', id)
            .single();
        if (error) throw error;
        return data;
    }

    async createItem(type, data) {
        const { error } = await supabase
            .from(type + 's')
            .insert([data]);
        if (error) throw error;
    }

    async updateItem(type, id, data) {
        const { error } = await supabase
            .from(type + 's')
            .update(data)
            .eq('id', id);
        if (error) throw error;
    }

    async deleteItem(type, id) {
        const { error } = await supabase
            .from(type + 's')
            .delete()
            .eq('id', id);
        if (error) throw error;
    }

    // Helper function for formatting duration
    formatDuration(interval) {
        try {
            const match = interval.match(/(\d+):(\d+):(\d+)/);
            if (match) {
                const [_, hours, minutes, seconds] = match;
                return hours === '00' ? `${minutes}:${seconds}` : `${hours}:${minutes}:${seconds}`;
            }
            return interval;
        } catch {
            return '0:00';
        }
    }

    // Add more methods for CRUD operations...
}

// Initialize admin UI only once
let adminUI = null;
document.addEventListener('DOMContentLoaded', () => {
    if (!adminUI) {
        adminUI = new AdminUI();
    }
});
