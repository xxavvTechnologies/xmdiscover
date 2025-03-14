import { supabase } from '../supabase.js';

class ArtistPage {
    constructor() {
        this.artistId = new URLSearchParams(window.location.search).get('id');
        if (!this.artistId) {
            window.location.href = '/discover.html';
            return;
        }
        this.loadArtist();
    }

    async loadArtist() {
        try {
            const { data: artist } = await supabase
                .from('artists')
                .select('*')
                .eq('id', this.artistId)
                .single();

            if (!artist) throw new Error('Artist not found');

            this.updateUI(artist);
            await Promise.all([
                this.loadReleases(),
                this.loadTracks()
            ]);
        } catch (error) {
            console.error('Failed to load artist:', error);
            alert('Artist not found');
            window.location.href = '/discover.html';
        }
    }

    updateUI(artist) {
        document.title = `${artist.name} - xM DiScover`;
        document.querySelector('.artist-name').textContent = artist.name;
        document.querySelector('.artist-genres').textContent = artist.genres?.join(', ');
        document.querySelector('.bio-text').textContent = artist.bio || 'No biography available';
        document.querySelector('.artist-image').style.backgroundImage = `url('${artist.image_url}')`;
    }

    async loadReleases() {
        const { data: releases } = await supabase
            .from('albums')
            .select('*')
            .eq('artist_id', this.artistId)
            .order('release_date', { ascending: false });

        const container = document.querySelector('.release-grid');
        if (container && releases) {
            container.innerHTML = releases.map(release => `
                <div class="release-card" onclick="window.location.href='/pages/release.html?id=${release.id}'">
                    <div class="release-img" style="background-image: url('${release.cover_url}')"></div>
                    <h3>${release.title}</h3>
                    <p>${new Date(release.release_date).getFullYear()}</p>
                </div>
            `).join('');
        }
    }

    async loadTracks() {
        const { data: tracks } = await supabase
            .from('songs')
            .select('*')
            .eq('artist_id', this.artistId)
            .order('popularity', { ascending: false })
            .limit(10);

        const container = document.querySelector('.track-list');
        if (container && tracks) {
            container.innerHTML = tracks.map(track => `
                <div class="track-item" data-track-id="${track.id}">
                    <img src="${track.cover_url}" alt="${track.title}" width="40" height="40">
                    <div class="track-info">
                        <h4>${track.title}</h4>
                        <p>${track.duration}</p>
                    </div>
                </div>
            `).join('');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new ArtistPage();
});
