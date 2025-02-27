import { supabase } from './supabase-config.js';
import { player } from './player.js';
import { requireAuth } from './authCheck.js';

class PlaylistView {
    constructor() {
        this.init();
    }

    async init() {
        const user = await requireAuth();
        if (!user) return;

        this.playlistId = new URLSearchParams(window.location.search).get('id');
        this.loadPlaylist();
    }

    async loadPlaylist() {
        const { data: playlist } = await supabase
            .from('playlists')
            .select(`
                *,
                profiles (username),
                playlist_songs (
                    position,
                    songs (
                        *,
                        artists (name),
                        albums (title, cover_art_url)
                    )
                )
            `)
            .eq('id', this.playlistId)
            .single();

        this.renderPlaylist(playlist);
    }

    renderPlaylist(playlist) {
        document.getElementById('playlist-name').textContent = playlist.name;
        document.getElementById('playlist-description').textContent = playlist.description;
        document.getElementById('playlist-owner').textContent = `Created by ${playlist.profiles.username}`;

        const tracksList = document.getElementById('playlist-tracks');
        tracksList.innerHTML = playlist.playlist_songs
            .sort((a, b) => a.position - b.position)
            .map(track => `
                <div class="track-item" data-song-id="${track.songs.id}">
                    <img src="${track.songs.albums.cover_art_url}" alt="Album cover">
                    <div class="track-info">
                        <span class="track-title">${track.songs.title}</span>
                        <span class="track-artist">${track.songs.artists.name}</span>
                    </div>
                </div>
            `).join('');

        this.attachEventListeners();
    }

    attachEventListeners() {
        document.querySelectorAll('.track-item').forEach(track => {
            track.addEventListener('click', () => {
                player.playSong(track.dataset.songId);
            });
        });
    }
}

new PlaylistView();
