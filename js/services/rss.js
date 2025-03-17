export async function parsePodcastFeed(url) {
    try {
        const response = await fetch(`/rss-proxy?url=${encodeURIComponent(url)}`);
        if (!response.ok) {
            throw new Error('Failed to fetch podcast feed');
        }
        
        const text = await response.text();
        const parser = new DOMParser();
        const xml = parser.parseFromString(text, 'text/xml');

        // Check for parse errors
        const parseError = xml.querySelector('parsererror');
        if (parseError) {
            throw new Error('Invalid RSS feed format');
        }

        // Parse podcast info with fallbacks
        const title = xml.querySelector('channel > title')?.textContent?.trim() || 'Untitled Podcast';
        const description = xml.querySelector('channel > description')?.textContent?.trim() || '';
        const image = xml.querySelector('channel > image > url')?.textContent || 
                     xml.querySelector('channel > *[href]')?.getAttribute('href') ||
                     'https://d2zcpib8duehag.cloudfront.net/xmdiscover-default-podcast.png';

        // Parse episodes
        const items = xml.querySelectorAll('item');
        const episodes = Array.from(items).map(item => ({
            title: item.querySelector('title')?.textContent,
            description: item.querySelector('description')?.textContent,
            pubDate: item.querySelector('pubDate')?.textContent,
            duration: item.querySelector('itunes\\:duration')?.textContent,
            audioUrl: item.querySelector('enclosure')?.getAttribute('url'),
            episodeNumber: item.querySelector('itunes\\:episode')?.textContent
        }));

        return {
            title,
            description,
            image,
            episodes
        };
    } catch (error) {
        console.error('Failed to parse podcast feed:', error);
        throw new Error(error.message || 'Invalid or inaccessible RSS feed');
    }
}
