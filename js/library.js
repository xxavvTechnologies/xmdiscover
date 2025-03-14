import { supabase } from './supabase.js';

class LibraryUI {
    constructor() {
        this.loadContent();
    }

    async loadContent() {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
            window.location.href = '/auth/login.html';
            return;
        }

        await Promise.all([
            this.loadUserPlaylists(session.user.id),
            this.loadLikedSongs(session.user.id),
            this.loadRecentlyPlayed(session.user.id)
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
                <div class="playlist-card" onclick="window.location.href='/pages/create-playlist.html'">
                    <div class="playlist-img gradient-purple">
                        <i class="fas fa-plus" style="font-size: 2rem; color: white; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);"></i>
                    </div>
                    <h3>Create New Playlist</h3>
                    <p>Start a new collection</p>
                </div>
            `;

            container.innerHTML = createPlaylistBtn + (playlists?.map(playlist => `
                <div class="playlist-card" onclick="window.location.href='/pages/playlist.html?id=${playlist.id}'">
                    <div class="playlist-img" style="background-image: url('${playlist.cover_url}')"></div>
                    <h3>${playlist.name}</h3>
                    <p>${playlist.description || `${playlist.playlist_songs[0]?.count || 0} songs`}</p>
                    <span class="playlist-privacy">${playlist.is_public ? 'Public' : 'Private'}</span>
                </div>
            `).join('') || '');
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
                    cover_url,
                    artists (name)
                )
            `)
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        const container = document.querySelector('[data-content="liked-songs"]');
        if (container) {
            container.onclick = () => {
                window.location.href = '/pages/playlist.html?type=liked';
            };
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
                    cover_url,
                    artists (name)
                )
            `)
            .eq('user_id', userId)
            .order('played_at', { ascending: false });

        const container = document.querySelector('[data-content="recently-played"]');
        if (container) {
            container.onclick = () => {
                window.location.href = '/pages/playlist.html?type=recent';
            };
            if (history?.length > 0) {
                container.querySelector('.song-count').textContent = `${history.length} recently played`;
            }
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new LibraryUI();
});
