import { supabase } from '../supabase.js';

class ReleasePage {
    constructor() {
        this.releaseId = new URLSearchParams(window.location.search).get('id');
        if (!this.releaseId) {
            window.location.href = '/discover.html';
            return;
        }
        this.loadRelease();
    }

    async loadRelease() {
        try {
            const { data: release } = await supabase
                .from('albums')
                .select(`
                    *,
                    artists (
                        id,
                        name,
                        image_url
                    )
                `)
                .eq('id', this.releaseId)
                .single();

            if (!release) throw new Error('Release not found');

            this.updateUI(release);
            await Promise.all([
                this.loadTracks(release.id),
                this.loadMoreFromArtist(release.artist_id, release.id)
            ]);
        } catch (error) {
            console.error('Failed to load release:', error);
            alert('Release not found');
            window.location.href = '/discover.html';
        }
    }

    updateUI(release) {
        document.title = `${release.title} by ${release.artists.name} - xM DiScover`;
        document.querySelector('.release-title').textContent = release.title;
        document.querySelector('.release-type').textContent = release.type || 'Album';
        
        const artistLink = document.querySelector('.artist-link');
        artistLink.textContent = release.artists.name;
        artistLink.href = `/pages/artist.html?id=${release.artists.id}`;
        
        document.querySelector('.release-year').textContent = new Date(release.release_date).getFullYear();
        document.querySelector('.release-image').style.backgroundImage = `url('${release.cover_url}')`;
    }

    async loadTracks(albumId) {
        const { data: tracks } = await supabase
            .from('songs')
            .select('*')
            .eq('album_id', albumId)
            .order('track_number', { ascending: true });

        const container = document.querySelector('.track-list');
        if (container && tracks) {
            container.innerHTML = tracks.map(track => `
                <div class="track-item" data-track-id="${track.id}">
                    <span class="track-number">${track.track_number}</span>
                    <div class="track-info">
                        <h4>${track.title}</h4>
                        <p>${track.duration}</p>
                    </div>
                </div>
            `).join('');
            
            // Update track count
            document.querySelector('.release-tracks').textContent = `${tracks.length} tracks`;
        }
    }

    async loadMoreFromArtist(artistId, currentReleaseId) {
        const { data: releases } = await supabase
            .from('albums')
            .select('*')
            .eq('artist_id', artistId)
            .neq('id', currentReleaseId)
            .order('release_date', { ascending: false })
            .limit(6);

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
}

document.addEventListener('DOMContentLoaded', () => {
    new ReleasePage();
});
