import { supabase, getPagePath } from './supabase.js';

class PodcastsUI {
    constructor() {
        this.sortSelect = document.getElementById('sort-select');
        this.setupEventListeners();
        this.loadContent();
    }

    setupEventListeners() {
        this.sortSelect?.addEventListener('change', () => this.loadAllPodcasts());
    }

    async loadContent() {
        try {
            await Promise.all([
                this.loadFeaturedPodcasts(),
                this.loadAllPodcasts()
            ]);
        } catch (error) {
            console.error('Failed to load podcasts:', error);
        }
    }

    async loadFeaturedPodcasts() {
        const { data: podcasts } = await supabase
            .from('podcasts')
            .select('*')
            .eq('status', 'published')
            .eq('featured', true)
            .limit(6);

        const container = document.querySelector('[data-content="featured"]');
        this.renderPodcasts(container, podcasts);
    }

    async loadAllPodcasts() {
        let query = supabase
            .from('podcasts')
            .select('*, podcast_episodes(count)')
            .eq('status', 'published');

        // Apply sorting
        switch (this.sortSelect?.value) {
            case 'name':
                query = query.order('title');
                break;
            case 'episodes':
                query = query.order('podcast_episodes.count', { ascending: false });
                break;
            default: // recent
                query = query.order('updated_at', { ascending: false });
        }

        const { data: podcasts } = await query;
        const container = document.querySelector('[data-content="all"]');
        this.renderPodcasts(container, podcasts);
    }

    renderPodcasts(container, podcasts) {
        if (!container) return;
        
        if (!podcasts?.length) {
            container.innerHTML = '<p class="no-content">No podcasts available</p>';
            return;
        }

        container.innerHTML = podcasts.map(podcast => `
            <div class="podcast-card" onclick="window.location.href='${getPagePath('/pages/podcast')}?id=${podcast.id}'">
                <div class="podcast-img" style="background-image: url('${podcast.image_url}')"></div>
                <h3>${podcast.title}</h3>
                <p>${podcast.description || ''}</p>
                ${podcast.podcast_episodes?.[0]?.count ? 
                    `<span class="episode-count">${podcast.podcast_episodes[0].count} episodes</span>` : 
                    ''}
            </div>
        `).join('');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new PodcastsUI();
});
