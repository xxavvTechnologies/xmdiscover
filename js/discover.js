import { supabase } from './supabase.js';

class DiscoverUI {
    constructor() {
        this.loadContent();
    }

    async loadContent() {
        try {
            await Promise.all([
                this.loadNewReleases(),
                this.loadPopularArtists(),
                this.loadFeaturedPlaylists()
            ]);
        } catch (error) {
            console.error('Failed to load discover content:', error);
        }
    }

    async loadNewReleases() {
        const { data: releases } = await supabase
            .from('albums')
            .select(`
                *,
                artists (
                    name,
                    genres
                )
            `)
            .eq('status', 'published')
            .order('release_date', { ascending: false })
            .limit(6);

        const container = document.querySelector('[data-content="new-releases"]');
        if (container && releases) {
            container.innerHTML = releases.map(release => `
                <div class="playlist-card" onclick="window.location.href='/pages/release.html?id=${release.id}'">
                    <div class="playlist-img" style="background-image: url('${release.cover_url}')"></div>
                    <h3>${release.title}</h3>
                    <p>${release.artists.name}</p>
                </div>
            `).join('');
        }
    }

    async loadPopularArtists() {
        const { data: artists } = await supabase
            .from('artists')
            .select('*')
            .eq('status', 'published')
            .order('popularity', { ascending: false })
            .limit(6);

        const container = document.querySelector('[data-content="artists"]');
        if (container && artists) {
            container.innerHTML = artists.map(artist => `
                <div class="artist-card" onclick="window.location.href='/pages/artist.html?id=${artist.id}'">
                    <div class="artist-img" style="background-image: url('${artist.image_url}')"></div>
                    <h3>${artist.name}</h3>
                    <p>${artist.genres?.join(', ') || ''}</p>
                </div>
            `).join('');
        }
    }

    async loadFeaturedPlaylists() {
        const { data: playlists } = await supabase
            .from('playlists')
            .select(`
                *,
                profiles (
                    username,
                    display_name
                )
            `)
            .eq('status', 'published')
            .eq('featured', true)
            .limit(6);

        const container = document.querySelector('[data-content="playlists"]');
        if (container && playlists) {
            container.innerHTML = playlists.map(playlist => `
                <div class="playlist-card" onclick="window.location.href='/pages/playlist.html?id=${playlist.id}'">
                    <div class="playlist-img" style="background-image: url('${playlist.cover_url}')"></div>
                    <h3>${playlist.name}</h3>
                    <p>Created by ${playlist.profiles.display_name || playlist.profiles.username}</p>
                </div>
            `).join('');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new DiscoverUI();
});
