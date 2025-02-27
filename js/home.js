import { supabase } from './supabase-config.js';
import { player } from './player.js';
import { requireAuth } from './authCheck.js';

class HomeView {
    constructor() {
        this.init();
    }

    async init() {
        const user = await requireAuth();
        if (!user) return;
        
        this.loadContent();
    }

    async loadContent() {
        await Promise.all([
            this.loadFeaturedContent(),
            this.loadRecentPlays(),
            this.loadRecommendations()
        ]);
    }

    async loadFeaturedContent() {
        const { data: albums } = await supabase
            .from('albums')
            .select('*, artists(name)')
            .limit(5);

        document.getElementById('featured-content').innerHTML = `
            <h2>Featured Albums</h2>
            <div class="featured-grid">
                ${albums?.map(album => `
                    <div class="featured-item" onclick="window.location.href='album.html?id=${album.id}'">
                        <img src="${album.cover_art_url}" alt="${album.title}">
                        <h3>${album.title}</h3>
                        <p>${album.artists.name}</p>
                    </div>
                `).join('') || ''}
            </div>
        `;
    }

    async loadRecentPlays() {
        // Implement recent plays loading
    }

    async loadRecommendations() {
        // Implement recommendations loading
    }
}

new HomeView();
