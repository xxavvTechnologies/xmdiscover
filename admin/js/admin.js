import { supabase } from '../../js/supabase.js';
import { getDashboardStats } from './stats.js';
import { uploadAudio, uploadImage } from '../../js/storage.js';
import { notifications } from '../../js/services/notifications.js';

class AdminUI {
    constructor() {
        this.isInitialized = false;
        this.supabase = supabase;
        this.init();

        // Add event listener for popstate to handle browser navigation
        window.addEventListener('popstate', () => {
            this.loadPageData();
        });
    }

    async init() {
        if (this.isInitialized) return;

        try {
            // Single auth check at startup
            const { data: { session } } = await this.supabase.auth.getSession();
            if (!session) {
                window.location.href = '/auth/login';
                return;
            }

            // Check if we're on an admin page
            const isAdminPage = window.location.pathname.includes('/admin/');
            if (!isAdminPage) {
                window.location.href = '/admin/';
                return;
            }

            // Verify admin status once
            const { data: profile } = await this.supabase
                .from('profiles')
                .select('role, username, display_name')
                .eq('id', session.user.id)
                .single();

            if (!profile || profile.role !== 'admin') {
                window.location.href = '../index.html';
                return;
            }

            // Update admin username in UI
            const adminUserSpan = document.querySelector('[data-admin-user]');
            if (adminUserSpan) {
                adminUserSpan.textContent = profile.display_name || profile.username;
            }

            // Store auth info
            this.session = session;
            this.userId = session.user.id;
            this.isInitialized = true;

            // Setup refresh token every 30 minutes
            setInterval(() => {
                this.refreshSession();
            }, 30 * 60 * 1000);

            // Initialize UI
            this.setupEventListeners();
            this.loadPageData();

        } catch (error) {
            console.error('Admin initialization failed:', error);
        }
    }

    async refreshSession() {
        try {
            const { data: { session } } = await this.supabase.auth.refreshSession();
            if (session) {
                this.session = session;
            }
        } catch (error) {
            console.error('Session refresh failed:', error);
        }
    }

    setupEventListeners() {
        // Logout button - update selector to use data attribute
        const logoutBtn = document.querySelector('[data-action="logout"]');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.handleLogout());
        }

        // Action buttons (create, edit, delete)
        document.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleAction(e));
        });
    }

    async handleLogout() {
        await this.supabase.auth.signOut();
        // Redirect to login page while preserving extension handling
        window.location.href = '/auth/login';
    }

    async handleAction(e) {
        const action = e.target.dataset.action;
        const type = e.target.dataset.type || e.target.closest('[data-type]')?.dataset.type || 
                    this.getTypeFromPath(window.location.pathname);
        const id = e.target.dataset.id;

        if (!action) return;

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
                        if (!type || !id) {
                            throw new Error('Missing type or ID for deletion');
                        }
                        await this.deleteItem(type, id);
                        const element = e.target.closest('tr, .admin-card');
                        if (element) {
                            // Add fade out animation
                            element.style.transition = 'opacity 0.3s ease-out';
                            element.style.opacity = '0';
                            setTimeout(() => element.remove(), 300);
                        }
                        notifications.show('Item deleted successfully', 'success');
                    }
                    break;
                case 'refresh':
                    await this.refreshPodcast(id);
                    await this.loadPodcasts();
                    break;
            }
        } catch (error) {
            console.error('Action failed:', error);
            notifications.show(error.message, 'error');
        }
    }

    getTypeFromPath(path) {
        // Remove .html extension if present
        const cleanPath = path.replace(/\.html$/, '');
        // Get the last segment of the path
        const page = cleanPath.split('/').pop();
        // Convert plural to singular for proper API calls
        const typeMap = {
            'albums': 'album',
            'artists': 'artist',
            'songs': 'song',
            'playlists': 'playlist',
            'podcasts': 'podcast',
            'genres': 'genre',
            'moods': 'mood',
            'charts': 'chart',
            'featured': 'featured',
            'ads': 'ad'
        };
        return typeMap[page] || page;
    }

    async deleteItem(type, id) {
        // First check for any dependencies
        const dependencyChecks = {
            artist: async () => {
                const { data: albums } = await this.supabase
                    .from('albums')
                    .select('id')
                    .eq('artist_id', id);
                if (albums?.length > 0) {
                    throw new Error('Cannot delete artist with existing albums');
                }
            },
            album: async () => {
                const { data: songs } = await this.supabase
                    .from('songs')
                    .select('id')
                    .eq('album_id', id);
                if (songs?.length > 0) {
                    throw new Error('Cannot delete album with existing songs');
                }
            }
        };

        // Run dependency check if exists for type
        if (dependencyChecks[type]) {
            await dependencyChecks[type]();
        }

        // Handle special deletion cases
        switch (type) {
            case 'playlist':
                // Delete playlist songs first
                await this.supabase
                    .from('playlist_songs')
                    .delete()
                    .eq('playlist_id', id);
                break;
            case 'podcast':
                // Delete podcast episodes first
                await this.supabase
                    .from('podcast_episodes')
                    .delete()
                    .eq('podcast_id', id);
                break;
        }

        // Delete the item itself
        const { error } = await this.supabase
            .from(`${type}s`)
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Delete error:', error);
            throw new Error(`Failed to delete ${type}: ${error.message}`);
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
                case 'podcasts.html':
                    await this.loadPodcasts();
                    break;
                case 'genres.html':
                    await this.loadGenres();
                    break;
                case 'moods.html':
                    await this.loadMoods();
                    break;
                case 'charts.html':
                    await this.loadCharts();
                    break;
                case 'ads.html':
                    await this.loadAds();
                    break;
            }
        } catch (error) {
            console.error('Failed to load page data:', error);
            alert('Failed to load data. Please refresh the page.');
        }
    }

    // CRUD Operations
    async createItem(type, data) {
        const { error } = await this.supabase
            .from(type + 's')
            .insert([data]);
        if (error) throw error;
    }

    async updateItem(type, id, data) {
        const { error } = await this.supabase
            .from(type + 's')
            .update(data)
            .eq('id', id);
        if (error) throw error;
    }

    async getItem(type, id) {
        const { data, error } = await this.supabase
            .from(type + 's')
            .select('*')
            .eq('id', id)
            .single();
        if (error) throw error;
        return data;
    }

    // Load page specific data
    async loadDashboard() {
        const stats = await getDashboardStats();
        Object.entries(stats).forEach(([key, value]) => {
            const element = document.querySelector(`[data-stat="${key}"]`);
            if (element) element.textContent = value;
        });
    }

    async loadArtists() {
        const { data: artists, error } = await this.supabase
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
        const { data: albums, error } = await this.supabase
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
                <td>${album.status || 'Draft'}</td>
                <td class="admin-actions">
                    <button class="admin-btn" data-action="edit" data-id="${album.id}">Edit</button>
                    <button class="admin-btn" data-action="delete" data-id="${album.id}">Delete</button>
                </td>
            </tr>
        `).join('');
    }

    async loadSongs() {
        const { data: songs, error } = await this.supabase
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
        const { data: playlists, error } = await this.supabase
            .from('playlists')
            .select('*, profiles(username)');
        if (error) throw error;

        const tbody = document.querySelector('.admin-table tbody');
        if (!tbody) return;

        tbody.innerHTML = playlists.map(playlist => `
            <tr>
                <td>${playlist.name}</td>
                <td>${playlist.profiles?.username || 'System'}</td>
                <td>${playlist.status || 'Draft'}</td>
                <td class="admin-actions">
                    <button class="admin-btn" data-action="edit" data-id="${playlist.id}">Edit</button>
                    <button class="admin-btn" data-action="delete" data-id="${playlist.id}">Delete</button>
                </td>
            </tr>
        `).join('');
    }

    async loadPodcasts() {
        const { data: podcasts, error } = await this.supabase
            .from('podcasts')
            .select('*, podcast_episodes(count)');
        if (error) throw error;

        const tbody = document.querySelector('.admin-table tbody');
        if (!tbody) return;
        
        tbody.innerHTML = podcasts.map(podcast => `
            <tr>
                <td><div class="admin-podcast-cover" style="background-image: url('${podcast.image_url || ''}');"></div></td>
                <td>${podcast.title || 'Loading...'}</td>
                <td>${podcast.podcast_episodes?.[0]?.count || 0}</td>
                <td>${podcast.last_fetched ? new Date(podcast.last_fetched).toLocaleString() : 'Never'}</td>
                <td>${podcast.status}</td>
                <td class="admin-actions">
                    <button class="admin-btn" data-action="refresh" data-id="${podcast.id}">Refresh</button>
                    <button class="admin-btn" data-action="edit" data-id="${podcast.id}">Edit</button>
                    <button class="admin-btn" data-action="delete" data-id="${podcast.id}">Delete</button>
                </td>
            </tr>
        `).join('');
    }

    async loadMoods() {
        const { data: moods } = await this.supabase
            .from('moods')
            .select('*, mood_songs(count)')
            .order('name');
        
        const container = document.querySelector('.admin-grid');
        if (!container) return;
    
        container.innerHTML = moods?.map(mood => `
            <div class="admin-card">
                <div class="card-image" style="background-color: ${mood.color || '#8c52ff'}">
                    <img src="${mood.cover_url || ''}" alt="${mood.name}">
                </div>
                <div class="card-content">
                    <h3>${mood.name}</h3>
                    <p>${mood.description || ''}</p>
                    <span class="count">${mood.mood_songs?.[0]?.count || 0} songs</span>
                </div>
                <div class="card-actions">
                    <button class="admin-btn" data-action="edit" data-id="${mood.id}">Edit</button>
                    <button class="admin-btn" data-action="delete" data-id="${mood.id}">Delete</button>
                </div>
            </div>
        `).join('') || '<p>No moods found</p>';
    }
    
    async loadCharts() {
        const { data: charts } = await this.supabase
            .from('charts')
            .select(`
                *,
                chart_entries(count),
                chart_type:type(name)
            `)
            .order('updated_at', { ascending: false });
        
        const container = document.querySelector('.admin-grid');
        if (!container) return;
    
        container.innerHTML = charts?.map(chart => `
            <div class="admin-card">
                <div class="card-image">
                    <img src="${chart.cover_url || ''}" alt="${chart.name}">
                </div>
                <div class="card-content">
                    <h3>${chart.name}</h3>
                    <p>${chart.description || ''}</p>
                    <span class="badge">${chart.chart_type?.name || chart.type}</span>
                    <span class="count">${chart.chart_entries?.[0]?.count || 0} tracks</span>
                </div>
                <div class="card-actions">
                    <button class="admin-btn" data-action="edit" data-id="${chart.id}">Edit</button>
                    <button class="admin-btn" data-action="delete" data-id="${chart.id}">Delete</button>
                </div>
            </div>
        `).join('') || '<p>No charts found</p>';
    }

    async loadGenres() {
        const { data: genres } = await this.supabase
            .from('genres')
            .select('*, parent_genre:parent_id(name)')
            .order('name');
    
        const container = document.querySelector('.admin-grid');
        if (!container) return;
    
        container.innerHTML = genres?.map(genre => `
            <div class="admin-card">
                <div class="card-image">
                    <img src="${genre.image_url || ''}" alt="${genre.name}">
                </div>
                <div class="card-content">
                    <h3>${genre.name}</h3>
                    <p>${genre.description || ''}</p>
                    ${genre.parent_genre ? `<span class="badge">Sub-genre of ${genre.parent_genre.name}</span>` : ''}
                </div>
                <div class="card-actions">
                    <button class="admin-btn" data-action="edit" data-id="${genre.id}">Edit</button>
                    <button class="admin-btn" data-action="delete" data-id="${genre.id}">Delete</button>
                </div>
            </div>
        `).join('') || '<p>No genres found</p>';
    }

    async loadAds() {
        const { data: ads } = await this.supabase
            .from('ads')
            .select('*')
            .order('created_at', { ascending: false });
        
        const tbody = document.querySelector('.admin-table tbody');
        if (!tbody) return;

        tbody.innerHTML = ads?.map(ad => {
            const stats = {
                plays: ad.play_count || 0,
                clicks: ad.click_count || 0,
                ctr: ad.play_count ? ((ad.click_count / ad.play_count) * 100).toFixed(1) : '0.0',
                impressions: ad.impressions || 0
            };

            const budget = {
                daily: ad.daily_budget ? `$${ad.daily_budget}` : 'N/A',
                total: ad.total_budget ? `$${ad.total_budget}` : 'N/A',
            };

            return `
                <tr>
                    <td>
                        <div class="ad-title-cell">
                            <span>${ad.title}</span>
                            ${ad.click_url ? `<i class="ri-external-link-line"></i>` : ''}
                        </div>
                    </td>
                    <td>${ad.advertiser}</td>
                    <td>
                        <div class="ad-stats">
                            <span title="Plays">${stats.plays} plays</span>
                            <span title="Clicks">${stats.clicks} clicks</span>
                            <span title="Click-through rate">${stats.ctr}% CTR</span>
                            <span title="Impressions">${stats.impressions} views</span>
                        </div>
                    </td>
                    <td>
                        <div class="ad-budget">
                            <span>Daily: ${budget.daily}</span>
                            <span>Total: ${budget.total}</span>
                        </div>
                    </td>
                    <td>
                        <div class="ad-period">
                            <span>Start: ${ad.start_date ? new Date(ad.start_date).toLocaleDateString() : 'N/A'}</span>
                            <span>End: ${ad.end_date ? new Date(ad.end_date).toLocaleDateString() : 'Ongoing'}</span>
                        </div>
                    </td>
                    <td>
                        <span class="status-badge ${ad.status}">${ad.status}</span>
                    </td>
                    <td class="admin-actions">
                        <button class="admin-btn" data-action="edit" data-id="${ad.id}">Edit</button>
                        <button class="admin-btn" data-action="delete" data-id="${ad.id}">Delete</button>
                    </td>
                </tr>
            `;
        }).join('') || '<tr><td colspan="7">No ads found</td></tr>';
    }

    async loadArtistOptions() {
        const { data: artists } = await this.supabase
            .from('artists')
            .select('id, name')
            .order('name');
        
        return artists?.map(artist => ({
            value: artist.id,
            label: artist.name
        })) || [];
    }

    async loadGenreOptions() {
        const { data: genres } = await this.supabase
            .from('genres')
            .select('id, name')
            .order('name');
        
        return genres?.map(genre => ({
            value: genre.id,
            label: genre.name
        })) || [];
    }

    getFormFields(type) {
        const fields = {
            artist: [
                { name: 'name', label: 'Artist Name', type: 'text', required: true },
                { name: 'bio', label: 'Biography', type: 'textarea', required: false },
                { name: 'genres', label: 'Genres (comma-separated)', type: 'text', required: false },
                { name: 'image', label: 'Artist Image', type: 'file', accept: 'image/*', required: false },
                { name: 'status', label: 'Status', type: 'select', required: true, options: [
                    { value: 'published', label: 'Published' },
                    { value: 'draft', label: 'Draft' },
                    { value: 'archived', label: 'Archived' }
                ]}
            ],
            album: [
                { name: 'title', label: 'Album Title', type: 'text', required: true },
                { name: 'artist_id', label: 'Artist', type: 'select', required: true, 
                  optionsLoader: () => this.loadArtistOptions() },
                { name: 'release_date', label: 'Release Date', type: 'date', required: true },
                { name: 'cover', label: 'Album Cover', type: 'file', accept: 'image/*' },
                { name: 'songs', label: 'Album Songs', type: 'song-selector', required: true },
                { name: 'status', label: 'Status', type: 'select', required: true, options: [
                    { value: 'published', label: 'Published' },
                    { value: 'draft', label: 'Draft' }
                ]}
            ],
            song: [
                { name: 'title', label: 'Song Title', type: 'text', required: true, maxLength: 100 },
                { name: 'artist_id', label: 'Artist', type: 'select', required: true,
                  optionsLoader: () => this.loadArtistOptions() },
                { name: 'album_id', label: 'Album', type: 'select', required: false,
                  dependsOn: 'artist_id',
                  optionsLoader: async (artistId) => {
                    const { data: albums } = await this.supabase
                        .from('albums')
                        .select('id, title')
                        .eq('artist_id', artistId)
                        .order('title');
                    return albums?.map(album => ({
                        value: album.id,
                        label: album.title
                    })) || [];
                }},
                { name: 'track_number', label: 'Track Number', type: 'number', min: 1, required: false },
                { name: 'type', label: 'Release Type', type: 'select', required: true, options: [
                    { value: 'album_track', label: 'Album Track' },
                    { value: 'single', label: 'Single' }
                ]},
                { name: 'cover', label: 'Song Cover', type: 'file', accept: 'image/*', maxSize: 5242880 }, // 5MB limit
                { name: 'audio', label: 'Audio File (WAV, max 40MB)', type: 'file', 
                  accept: 'audio/wav,audio/x-wav', required: true, maxSize: 41943040 }, // 40MB limit
                { name: 'duration', label: 'Duration (mm:ss)', type: 'text', required: true, 
                  pattern: '^([0-5][0-9]):([0-5][0-9])$', placeholder: '03:45' },
                { name: 'status', label: 'Status', type: 'select', required: true, options: [
                    { value: 'published', label: 'Published' },
                    { value: 'draft', label: 'Draft' }
                ]}
            ],
            playlist: [
                {
                    name: 'name',
                    label: 'Playlist Name',
                    type: 'text',
                    required: true
                },
                {
                    name: 'description',
                    label: 'Description',
                    type: 'textarea'
                },
                {
                    name: 'cover',
                    label: 'Cover Image',
                    type: 'file',
                    accept: 'image/*',
                    description: 'Upload an image or use URL below'
                },
                {
                    name: 'cover_url',
                    label: 'Cover Image URL (optional)',
                    type: 'text',
                    placeholder: 'https://'
                },
                {
                    name: 'songs',
                    label: 'Songs',
                    type: 'song-selector',
                    required: true
                },
                {
                    name: 'featured',
                    label: 'Featured Playlist',
                    type: 'checkbox',
                    default: false
                },
                {
                    name: 'status',
                    label: 'Status',
                    type: 'select',
                    options: [
                        { value: 'published', label: 'Published' },
                        { value: 'draft', label: 'Draft' }
                    ],
                    default: 'published'
                }
            ],
            podcast: [
                { name: 'feed_url', label: 'RSS Feed URL', type: 'text', required: true },
                { name: 'status', label: 'Status', type: 'select', required: true, options: [
                    { value: 'published', label: 'Published' },
                    { value: 'draft', label: 'Draft' }
                ]}
            ],
            mood: [
                { name: 'name', label: 'Mood Name', type: 'text', required: true },
                { name: 'description', label: 'Description', type: 'textarea' },
                { name: 'cover', label: 'Cover Image', type: 'file', accept: 'image/*' },
                { name: 'color', label: 'Theme Color', type: 'color' },
                { name: 'songs', label: 'Songs', type: 'song-selector', required: true }
            ],

            genre: [
                { name: 'name', label: 'Genre Name', type: 'text', required: true },
                { name: 'description', label: 'Description', type: 'textarea' },
                { name: 'cover', label: 'Cover Image', type: 'file', accept: 'image/*' },
                { name: 'parent_id', label: 'Parent Genre', type: 'select',
                  optionsLoader: () => this.loadGenreOptions() }
            ],

            chart: [
                { name: 'name', label: 'Chart Name', type: 'text', required: true },
                { name: 'description', label: 'Description', type: 'textarea' },
                { name: 'type', label: 'Chart Type', type: 'select', required: true,
                  options: [
                    { value: 'daily', label: 'Daily Top' },
                    { value: 'weekly', label: 'Weekly Top' },
                    { value: 'trending', label: 'Trending' }
                  ]},
                { name: 'cover', label: 'Cover Image', type: 'file', accept: 'image/*' },
                { name: 'start_date', label: 'Start Date', type: 'date', required: true },
                { name: 'end_date', label: 'End Date', type: 'date' }
            ],

            featured: [
                { name: 'title', label: 'Feature Title', type: 'text', required: true },
                { name: 'description', label: 'Description', type: 'textarea' },
                { name: 'content_type', label: 'Content Type', type: 'select', required: true,
                  options: [
                    { value: 'playlist', label: 'Playlist' },
                    { value: 'album', label: 'Album' },
                    { value: 'artist', label: 'Artist' },
                    { value: 'podcast', label: 'Podcast' }
                  ]},
                { name: 'content_id', label: 'Content', type: 'select', required: true,
                  dependsOn: 'content_type',
                  optionsLoader: (type) => this.loadContentOptions(type) },
                { name: 'position', label: 'Display Position', type: 'number' },
                { name: 'start_date', label: 'Start Date', type: 'datetime-local' },
                { name: 'end_date', label: 'End Date', type: 'datetime-local' }
            ],

            ad: [
                { name: 'title', label: 'Ad Title', type: 'text', required: true, maxLength: 100 },
                { name: 'advertiser', label: 'Advertiser', type: 'text', required: true },
                { name: 'description', label: 'Description', type: 'textarea' },
                { name: 'audio', label: 'Audio File', type: 'file', 
                  accept: 'audio/*', required: true, maxSize: 5242880 }, // 5MB limit
                { name: 'duration', label: 'Duration (mm:ss)', type: 'text', required: true,
                  pattern: '^([0-5][0-9]):([0-5][0-9])$', placeholder: '00:30' },
                { name: 'click_url', label: 'Click URL', type: 'url', 
                  placeholder: 'https://' },
                { name: 'target_audience', label: 'Target Audience', type: 'tags',
                  placeholder: 'Add audience tags' },
                { name: 'regions', label: 'Target Regions', type: 'tags',
                  placeholder: 'Add region codes' },
                { name: 'frequency', label: 'Plays per Hour', type: 'number', 
                  min: 1, max: 12, default: 1 },
                { name: 'daily_budget', label: 'Daily Budget ($)', type: 'number',
                  min: 0, step: '0.01' },
                { name: 'total_budget', label: 'Total Budget ($)', type: 'number',
                  min: 0, step: '0.01' },
                { name: 'start_date', label: 'Start Date', type: 'datetime-local' },
                { name: 'end_date', label: 'End Date', type: 'datetime-local' },
                { name: 'status', label: 'Status', type: 'select', required: true,
                  options: [
                    { value: 'active', label: 'Active' },
                    { value: 'paused', label: 'Paused' },
                    { value: 'draft', label: 'Draft' }
                  ]}
            ]
        };
        return fields[type] || [];
    }

    async generateFormHtml(type, fields, item = null, isEdit = false) {
        const action = isEdit ? 'Edit' : 'Add New';
        const formId = isEdit ? `edit-${type}-form` : `create-${type}-form`;
        
        // Pre-load all dropdown options
        for (const field of fields) {
            if (field.type === 'select' && field.optionsLoader) {
                field.options = await field.optionsLoader(item?.[field.dependsOn]);
            }
        }
        
        const formHtml = `
            <div class="admin-modal">
                <div class="admin-form">
                    <h2>${action} ${type.charAt(0).toUpperCase() + type.slice(1)}</h2>
                    <form id="${formId}">
                        ${fields.map(field => {
                            if (field.type === 'select') {
                                return `
                                    <div class="admin-form-group">
                                        <label for="${field.name}">${field.label}</label>
                                        <select id="${field.name}" name="${field.name}" 
                                                ${field.required ? 'required' : ''}
                                                ${field.dependsOn ? `data-depends-on="${field.dependsOn}"` : ''}>
                                            <option value="">Select ${field.label}</option>
                                            ${field.options?.map(opt => `
                                                <option value="${opt.value}" 
                                                    ${item && item[field.name] === opt.value ? 'selected' : ''}>
                                                    ${opt.label}
                                                </option>
                                            `).join('') || ''}
                                        </select>
                                    </div>
                                `;
                            }
                            if (field.type === 'textarea') {
                                return `
                                    <div class="admin-form-group">
                                        <label for="${field.name}">${field.label}</label>
                                        <textarea id="${field.name}" name="${field.name}" ${field.required ? 'required' : ''}>
                                            ${item ? item[field.name] || '' : ''}
                                        </textarea>
                                    </div>
                                `;
                            }
                            return `
                                <div class="admin-form-group">
                                    <label for="${field.name}">${field.label}</label>
                                    <input type="${field.type}" 
                                           id="${field.name}" 
                                           name="${field.name}" 
                                           ${field.accept ? `accept="${field.accept}"` : ''}
                                           ${field.required ? 'required' : ''}
                                           value="${item && !field.type.includes('file') ? item[field.name] || '' : ''}">
                                </div>
                            `;
                        }).join('')}
                        <div class="admin-form-actions">
                            <button type="submit" class="admin-btn">Save</button>
                            <button type="button" class="admin-btn" onclick="this.closest('.admin-modal').remove()">Cancel</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        // Add dynamic handling for dependent dropdowns
        document.body.insertAdjacentHTML('beforeend', formHtml);
        const form = document.getElementById(formId);
        
        // Setup dependent dropdown handlers
        fields.forEach(field => {
            if (field.dependsOn) {
                const dependentSelect = form.querySelector(`[name="${field.name}"]`);
                const parentSelect = form.querySelector(`[name="${field.dependsOn}"]`);
                if (dependentSelect && parentSelect) {
                    parentSelect.addEventListener('change', async () => {
                        const parentValue = parentSelect.value;
                        if (parentValue) {
                            const options = await field.optionsLoader(parentValue);
                            dependentSelect.innerHTML = `
                                <option value="">Select ${field.label}</option>
                                ${options.map(opt => `
                                    <option value="${opt.value}">${opt.label}</option>
                                `).join('')}
                            `;
                            dependentSelect.disabled = false;
                        } else {
                            dependentSelect.innerHTML = `<option value="">Select ${field.label}</option>`;
                            dependentSelect.disabled = true;
                        }
                    });
                }
            }
        });

        // Add song selector component
        if (type === 'playlist' || type === 'album') {
            const songSelector = `
                <div class="song-selector">
                    <div class="song-search">
                        <input type="text" placeholder="Search songs..." class="song-search-input">
                    </div>
                    <div class="song-list"></div>
                    <div class="selected-songs"></div>
                    <input type="hidden" name="songs" id="selected-songs-input">
                </div>
            `;

            // Add song selector after form creation
            const songField = form.querySelector('[data-field="songs"]');
            if (songField) {
                songField.insertAdjacentHTML('afterend', songSelector);
                this.initializeSongSelector(form);
            }
        }

        return form;
    }

    async initializeSongSelector(form) {
        const searchInput = form.querySelector('.song-search-input');
        const songList = form.querySelector('.song-list');
        const selectedSongs = form.querySelector('.selected-songs');
        const selectedSongsInput = form.querySelector('#selected-songs-input');
        const selectedIds = new Set();

        const updateSelectedSongs = () => {
            selectedSongsInput.value = JSON.stringify(Array.from(selectedIds));
        };

        searchInput.addEventListener('input', async (e) => {
            const search = e.target.value.trim();
            if (search.length < 2) {
                songList.innerHTML = '';
                return;
            }

            const queryBuilder = this.supabase
                .from('songs')
                .select(`
                    id,
                    title,
                    duration,
                    artists (name),
                    albums (title)
                `)
                .ilike('title', `%${search}%`)
                .eq('status', 'published');

            // If we're in an album form, only show songs by the selected artist
            const artistSelect = form.querySelector('[name="artist_id"]');
            if (artistSelect && artistSelect.value) {
                queryBuilder.eq('artist_id', artistSelect.value);
            }

            const { data: songs } = await queryBuilder.limit(10);

            songList.innerHTML = songs?.map(song => `
                <div class="song-item" data-id="${song.id}">
                    <div class="song-item-info">
                        <span class="song-title">${song.title}</span>
                        <span class="song-info">${song.artists.name} ${song.albums?.title ? `- ${song.albums.title}` : ''}</span>
                    </div>
                    <span class="song-duration">${song.duration || ''}</span>
                </div>
            `).join('') || '';
        });

        // For albums, update song search when artist changes
        const artistSelect = form.querySelector('[name="artist_id"]');
        if (artistSelect) {
            artistSelect.addEventListener('change', () => {
                songList.innerHTML = '';
                searchInput.value = '';
                selectedIds.clear();
                selectedSongs.innerHTML = '';
                updateSelectedSongs();
            });
        }

        // Handle song selection
        songList.addEventListener('click', (e) => {
            const songItem = e.target.closest('.song-item');
            if (!songItem) return;

            const songId = songItem.dataset.id;
            const songTitle = songItem.querySelector('.song-title').textContent;
            const songInfo = songItem.querySelector('.song-info').textContent;

            if (!selectedIds.has(songId)) {
                selectedIds.add(songId);
                selectedSongs.insertAdjacentHTML('beforeend', `
                    <div class="selected-song" data-id="${songId}">
                        <span>${songTitle} - ${songInfo}</span>
                        <button type="button" class="remove-song">×</button>
                    </div>
                `);
                updateSelectedSongs();
            }

            searchInput.value = '';
            songList.innerHTML = '';
        });

        // Handle removing selected songs
        selectedSongs.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-song')) {
                const songItem = e.target.closest('.selected-song');
                selectedIds.delete(songItem.dataset.id);
                songItem.remove();
                updateSelectedSongs();
            }
        });
    }

    async showCreateForm(type) {
        const fields = this.getFormFields(type);
        const formHtml = await this.generateFormHtml(type, fields);
        
        document.body.insertAdjacentHTML('beforeend', formHtml);
        
        const form = document.getElementById(`create-${type}-form`);
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                const formData = new FormData(form);
                const processedData = await this.processFormData(formData, type);
                await this.createItem(type, processedData);
                e.target.closest('.admin-modal').remove();
                await this.loadPageData(); // Refresh the page data
            } catch (error) {
                console.error('Create failed:', error);
                alert('Failed to create item: ' + error.message);
            }
        });
    }

    async showEditForm(type, id) {
        const item = await this.getItem(type, id);
        const fields = this.getFormFields(type);
        const formHtml = await this.generateFormHtml(type, fields, item, true);
        
        document.body.insertAdjacentHTML('beforeend', formHtml);
        
        const form = document.getElementById(`edit-${type}-form`);
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                const formData = new FormData(form);
                const processedData = await this.processFormData(formData, type);
                await this.updateItem(type, id, processedData);
                e.target.closest('.admin-modal').remove();
                await this.loadPageData();
            } catch (error) {
                console.error('Update failed:', error);
                alert('Failed to update item: ' + error.message);
            }
        });
    }

    async processFormData(formData, type) {
        if (type === 'podcast') {
            try {
                const feed_url = formData.get('feed_url')?.trim();
                if (!feed_url) {
                    throw new Error('Feed URL is required');
                }

                // Create new podcast with upsert
                const { data: podcast, error: createError } = await this.supabase
                    .from('podcasts')
                    .upsert({
                        feed_url,
                        status: formData.get('status') || 'published',
                        title: 'Loading...',
                        description: 'Fetching podcast information...',
                        last_fetched: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    }, {
                        onConflict: 'feed_url',
                        ignoreDuplicates: false
                    })
                    .select()
                    .single();

                if (createError) throw createError;

                // Fetch metadata
                const { loadPodcastFeed } = await import('./podcasts.js');
                await loadPodcastFeed(feed_url, podcast.id);
                
                return podcast;
            } catch (error) {
                console.error('Podcast creation error:', error);
                throw error;
            }
        }

        if (type === 'album') {
            try {
                // Handle cover image upload
                const coverFile = formData.get('cover');
                let coverUrl = null;

                if (coverFile?.size > 0) {
                    coverUrl = await uploadImage(coverFile, 'albums');
                }

                // Get songs array
                let songIds = [];
                const songsInput = formData.get('songs');
                if (songsInput) {
                    try {
                        songIds = JSON.parse(songsInput);
                    } catch (e) {
                        console.warn('Invalid songs input:', songsInput);
                        throw new Error('Invalid song selection format');
                    }
                }

                // Create album
                const albumData = {
                    title: formData.get('title'),
                    artist_id: formData.get('artist_id'),
                    cover_url: coverUrl,
                    release_date: formData.get('release_date'),
                    status: 'published'
                };

                const { data: album, error } = await this.supabase
                    .from('albums')
                    .insert([albumData])
                    .select()
                    .single();

                if (error) throw error;

                // Update songs with album_id
                if (songIds.length > 0) {
                    const { error: updateError } = await this.supabase
                        .from('songs')
                        .update({ album_id: album.id })
                        .in('id', songIds);

                    if (updateError) throw updateError;
                }

                return album;
            } catch (error) {
                console.error('Album creation error:', error);
                throw error;
            }
        }

        if (type === 'playlist') {
            try {
                // Get the system account ID
                const { data: systemProfile } = await this.supabase
                    .from('profiles')
                    .select('id')
                    .eq('username', 'xmdiscover')
                    .single();

                if (!systemProfile) throw new Error('System account not found');

                // Handle cover image
                const coverFile = formData.get('cover');
                let coverUrl = formData.get('cover_url');

                if (coverFile?.size > 0) {
                    coverUrl = await uploadImage(coverFile, 'playlists');
                }

                // Get songs array - ensure it's properly formatted JSON
                let songIds = [];
                const songsInput = formData.get('songs');
                if (songsInput) {
                    try {
                        songIds = JSON.parse(songsInput);
                    } catch (e) {
                        console.warn('Invalid songs input:', songsInput);
                        throw new Error('Invalid song selection format');
                    }
                }

                if (!songIds.length) {
                    throw new Error('Please select at least one song');
                }

                // Create playlist first
                const playlistData = {
                    name: formData.get('name'),
                    description: formData.get('description'),
                    cover_url: coverUrl || 'https://d2zcpib8duehag.cloudfront.net/xmdiscover-default-playlist.png',
                    creator_id: systemProfile.id,
                    featured: formData.get('featured') === 'on',
                    status: formData.get('status') || 'published',
                    is_public: true
                };

                const { data: playlist, error } = await this.supabase
                    .from('playlists')
                    .insert([playlistData])
                    .select()
                    .single();

                if (error) throw error;

                // Then add songs
                const playlistSongs = songIds.map((songId, index) => ({
                    playlist_id: playlist.id,
                    song_id: songId,
                    position: index
                }));

                const { error: songError } = await this.supabase
                    .from('playlist_songs')
                    .insert(playlistSongs);

                if (songError) throw songError;

                return playlist;
            } catch (error) {
                console.error('Playlist creation error:', error);
                throw error;
            }
        }

        if (type === 'song') {
            try {
                // Validate file sizes
                const audioFile = formData.get('audio');
                const coverFile = formData.get('cover');
                
                if (audioFile?.size > 41943040) throw new Error('Audio file must be less than 40MB');
                if (coverFile?.size > 5242880) throw new Error('Cover image must be less than 5MB');

                // Handle file uploads first
                let audioUrl = null;
                let coverUrl = null;

                if (audioFile?.size > 0) {
                    audioUrl = await uploadAudio(audioFile, 'songs');
                }

                if (coverFile?.size > 0) {
                    coverUrl = await uploadImage(coverFile, 'songs');
                }

                // Validate duration format
                const duration = formData.get('duration');
                if (!/^([0-5][0-9]):([0-5][0-9])$/.test(duration)) {
                    throw new Error('Duration must be in mm:ss format (e.g. 03:45)');
                }

                const songData = {
                    title: formData.get('title')?.trim(),
                    artist_id: formData.get('artist_id'),
                    album_id: formData.get('album_id') || null,
                    track_number: parseInt(formData.get('track_number')) || null,
                    audio_url: audioUrl,
                    cover_url: coverUrl,
                    duration: `00:${duration}`,
                    type: formData.get('type'),
                    status: formData.get('status') || 'published'
                };

                // Validate required fields
                if (!songData.title) throw new Error('Title is required');
                if (!songData.artist_id) throw new Error('Artist is required');
                if (!songData.audio_url) throw new Error('Audio file is required');

                const { data: song, error } = await this.supabase
                    .from('songs')
                    .insert([songData])
                    .select()
                    .single();

                if (error) throw error;
                return song;
            } catch (error) {
                console.error('Song creation error:', error);
                throw error;
            }
        }

        if (type === 'ad') {
            try {
                // Handle audio upload
                const audioFile = formData.get('audio');
                let audioUrl = null;

                if (audioFile?.size > 0) {
                    audioUrl = await uploadAudio(audioFile, 'ads');
                }

                // Process duration to interval format
                const duration = formData.get('duration');
                if (!/^([0-5][0-9]):([0-5][0-9])$/.test(duration)) {
                    throw new Error('Duration must be in mm:ss format');
                }
                
                // Process tags
                const targetAudience = formData.get('target_audience')?.split(',')
                    .map(t => t.trim()).filter(t => t) || [];
                const regions = formData.get('regions')?.split(',')
                    .map(r => r.trim()).filter(r => r) || [];

                const adData = {
                    title: formData.get('title')?.trim(),
                    advertiser: formData.get('advertiser')?.trim(),
                    audio_url: audioUrl,
                    click_url: formData.get('click_url')?.trim() || null,
                    duration: `00:${duration}`,
                    status: formData.get('status'),
                    target_audience: targetAudience,
                    regions: regions,
                    frequency: parseInt(formData.get('frequency')) || 1,
                    daily_budget: parseFloat(formData.get('daily_budget')) || null,
                    total_budget: parseFloat(formData.get('total_budget')) || null,
                    start_date: formData.get('start_date') || null,
                    end_date: formData.get('end_date') || null
                };

                // Validate required fields
                if (!adData.title) throw new Error('Title is required');
                if (!adData.advertiser) throw new Error('Advertiser is required');
                if (!adData.audio_url) throw new Error('Audio file is required');

                return adData;
            } catch (error) {
                console.error('Ad processing error:', error);
                throw error;
            }
        }

        // Handle other types...
        let processed = {};

        try {
            // Process text fields first
            for (const [key, value] of formData.entries()) {
                if (!(value instanceof File)) {
                    if (key === 'genres') {
                        processed[key] = value.split(',').map(g => g.trim()).filter(g => g);
                    } else if (key === 'duration') {
                        const parts = value.split(':').map(p => p.padStart(2, '0'));
                        processed[key] = parts.length === 2 ? `00:${parts.join(':')}` : parts.join(':');
                    } else {
                        processed[key] = value.trim() || null;
                    }
                }
            }

            // Then handle file uploads
            for (const [key, value] of formData.entries()) {
                if (value instanceof File && value.size > 0) {
                    try {
                        if (key === 'audio') {
                            processed.audio_url = await uploadAudio(value, type);
                        } else if (key === 'cover' || key === 'image') {
                            const imgUrl = await uploadImage(value, type);
                            processed[key === 'cover' ? 'cover_url' : 'image_url'] = imgUrl;
                        }
                    } catch (error) {
                        console.error('Upload failed:', error);
                        throw new Error(`Failed to upload ${key}: ${error.message}`);
                    }
                }
            }

            // Validate required fields
            const requiredFields = {
                artist: ['name', 'status'],
                album: ['title', 'artist_id'],
                song: ['title', 'artist_id'],
                playlist: ['name']
            };

            if (requiredFields[type]) {
                for (const field of requiredFields[type]) {
                    if (!processed[field]) {
                        throw new Error(`${field} is required`);
                    }
                }
            }

            // Add status if not present
            if (!processed.status) {
                processed.status = 'published';
            }

            if (type === 'playlist') {
                // Get the system account ID
                const { data: systemProfile } = await this.supabase
                    .from('profiles')
                    .select('id')
                    .eq('username', 'xmdiscover')
                    .single();

                if (!systemProfile) throw new Error('System account not found');

                // Handle cover image
                const coverFile = formData.get('cover');
                let coverUrl = formData.get('cover_url');

                if (coverFile?.size > 0) {
                    coverUrl = await uploadImage(coverFile, 'playlists');
                }

                processed = {
                    name: formData.get('name'),
                    description: formData.get('description'),
                    cover_url: coverUrl,
                    creator_id: systemProfile.id,
                    featured: formData.get('featured') === 'on',
                    status: formData.get('status'),
                    is_public: true
                };

                // Handle songs
                const songIds = JSON.parse(formData.get('songs') || '[]');
                if (songIds.length === 0) {
                    throw new Error('Please select at least one song');
                }

                // Create playlist first
                const { data: playlist, error } = await this.supabase
                    .from('playlists')
                    .insert([processed])
                    .select()
                    .single();

                if (error) throw error;

                // Then add songs
                const playlistSongs = songIds.map((songId, index) => ({
                    playlist_id: playlist.id,
                    song_id: songId,
                    position: index
                }));

                const { error: songError } = await this.supabase
                    .from('playlist_songs')
                    .insert(playlistSongs);

                if (songError) throw songError;

                return playlist;
            }

            console.log('Processed form data:', processed);
            return processed;

        } catch (error) {
            console.error('Form processing error:', error);
            throw error;
        }
    }

    async refreshPodcast(id) {
        const { data: podcast } = await this.supabase
            .from('podcasts')
            .select('feed_url')
            .eq('id', id)
            .single();

        if (!podcast?.feed_url) throw new Error('No feed URL found');

        const { loadPodcastFeed } = await import('./podcasts.js');
        await loadPodcastFeed(podcast.feed_url, id);
        await this.loadPodcasts();
    }

    formatDuration(interval) {
        if (!interval) return '0:00';
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
}

// Initialize admin UI
let adminUI = null;
document.addEventListener('DOMContentLoaded', () => {
    if (!adminUI) {
        adminUI = new AdminUI();
    }
});
