import { supabase } from './supabase-config.js';
import { player } from './player.js';
import { requireAuth } from './authCheck.js';

class LibraryView {
    constructor() {
        this.init();
    }

    async init() {
        const user = await requireAuth();
        if (!user) return;

        this.userId = user.id;
        this.loadLibrary();
    }

    async loadLibrary() {
        // Load user's playlists
        const { data: playlists } = await supabase
            .from('playlists')
            .select('*')
            .eq('user_id', this.userId)
            .order('created_at', { ascending: false });

        // Load user's liked songs
        const { data: likedSongs } = await supabase
            .from('user_library')
            .select(`
                songs (
                    *,
                    artists (name),
                    albums (title, cover_art_url)
                )
            `)
            .eq('user_id', this.userId)
            .order('added_at', { ascending: false });

        this.renderPlaylists(playlists || []);
        this.renderLikedSongs(likedSongs || []);
        this.attachEventListeners();
    }

    renderPlaylists(playlists) {
        const playlistsContainer = document.getElementById('user-playlists');
        playlistsContainer.innerHTML = `
            <h2>Your Playlists</h2>
            <div class="playlists-grid">
                ${playlists.map(playlist => `
                    <div class="playlist-card" data-playlist-id="${playlist.id}">
                        <h3>${playlist.name}</h3>
                        <p>${playlist.description || ''}</p>
                    </div>
                `).join('')}
            </div>
        `;
    }

    renderLikedSongs(likedSongs) {
        const likedSongsContainer = document.getElementById('liked-songs');
        likedSongsContainer.innerHTML = `
            <h2>Liked Songs</h2>
            <div class="track-list">
                ${likedSongs.map(({ songs: song }) => `
                    <div class="track-item" data-song-id="${song.id}">
                        <img src="${song.albums.cover_art_url}" alt="Album cover">
                        <div class="track-info">
                            <span class="track-title">${song.title}</span>
                            <span class="track-artist">${song.artists.name}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    attachEventListeners() {
        // Handle playlist clicks
        document.querySelectorAll('.playlist-card').forEach(card => {
            card.addEventListener('click', () => {
                window.location.href = `playlist.html?id=${card.dataset.playlistId}`;
            });
        });

        // Handle song clicks
        document.querySelectorAll('.track-item').forEach(track => {
            track.addEventListener('click', () => {
                player.playSong(track.dataset.songId);
            });
        });

        // Handle new playlist creation
        document.getElementById('create-playlist')?.addEventListener('click', () => {
            this.createNewPlaylist();
        });
    }

    async createNewPlaylist() {
        const name = prompt('Enter playlist name:');
        if (!name) return;

        try {
            const { data, error } = await supabase
                .from('playlists')
                .insert([{
                    name,
                    user_id: this.userId,
                    created_at: new Date(),
                    is_public: false
                }]);

            if (error) throw error;
            this.loadLibrary(); // Refresh the view
        } catch (error) {
            alert('Error creating playlist: ' + error.message);
        }
    }
}

new LibraryView();
