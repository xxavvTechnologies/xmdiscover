import { supabase, getPagePath } from './supabase.js';

class LibraryUI {
    constructor() {
        this.sortSelect = document.querySelector('.sort-select');
        this.filterInput = document.querySelector('.filter-input');
        this.setupEventListeners();
        this.loadContent();
    }

    setupEventListeners() {
        // Setup tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tabName = btn.dataset.tab;
                this.switchTab(tabName);
            });
        });

        // Setup quick access cards
        document.querySelectorAll('.quick-access-grid .playlist-card').forEach(card => {
            card.addEventListener('click', () => {
                const type = card.dataset.type;
                window.location.href = getPagePath('/pages/playlist') + `?type=${type}`;
            });
        });

        // Setup filtering and sorting
        this.filterInput?.addEventListener('input', (e) => this.filterPlaylists(e.target.value));
        this.sortSelect?.addEventListener('change', () => this.sortPlaylists());
    }

    async loadContent() {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
            window.location.href = getPagePath('/auth/login');
            return;
        }

        await Promise.all([
            this.loadUserPlaylists(session.user.id),
            this.loadSavedPlaylists(session.user.id),
            this.loadLikedSongs(session.user.id),
            this.loadRecentlyPlayed(session.user.id),
            this.loadFollowedArtists(session.user.id),
            this.loadFollowedPodcasts(session.user.id)
        ]);
    }

    async loadUserPlaylists(userId) {
        const { data: playlists } = await supabase
            .from('playlists')
            .select('*, playlist_songs(count)')
            .eq('creator_id', userId)
            .order('created_at', { ascending: false });

        const container = document.querySelector('[data-content="my-playlists"]');
        if (container) {
            const createPlaylistBtn = `
                <div class="playlist-card" onclick="window.location.href='${getPagePath('/pages/create-playlist')}'">
                    <div class="playlist-img gradient-purple">
                        <i class="fas fa-plus" style="font-size: 2rem; color: white; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);"></i>
                    </div>
                    <h3>Create New Playlist</h3>
                    <p>Start a new collection</p>
                </div>
            `;

            container.innerHTML = createPlaylistBtn + (playlists?.map(playlist => `
                <div class="playlist-card" onclick="window.location.href='${getPagePath('/pages/playlist')}?id=${playlist.id}'" data-created="${playlist.created_at}">
                    <div class="playlist-img" style="background-image: url('${playlist.cover_url}')"></div>
                    <h3>${playlist.name}</h3>
                    <p>${playlist.description || `${playlist.playlist_songs[0]?.count || 0} songs`}</p>
                    <span class="playlist-privacy">${playlist.is_public ? 'Public' : 'Private'}</span>
                </div>
            `).join('') || '');
        }
    }

    async loadSavedPlaylists(userId) {
        const { data: playlists } = await supabase
            .from('saved_playlists')
            .select(`
                playlists (
                    id,
                    name, 
                    description,
                    cover_url,
                    created_at,
                    profiles (username, display_name),
                    playlist_songs (count)
                )
            `)
            .eq('user_id', userId);

        const container = document.querySelector('[data-content="my-playlists"]');
        if (container && playlists) {
            const savedPlaylistsHtml = playlists.map(({ playlists: playlist }) => `
                <div class="playlist-card saved" onclick="window.location.href='${getPagePath('/pages/playlist')}?id=${playlist.id}'" data-created="${playlist.created_at}">
                    <div class="playlist-img" style="background-image: url('${playlist.cover_url}')"></div>
                    <h3>${playlist.name}</h3>
                    <p>By ${playlist.profiles?.display_name || playlist.profiles?.username}</p>
                    <span class="saved-badge">Saved</span>
                </div>
            `).join('');

            // Append saved playlists after user's playlists
            container.insertAdjacentHTML('beforeend', savedPlaylistsHtml);
        }
    }

    async loadLikedSongs(userId) {
        const { data: likes } = await supabase
            .from('likes')
            .select(`
                songs (
                    id,
                    title,
                    duration,
                    audio_url,
                    cover_url,
                    artists (name)
                )
            `)
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        const container = document.querySelector('[data-content="liked-songs"]');
        if (container) {
            container.style.cursor = 'pointer';
            container.onclick = () => {
                window.location.href = getPagePath('/pages/playlist') + '?type=liked';
            };
            const img = container.querySelector('.playlist-img');
            img.classList.remove('gradient-purple');
            img.style.backgroundImage = `url('https://juywatmqwykgdjfqexho.supabase.co/storage/v1/object/public/images/system/your%20liked%20list.png')`;
            if (likes?.length > 0) {
                container.querySelector('.song-count').textContent = `${likes.length} liked songs`;
            }
        }
    }

    async loadRecentlyPlayed(userId) {
        const { data: history } = await supabase
            .from('play_history')
            .select(`
                songs (
                    id,
                    title,
                    duration,
                    audio_url,
                    cover_url,
                    artists (name)
                )
            `)
            .eq('user_id', userId)
            .order('played_at', { ascending: false });

        const container = document.querySelector('[data-content="recently-played"]');
        if (container) {
            // Process signed URLs before displaying
            const processedTracks = await Promise.all(history?.map(async (item) => {
                const track = item.songs;
                if (track.audio_url?.includes('supabase.co/storage')) {
                    const urlParts = track.audio_url.split('/storage/v1/object/');
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
                            track.audio_url = data.signedUrl;
                        }
                    }
                }
                return track;
            }) || []);

            container.style.cursor = 'pointer';
            container.onclick = () => {
                window.location.href = getPagePath('/pages/playlist') + '?type=recent';
            };

            const img = container.querySelector('.playlist-img');
            img.classList.remove('gradient-blue');
            img.style.backgroundImage = `url('https://juywatmqwykgdjfqexho.supabase.co/storage/v1/object/public/images/system/recently%20played.png')`;
            
            if (history?.length > 0) {
                container.querySelector('.song-count').textContent = `${history.length} recently played`;
            }
        }
    }

    async loadFollowedArtists(userId) {
        const { data: follows } = await supabase
            .from('artist_follows')
            .select(`
                artists (
                    id,
                    name,
                    image_url,
                    genres
                )
            `)
            .eq('user_id', userId);

        const container = document.querySelector('[data-content="followed-artists"]');
        if (container) {
            container.innerHTML = follows?.map(({ artists: artist }) => `
                <div class="artist-card" onclick="window.location.href='${getPagePath('/pages/artist')}?id=${artist.id}'">
                    <div class="artist-img" style="background-image: url('${artist.image_url}')"></div>
                    <h3>${artist.name}</h3>
                    <p>${artist.genres?.join(', ') || ''}</p>
                </div>
            `).join('') || '<p>No followed artists</p>';
        }
    }

    async loadFollowedPodcasts(userId) {
        try {
            const { data: follows } = await supabase
                .from('podcast_follows')
                .select(`
                    podcast:podcast_id (
                        id,
                        title,
                        description,
                        image_url,
                        podcast_episodes(count)
                    )
                )`)
                .eq('user_id', userId);

            // Get saved episodes
            const { data: savedEpisodes } = await supabase
                .from('saved_episodes')
                .select(`
                    episode:episode_id (
                        id,
                        title,
                        duration,
                        audio_url,
                        published_at,
                        podcasts (
                            id,
                            title,
                            image_url
                        )
                    )
                `)
                .eq('user_id', userId)
                .order('saved_at', { ascending: false });

            // Update quick access card
            const podcastCard = document.querySelector('[data-type="podcasts"]');
            if (podcastCard) {
                const followCount = follows?.length || 0;
                const savedCount = savedEpisodes?.length || 0;
                const img = podcastCard.querySelector('.playlist-img');
                img.style.backgroundImage = `url('https://juywatmqwykgdjfqexho.supabase.co/storage/v1/object/public/images/system/podcast-banner.png')`;
                
                const countText = [];
                if (followCount) countText.push(`${followCount} following`);
                if (savedCount) countText.push(`${savedCount} saved`);
                
                podcastCard.querySelector('.podcast-count').textContent = 
                    countText.length ? countText.join(' • ') : 'No saved content';
            }
        } catch (error) {
            console.error('Failed to load podcast content:', error);
            const podcastCard = document.querySelector('[data-type="podcasts"]');
            if (podcastCard) {
                podcastCard.querySelector('.podcast-count').textContent = 'Failed to load';
            }
        }
    }

    filterPlaylists(query) {
        const cards = document.querySelectorAll('[data-content="my-playlists"] .playlist-card');
        query = query.toLowerCase();

        cards.forEach(card => {
            const title = card.querySelector('h3').textContent.toLowerCase();
            const visible = title.includes(query);
            card.style.display = visible ? '' : 'none';
        });
    }

    sortPlaylists() {
        const container = document.querySelector('[data-content="my-playlists"]');
        const cards = Array.from(container.children);
        const sortBy = this.sortSelect.value;

        cards.sort((a, b) => {
            switch(sortBy) {
                case 'name':
                    return a.querySelector('h3').textContent.localeCompare(b.querySelector('h3').textContent);
                case 'tracks':
                    return parseInt(b.querySelector('.song-count').textContent) - 
                           parseInt(a.querySelector('.song-count').textContent);
                case 'recent':
                default:
                    return new Date(b.dataset.created) - new Date(a.dataset.created);
            }
        });

        container.innerHTML = '';
        cards.forEach(card => container.appendChild(card));
    }

    switchTab(tabName) {
        // Update button states
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        // Update panel visibility
        document.querySelectorAll('.tab-panel').forEach(panel => {
            panel.classList.toggle('active', panel.dataset.panel === tabName);
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new LibraryUI();
});
