import { supabase } from '../supabase.js';

class PlaylistPage {
    constructor() {
        this.playlistId = new URLSearchParams(window.location.search).get('id');
        if (!this.playlistId) {
            window.location.href = '/discover.html';
            return;
        }
        this.loadPlaylist();
    }

    async loadPlaylist() {
        try {
            const { data: playlist } = await supabase
                .from('playlists')
                .select(`
                    *,
                    profiles (
                        username,
                        display_name
                    )
                `)
                .eq('id', this.playlistId)
                .single();

            if (!playlist) throw new Error('Playlist not found');

            this.updateUI(playlist);
            await Promise.all([
                this.loadTracks(playlist.id),
                this.loadSimilarPlaylists(playlist)
            ]);
        } catch (error) {
            console.error('Failed to load playlist:', error);
            alert('Playlist not found');
            window.location.href = '/discover.html';
        }
    }

    updateUI(playlist) {
        document.title = `${playlist.name} - xM DiScover`;
        document.querySelector('.playlist-title').textContent = playlist.name;
        document.querySelector('.playlist-creator').textContent = 
            `Created by ${playlist.profiles.display_name || playlist.profiles.username}`;
        
        if (playlist.cover_url) {
            document.querySelector('.playlist-image').style.backgroundImage = `url('${playlist.cover_url}')`;
        }

        if (playlist.description) {
            const meta = document.querySelector('.playlist-meta');
            meta.insertAdjacentHTML('afterbegin', `<p class="playlist-description">${playlist.description}</p>`);
        }
    }

    async loadTracks() {
        const { data: tracks } = await supabase
            .from('playlist_songs')
            .select(`
                songs (
                    id,
                    title,
                    duration,
                    cover_url,
                    artists (name)
                )
            `)
            .eq('playlist_id', this.playlistId)
            .order('position', { ascending: true });

        const container = document.querySelector('.track-list');
        if (container && tracks) {
            container.innerHTML = tracks.map(({ songs: track }, index) => `
                <div class="track-item" data-track-id="${track.id}">
                    <span class="track-number">${index + 1}</span>
                    <img src="${track.cover_url}" alt="${track.title}" width="40" height="40">
                    <div class="track-info">
                        <h4>${track.title}</h4>
                        <p>${track.artists.name}</p>
                    </div>
                    <span class="track-duration">${track.duration}</span>
                </div>
            `).join('');
            
            document.querySelector('.playlist-tracks').textContent = 
                `${tracks.length} track${tracks.length !== 1 ? 's' : ''}`;
        }
    }

    async loadSimilarPlaylists(currentPlaylist) {
        const { data: playlists } = await supabase
            .from('playlists')
            .select('*')
            .eq('status', 'published')
            .neq('id', this.playlistId)
            // You could add more filters here based on genres or other criteria
            .limit(6);

        const container = document.querySelector('.playlist-grid');
        if (container && playlists) {
            container.innerHTML = playlists.map(playlist => `
                <div class="playlist-card" onclick="window.location.href='/pages/playlist.html?id=${playlist.id}'">
                    <div class="playlist-img" style="background-image: url('${playlist.cover_url}')"></div>
                    <h3>${playlist.name}</h3>
                    <p>${playlist.description || ''}</p>
                </div>
            `).join('');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new PlaylistPage();
});
