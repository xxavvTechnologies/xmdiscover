const { createClient } = require('@supabase/supabase-js');
const { parsePodcastFeed } = require('../../js/services/rss.js');

exports.handler = async (event, context) => {
    // Only allow scheduled events
    if (!event.headers['x-trigger'] === 'SCHEDULED') {
        return { statusCode: 405, body: 'Method not allowed' };
    }

    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY
    );

    try {
        // Get all active podcasts
        const { data: podcasts } = await supabase
            .from('podcasts')
            .select('id, feed_url')
            .eq('status', 'published');

        // Update each podcast
        for (const podcast of podcasts) {
            try {
                const podcastData = await parsePodcastFeed(podcast.feed_url);
                
                // Update podcast info
                await supabase
                    .from('podcasts')
                    .update({
                        title: podcastData.title,
                        description: podcastData.description,
                        image_url: podcastData.image,
                        last_fetched: new Date().toISOString()
                    })
                    .eq('id', podcast.id);

                // Insert new episodes
                const episodes = podcastData.episodes.map(episode => ({
                    podcast_id: podcast.id,
                    title: episode.title,
                    description: episode.description,
                    audio_url: episode.audioUrl,
                    duration: episode.duration,
                    episode_number: parseInt(episode.episodeNumber) || null, // Ensure proper number parsing
                    published_at: new Date(episode.pubDate).toISOString()
                }));

                await supabase
                    .from('podcast_episodes')
                    .upsert(episodes, {
                        onConflict: 'podcast_id,audio_url',
                        ignoreDuplicates: true
                    });

            } catch (error) {
                console.error(`Failed to update podcast ${podcast.id}:`, error);
                // Continue with next podcast
                continue;
            }
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Podcasts updated successfully' })
        };
    } catch (error) {
        console.error('Failed to update podcasts:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to update podcasts' })
        };
    }
};
