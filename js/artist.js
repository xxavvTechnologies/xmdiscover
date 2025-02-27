import { supabase } from './supabase-config.js';
import { player } from './player.js';
import { requireAuth } from './authCheck.js';

class ArtistView {
    constructor() {
        this.init();
    }

    async init() {
        const user = await requireAuth();
        if (!user) return;

        this.artistId = new URLSearchParams(window.location.search).get('id');
        this.loadArtistData();
    }

    async loadArtistData() {
        const { data: artist } = await supabase
            .from('artists')
            .select('*')
            .eq('id', this.artistId)
            .single();

        const { data: albums } = await supabase
            .from('albums')
            .select('*, songs(*)')
            .eq('artist_id', this.artistId)
            .order('release_date', { ascending: false });

        this.renderArtist(artist, albums);
    }

    renderArtist(artist, albums) {
        document.getElementById('artist-image').src = artist.image_url;
        document.getElementById('artist-name').textContent = artist.name;
        document.getElementById('artist-bio').textContent = artist.bio;

        const albumsSection = document.getElementById('albums');
        albumsSection.innerHTML = albums.map(album => `
            <div class="album-card" onclick="window.location.href='album.html?id=${album.id}'">
                <img src="${album.cover_art_url}" alt="${album.title}">
                <h3>${album.title}</h3>
                <p>${new Date(album.release_date).getFullYear()}</p>
            </div>
        `).join('');
    }
}

new ArtistView();
