import { supabase, getPagePath } from '../supabase.js';

class SearchPage {
    constructor() {
        this.searchInput = document.getElementById('search-input');
        this.activeFilter = 'all';
        this.searchTimeout = null;
        this.setupEventListeners();
        
        // Check for search param in URL
        const urlParams = new URLSearchParams(window.location.search);
        const query = urlParams.get('q');
        if (query) {
            this.searchInput.value = query;
            this.performSearch(query);
        }
    }

    setupEventListeners() {
        // Handle search input
        this.searchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            
            // Update URL
            const url = new URL(window.location);
            if (query) {
                url.searchParams.set('q', query);
            } else {
                url.searchParams.delete('q');
            }
            window.history.replaceState({}, '', url);

            // Clear previous timeout
            clearTimeout(this.searchTimeout);
            
            // Set new timeout for searching
            if (query.length >= 2) {
                this.searchTimeout = setTimeout(() => {
                    this.performSearch(query);
                }, 300);
            } else {
                this.clearResults();
            }
        });

        // Handle filter buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.activeFilter = btn.dataset.filter;
                // Update UI
                document.querySelectorAll('.filter-btn').forEach(b => 
                    b.classList.toggle('active', b === btn));
                // Re-run search if there's a query
                const query = this.searchInput.value.trim();
                if (query.length >= 2) {
                    this.performSearch(query);
                }
            });
        });
    }

    async performSearch(query) {
        try {
            const [artists, songs, albums, playlists, users] = await Promise.all([
                this.searchArtists(query),
                this.searchSongs(query),
                this.searchAlbums(query),
                this.searchPlaylists(query),
                this.searchUsers(query)
            ]);

            // Clear previous results
            this.clearResults();

            // Determine top result
            const topResult = this.determineTopResult({
                artists, songs, albums, playlists, users
            }, query);

            if (topResult && (this.activeFilter === 'all' || this.activeFilter === topResult.type)) {
                this.displayTopResult(topResult);
            }

            // Display section results based on active filter
            if (this.activeFilter === 'all' || this.activeFilter === 'artists') {
                this.displayArtists(artists);
            }
            if (this.activeFilter === 'all' || this.activeFilter === 'songs') {
                this.displaySongs(songs);
            }
            if (this.activeFilter === 'all' || this.activeFilter === 'albums') {
                this.displayAlbums(albums);
            }
            if (this.activeFilter === 'all' || this.activeFilter === 'playlists') {
                this.displayPlaylists(playlists);
            }
            if (this.activeFilter === 'all' || this.activeFilter === 'users') {
                this.displayUsers(users);
            }

        } catch (error) {
            console.error('Search failed:', error);
        }
    }

    async searchArtists(query) {
        const { data } = await supabase
            .from('artists')
            .select('*')
            .eq('status', 'published')
            .ilike('name', `%${query}%`)
            .limit(5);
        return data || [];
    }

    async searchSongs(query) {
        const { data } = await supabase
            .from('songs')
            .select(`
                *,
                artists (name),
                albums (title)
            `)
            .eq('status', 'published')
            .ilike('title', `%${query}%`)
            .limit(5);
        return data || [];
    }

    async searchAlbums(query) {
        const { data } = await supabase
            .from('albums')
            .select(`
                *,
                artists (name)
            `)
            .eq('status', 'published')
            .ilike('title', `%${query}%`)
            .limit(5);
        return data || [];
    }

    async searchPlaylists(query) {
        const { data } = await supabase
            .from('playlists')
            .select(`
                *,
                profiles (username, display_name)
            `)
            .eq('status', 'published')
            .eq('is_public', true)
            .ilike('name', `%${query}%`)
            .limit(5);
        return data || [];
    }

    async searchUsers(query) {
        const { data } = await supabase
            .from('profiles')
            .select('*')
            .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
            .limit(5);
        return data || [];
    }

    determineTopResult(results, query) {
        const allResults = [
            ...results.artists.map(item => ({ ...item, type: 'artists' })),
            ...results.songs.map(item => ({ ...item, type: 'songs' })),
            ...results.albums.map(item => ({ ...item, type: 'albums' })),
            ...results.playlists.map(item => ({ ...item, type: 'playlists' })),
            ...results.users.map(item => ({ ...item, type: 'users' }))
        ];

        if (allResults.length === 0) return null;

        // Simple scoring based on exact matches and position of query in the name
        return allResults.reduce((best, current) => {
            const name = current.name || current.title || current.username || '';
            const exactMatch = name.toLowerCase() === query.toLowerCase();
            const startsWithQuery = name.toLowerCase().startsWith(query.toLowerCase());
            
            const currentScore = exactMatch ? 3 : startsWithQuery ? 2 : 1;
            const bestScore = best ? (best.name || best.title || best.username || '').toLowerCase() === query.toLowerCase() ? 3 : 
                             (best.name || best.title || best.username || '').toLowerCase().startsWith(query.toLowerCase()) ? 2 : 1 : 0;

            return currentScore > bestScore ? current : best;
        }, null);
    }

    displayTopResult(result) {
        const section = document.querySelector('.top-result');
        const container = section.querySelector('.top-result-content');
        
        let html = '';
        switch (result.type) {
            case 'artists':
                html = `
                    <div class="top-result-card artist" onclick="window.location.href='${getPagePath('/pages/artist')}?id=${result.id}'">
                        <div class="result-image" style="background-image: url('${result.image_url}')"></div>
                        <h3>${result.name}</h3>
                        <p>Artist</p>
                    </div>
                `;
                break;
            case 'songs':
                html = `
                    <div class="top-result-card song" data-id="${result.id}">
                        <div class="result-image" style="background-image: url('${result.cover_url}')"></div>
                        <h3>${result.title}</h3>
                        <p>Song • ${result.artists.name}</p>
                    </div>
                `;
                break;
            // Add other cases for albums, playlists, users
        }

        container.innerHTML = html;
        section.style.display = 'block';
    }

    displayArtists(artists) {
        if (artists.length === 0) return;
        
        const section = document.querySelector('.artists-section');
        const container = section.querySelector('.artist-grid');
        
        container.innerHTML = artists.map(artist => `
            <div class="artist-card" onclick="window.location.href='${getPagePath('/pages/artist')}?id=${artist.id}'">
                <div class="artist-img" style="background-image: url('${artist.image_url}')"></div>
                <h3>${artist.name}</h3>
                <p>${artist.genres?.join(', ') || ''}</p>
            </div>
        `).join('');
        
        section.style.display = 'block';
    }

    displaySongs(songs) {
        if (songs.length === 0) return;
        
        const section = document.querySelector('.songs-section');
        const container = section.querySelector('.track-list');
        
        container.innerHTML = songs.map((song, index) => `
            <div class="track-item" data-id="${song.id}">
                <span class="track-number">${index + 1}</span>
                <img src="${song.cover_url}" alt="${song.title}" width="40" height="40">
                <div class="track-info">
                    <h4>${song.title}</h4>
                    <p>${song.artists.name}</p>
                </div>
                <span class="track-duration">${song.duration}</span>
            </div>
        `).join('');
        
        section.style.display = 'block';
    }

    clearResults() {
        document.querySelectorAll('.result-section, .top-result').forEach(section => {
            section.style.display = 'none';
            const container = section.querySelector('.result-grid, .track-list, .top-result-content');
            if (container) container.innerHTML = '';
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new SearchPage();
});
