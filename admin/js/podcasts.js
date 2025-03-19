import { supabase } from '../../js/supabase.js';
import { parsePodcastFeed } from '../../js/services/rss.js';

export async function loadPodcastFeed(feed_url, podcastId) {
    try {
        const podcastData = await parsePodcastFeed(feed_url);
        
        // Validate required fields
        if (!podcastData.title) {
            throw new Error('Podcast feed missing title');
        }
        
        // Update podcast info using upsert
        const { error: podcastError } = await supabase
            .from('podcasts')
            .upsert({
                id: podcastId,
                title: podcastData.title,
                description: podcastData.description || '',
                image_url: podcastData.image || '',
                feed_url: feed_url,
                last_fetched: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'id',
                ignoreDuplicates: false
            });

        if (podcastError) throw podcastError;

        // Insert/update episodes
        const episodes = podcastData.episodes.map(episode => ({
            podcast_id: podcastId,
            title: episode.title,
            description: episode.description,
            audio_url: episode.audioUrl,
            duration: episode.duration,
            episode_number: episode.episodeNumber,
            published_at: new Date(episode.pubDate).toISOString()
        }));

        // Use upsert to avoid duplicates
        const { error: episodesError } = await supabase
            .from('podcast_episodes')
            .upsert(episodes, {
                onConflict: 'podcast_id,audio_url',
                ignoreDuplicates: true
            });

        if (episodesError) throw episodesError;

        return { success: true };
    } catch (error) {
        console.error('Feed update failed:', error);
        
        // Update podcast with error state
        await supabase
            .from('podcasts')
            .update({
                status: 'error',
                description: `Failed to load: ${error.message}`
            })
            .eq('id', podcastId);
            
        throw error;
    }
}
