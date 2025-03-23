import { supabase, getPagePath } from '../supabase.js';
import { PlayerStateManager } from '../services/playerState.js';

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
            const [artists, songs, albums, playlists, users, podcasts] = await Promise.all([
                this.searchArtists(query),
                this.searchSongs(query),
                this.searchAlbums(query),
                this.searchPlaylists(query),
                this.searchUsers(query),
                this.searchPodcasts(query)
            ]);

            // Clear previous results
            this.clearResults();

            // Determine top result
            const topResult = this.determineTopResult({
                artists, songs, albums, playlists, users, podcasts
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
            if (this.activeFilter === 'all' || this.activeFilter === 'podcasts') {
                this.displayPodcasts(podcasts);
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
        const { data: songs } = await supabase
            .from('songs')
            .select(`
                *,
                artists (name),
                albums (title)
            `)
            .eq('status', 'published')
            .ilike('title', `%${query}%`)
            .limit(5);
            
        // Get signed URLs for all songs
        if (songs) {
            const songPromises = songs.map(async (song) => {
                if (song.audio_url && song.audio_url.includes('supabase.co/storage')) {
                    const urlParts = song.audio_url.split('/storage/v1/object/');
                    if (urlParts.length === 2) {
                        const pathPart = urlParts[1].replace(/^(public|sign)\//, '');
                        const cleanPath = pathPart.split('?')[0];
                        
                        const { data } = await supabase.storage
                            .from(cleanPath.split('/')[0])
                            .createSignedUrl(
                                cleanPath.split('/').slice(1).join('/'),
                                3600
                            );
                        
                        if (data?.signedUrl) {
                            song.audio_url = data.signedUrl;
                        }
                    }
                }
                return song;
            });
            
            return await Promise.all(songPromises);
        }
        return [];
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

    async searchPodcasts(query) {
        const { data } = await supabase
            .from('podcasts')
            .select('*')
            .eq('status', 'published')
            .ilike('title', `%${query}%`)
            .limit(5);
        return data || [];
    }

    determineTopResult(results, query) {
        const allResults = [
            ...results.artists.map(item => ({ ...item, type: 'artists' })),
            ...results.songs.map(item => ({ ...item, type: 'songs' })),
            ...results.albums.map(item => ({ ...item, type: 'albums' })),
            ...results.playlists.map(item => ({ ...item, type: 'playlists' })),
            ...results.users.map(item => ({ ...item, type: 'users' })),
            ...results.podcasts.map(item => ({ ...item, type: 'podcasts' }))
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
        
        if (!result) {
            section.style.display = 'none';
            return;
        }

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
                    <div class="top-result-card song" 
                         data-track-id="${result.id}"
                         data-audio-url="${result.audio_url}"
                         data-cover-url="${result.cover_url}">
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

        // Add click handler for song results
        const songCard = container.querySelector('.song');
        if (songCard) {
            songCard.addEventListener('click', () => {
                const standardTrack = PlayerStateManager.standardizeTrackInfo(result);
                document.dispatchEvent(new CustomEvent('xm-play-track', {
                    detail: standardTrack
                }));
            });
        }
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
        
        // Add click handlers for songs
        container.querySelectorAll('.track-item').forEach(track => {
            track.addEventListener('click', () => {
                const songId = track.dataset.id;
                const song = songs.find(s => s.id === songId);
                if (song) {
                    const playEvent = new CustomEvent('xm-play-track', {
                        detail: {
                            id: song.id,
                            title: song.title,
                            artist: song.artists.name,
                            audioUrl: song.audio_url, // Now using pre-signed URL
                            coverUrl: song.cover_url,
                            artistId: song.artist_id
                        }
                    });
                    document.dispatchEvent(playEvent);
                }
            });
        });
    }

    displayAlbums(albums) {
        if (albums.length === 0) return;
        
        const section = document.querySelector('.albums-section');
        const container = section.querySelector('.album-grid');
        
        container.innerHTML = albums.map(album => `
            <div class="release-card" onclick="window.location.href='${getPagePath('/pages/release')}?id=${album.id}'">
                <div class="release-img" style="background-image: url('${album.cover_url}')"></div>
                <h3>${album.title}</h3>
                <p>${album.artists?.name || 'Unknown Artist'}</p>
            </div>
        `).join('');
        
        section.style.display = 'block';
    }

    displayPlaylists(playlists) {
        if (playlists.length === 0) return;
        
        const section = document.querySelector('.playlists-section');
        const container = section.querySelector('.playlist-grid');
        
        container.innerHTML = playlists.map(playlist => `
            <div class="playlist-card" onclick="window.location.href='${getPagePath('/pages/playlist')}?id=${playlist.id}'">
                <div class="playlist-img" style="background-image: url('${playlist.cover_url}')"></div>
                <h3>${playlist.name}</h3>
                <p>By ${playlist.profiles?.display_name || playlist.profiles?.username || 'Unknown'}</p>
            </div>
        `).join('');
        
        section.style.display = 'block';
    }

    displayUsers(users) {
        if (users.length === 0) return;
        
        const section = document.querySelector('.users-section');
        const container = section.querySelector('.user-grid');
        
        container.innerHTML = users.map(user => `
            <div class="user-card" onclick="window.location.href='${getPagePath('/pages/profile')}?id=${user.id}'">
                <div class="user-avatar" style="background-image: url('${user.avatar_url || 'https://d2zcpib8duehag.cloudfront.net/xmdiscover-default-user.png'}')"></div>
                <h3>${user.display_name || user.username}</h3>
                <p>@${user.username}</p>
            </div>
        `).join('');
        
        section.style.display = 'block';
    }

    displayPodcasts(podcasts) {
        if (podcasts.length === 0) return;

        const section = document.querySelector('.podcasts-section');
        if (!section) {
            console.warn('Podcasts section not found');
            return;
        }

        // Create container if it doesn't exist
        let container = section.querySelector('.podcast-grid');
        if (!container) {
            container = document.createElement('div');
            container.className = 'podcast-grid';
            section.appendChild(container);
        }
        
        container.innerHTML = podcasts.map(podcast => `
            <div class="podcast-card" onclick="window.location.href='${getPagePath('/pages/podcast')}?id=${podcast.id}'">
                <div class="podcast-img" style="background-image: url('${podcast.image_url}')"></div>
                <h3>${podcast.title}</h3>
                <p>${podcast.description || ''}</p>
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
