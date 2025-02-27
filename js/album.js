import { supabase } from './supabase-config.js';
import { player } from './player.js';
import { requireAuth } from './authCheck.js';

class AlbumView {
    constructor() {
        this.init();
    }

    async init() {
        const user = await requireAuth();
        if (!user) return;

        this.albumId = new URLSearchParams(window.location.search).get('id');
        this.loadAlbum();
        this.attachEventListeners();
    }

    async loadAlbum() {
        const { data: album } = await supabase
            .from('albums')
            .select(`
                *,
                artists (id, name),
                songs (
                    *,
                    artists (name)
                )
            `)
            .eq('id', this.albumId)
            .single();

        this.album = album;
        this.renderAlbum();
    }

    renderAlbum() {
        document.getElementById('album-cover').src = this.album.cover_art_url;
        document.getElementById('album-title').textContent = this.album.title;
        
        const artistLink = document.getElementById('artist-link');
        artistLink.href = `artist.html?id=${this.album.artists.id}`;
        artistLink.textContent = this.album.artists.name;

        document.getElementById('album-details').textContent = 
            `${new Date(this.album.release_date).getFullYear()} • ${this.album.songs.length} songs`;

        const tracksList = document.getElementById('album-tracks');
        tracksList.innerHTML = this.album.songs
            .sort((a, b) => a.track_number - b.track_number)
            .map(song => `
                <div class="track-item" data-song-id="${song.id}">
                    <span class="track-number">${song.track_number}</span>
                    <div class="track-info">
                        <span class="track-title">${song.title}</span>
                        <span class="track-duration">${this.formatDuration(song.duration)}</span>
                    </div>
                </div>
            `).join('');
    }

    attachEventListeners() {
        document.getElementById('play-album').addEventListener('click', () => {
            if (this.album?.songs?.[0]) {
                player.playSong(this.album.songs[0].id);
            }
        });

        document.addEventListener('click', (e) => {
            const trackItem = e.target.closest('.track-item');
            if (trackItem) {
                player.playSong(trackItem.dataset.songId);
            }
        });
    }

    formatDuration(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
}

new AlbumView();
