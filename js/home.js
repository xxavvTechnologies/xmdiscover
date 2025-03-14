import { supabase } from './supabase.js';

class HomeUI {
    constructor() {
        this.loadFeatured();
    }

    async loadFeatured() {
        try {
            const { data: playlists } = await supabase
                .from('playlists')
                .select('*')
                .eq('status', 'published')
                .eq('featured', true)
                .limit(3);

            const container = document.querySelector('.playlist-grid');
            if (container && playlists) {
                container.innerHTML = playlists.map(playlist => `
                    <div class="playlist-card" onclick="window.location.href='/pages/playlist.html?id=${playlist.id}'">
                        <div class="playlist-img" style="background-image: url('${playlist.cover_url}')"></div>
                        <h3>${playlist.name}</h3>
                        <p>${playlist.description}</p>
                    </div>
                `).join('');
            }
        } catch (error) {
            console.error('Failed to load featured content:', error);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new HomeUI();
});
