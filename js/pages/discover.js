import { supabase, getPagePath } from '../supabase.js';

class DiscoverPage {
    constructor() {
        this.loadContent();
    }

    async loadContent() {
        try {
            await Promise.all([
                this.loadFeaturedPlaylists(),
                this.loadTopArtists(),
                this.loadPopularPodcasts(), // Add this
            ]);
        } catch (error) {
            console.error('Failed to load content:', error);
        }
    }

    async loadFeaturedPlaylists() {
        const { data: playlists } = await supabase
            .from('playlists')
            .select('*')
            .eq('status', 'published')
            .order('updated_at', { ascending: false })
            .limit(6);

        const container = document.querySelector('.playlists-section');
        if (container && playlists?.length) {
            container.innerHTML = `
                <h2>Featured Playlists</h2>
                <div class="playlist-grid">
                    ${playlists.map(playlist => `
                        <div class="playlist-card" onclick="window.location.href='${getPagePath('/pages/playlist')}?id=${playlist.id}'">
                            <div class="playlist-img" style="background-image: url('${playlist.cover_url}')"></div>
                            <h3>${playlist.name}</h3>
                            <p>${playlist.description || ''}</p>
                        </div>
                    `).join('')}
                </div>
            `;
        }
    }

    async loadTopArtists() {
        const { data: artists } = await supabase
            .from('artists')
            .select('*')
            .eq('status', 'published')
            .order('updated_at', { ascending: false })
            .limit(6);

        const container = document.querySelector('.artists-section');
        if (container && artists?.length) {
            container.innerHTML = `
                <h2>Top Artists</h2>
                <div class="artist-grid">
                    ${artists.map(artist => `
                        <div class="artist-card" onclick="window.location.href='${getPagePath('/pages/artist')}?id=${artist.id}'">
                            <div class="artist-img" style="background-image: url('${artist.image_url}')"></div>
                            <h3>${artist.name}</h3>
                            <p>${artist.genres.join(', ')}</p>
                        </div>
                    `).join('')}
                </div>
            `;
        }
    }

    async loadPopularPodcasts() {
        const { data: podcasts } = await supabase
            .from('podcasts')
            .select('*')
            .eq('status', 'published')
            .order('updated_at', { ascending: false })
            .limit(6);

        const container = document.querySelector('.podcasts-section');
        if (container && podcasts?.length) {
            container.innerHTML = `
                <h2>Popular Podcasts</h2>
                <div class="podcast-grid">
                    ${podcasts.map(podcast => `
                        <div class="podcast-card" onclick="window.location.href='${getPagePath('/pages/podcast')}?id=${podcast.id}'">
                            <div class="podcast-img" style="background-image: url('${podcast.image_url}')"></div>
                            <h3>${podcast.title}</h3>
                            <p>${podcast.description || ''}</p>
                        </div>
                    `).join('')}
                </div>
            `;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new DiscoverPage();
});