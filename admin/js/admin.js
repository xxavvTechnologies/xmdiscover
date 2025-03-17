import { supabase } from '../../js/supabase.js';
import { getDashboardStats } from './stats.js';
import { uploadAudio, uploadImage } from '../../js/storage.js';

class AdminUI {
    constructor() {
        this.isInitialized = false;
        this.supabase = supabase;
        this.init();
    }

    async init() {
        if (this.isInitialized) return;

        try {
            // Single auth check at startup
            const { data: { session } } = await this.supabase.auth.getSession();
            if (!session) {
                window.location.href = '/auth/login.html';
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
        window.location.href = '/auth/login.html';
    }

    async handleAction(e) {
        const action = e.target.dataset.action;
        const type = e.target.dataset.type || e.target.closest('tr, .admin-card')?.dataset.type;
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
                        const cleanType = type.replace(/s$/, ''); // Remove trailing 's' if present
                        await this.deleteItem(cleanType, id);
                        e.target.closest('tr, .admin-card')?.remove();
                    }
                    break;
                case 'refresh':
                    await this.refreshPodcast(id);
                    await this.loadPodcasts();
                    break;
            }
        } catch (error) {
            console.error('Action failed:', error);
            alert('Operation failed: ' + error.message);
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

    async deleteItem(type, id) {
        const { error } = await this.supabase
            .from(type + 's')
            .delete()
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
        if (!tbody) return;data-type="podcast">

        tbody.innerHTML = podcasts.map(podcast => `
            <tr>
                <td><div class="admin-podcast-cover" style="background-image: url('${podcast.image_url || ''}')"></div></td>
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

    async loadArtistOptions() {
        const { data: artists } = await supabase
            .from('artists')
            .select('id, name')
            .order('name');
        
        return artists?.map(artist => ({
            value: artist.id,
            label: artist.name
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
                { name: 'cover', label: 'Album Cover', type: 'file', accept: 'image/*' },
                { name: 'release_date', label: 'Release Date', type: 'date', required: true },
                { name: 'songs', label: 'Album Songs', type: 'song-selector', required: true }
            ],
            song: [
                { name: 'title', label: 'Song Title', type: 'text', required: true },
                { name: 'artist_id', label: 'Artist', type: 'select', required: true,
                  optionsLoader: () => this.loadArtistOptions() },
                { name: 'album_id', label: 'Album', type: 'select', required: false,
                  dependsOn: 'artist_id',
                  optionsLoader: async (artistId) => {
                    const { data: albums } = await supabase
                        .from('albums')
                        .select('id, title')
                        .eq('artist_id', artistId)
                        .order('title');
                    return albums?.map(album => ({
                        value: album.id,
                        label: album.title
                    })) || [];
                }},
                { name: 'type', label: 'Release Type', type: 'select', options: [
                    { value: 'album_track', label: 'Album Track' },
                    { value: 'single', label: 'Single' },
                    { value: 'ep', label: 'EP' }
                ]},
                { name: 'cover', label: 'Song Cover', type: 'file', accept: 'image/*' },
                { name: 'audio', label: 'Audio File', type: 'file', accept: 'audio/*', required: true },
                { name: 'duration', label: 'Duration', type: 'text', required: true }
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

                // Check if podcast already exists
                const { data: existingPodcast } = await this.supabase
                    .from('podcasts')
                    .select('id, status')
                    .eq('feed_url', feed_url)
                    .single();

                if (existingPodcast) {
                    if (existingPodcast.status === 'published') {
                        throw new Error('This podcast feed is already in the system');
                    }
                    
                    // If podcast exists but not published, update it
                    const { data: podcast, error: updateError } = await this.supabase
                        .from('podcasts')
                        .update({
                            status: formData.get('status') || 'published',
                            title: 'Loading...',
                            description: 'Fetching podcast information...'
                        })
                        .eq('id', existingPodcast.id)
                        .select()
                        .single();

                    if (updateError) throw updateError;

                    // Refresh metadata
                    const { loadPodcastFeed } = await import('./podcasts.js');
                    await loadPodcastFeed(feed_url, podcast.id);
                    
                    return podcast;
                }

                // Create new podcast if it doesn't exist
                const { data: podcast, error: createError } = await this.supabase
                    .from('podcasts')
                    .insert([{
                        feed_url,
                        status: formData.get('status') || 'published',
                        title: 'Loading...',
                        description: 'Fetching podcast information...'
                    }])
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
