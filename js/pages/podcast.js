import { supabase, getPagePath } from '../supabase.js';

class PodcastPage {
    constructor() {
        this.podcastId = new URLSearchParams(window.location.search).get('id');
        if (!this.podcastId) {
            window.location.href = getPagePath('/discover');
            return;
        }
        this.loadPodcast();
    }

    async loadPodcast() {
        try {
            const { data: podcast } = await supabase
                .from('podcasts')
                .select('*')
                .eq('id', this.podcastId)
                .single();

            if (!podcast) throw new Error('Podcast not found');

            // Update UI with podcast info
            document.title = `${podcast.title} - xM DiScover`;
            document.querySelector('.podcast-title').textContent = podcast.title;
            document.querySelector('.podcast-description').textContent = podcast.description;
            document.querySelector('.podcast-image').style.backgroundImage = `url('${podcast.image_url}')`;

            // Load episodes
            const { data: episodes } = await supabase
                .from('podcast_episodes')
                .select('*')
                .eq('podcast_id', this.podcastId)
                .order('published_at', { ascending: false });

            const container = document.querySelector('.episode-list');
            if (container && episodes) {
                container.innerHTML = episodes.map((episode, index) => `
                    <div class="episode-item" data-episode-id="${episode.id}">
                        <div class="episode-number">#${episode.episode_number || (episodes.length - index)}</div>
                        <div class="episode-info">
                            <h3>${episode.title}</h3>
                            <p>${episode.description}</p>
                            <span class="episode-meta">
                                ${new Date(episode.published_at).toLocaleDateString()} • 
                                ${episode.duration}
                            </span>
                        </div>
                        <button class="play-episode"><i class="ri-play-fill"></i></button>
                    </div>
                `).join('');

                // Add click handlers
                container.querySelectorAll('.episode-item').forEach(item => {
                    item.addEventListener('click', async () => {
                        const episodeId = item.dataset.episodeId;
                        const episode = episodes.find(e => e.id === episodeId);
                        
                        const playEvent = new CustomEvent('xm-play-track', {
                            detail: {
                                id: episode.id,
                                title: episode.title,
                                artist: podcast.title, // Use podcast title as artist
                                audioUrl: episode.audio_url,
                                coverUrl: podcast.image_url,
                                type: 'podcast'
                            }
                        });
                        document.dispatchEvent(playEvent);
                    });
                });
            }
        } catch (error) {
            console.error('Failed to load podcast:', error);
            alert('Podcast not found');
            window.location.href = getPagePath('/discover');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new PodcastPage();
});
