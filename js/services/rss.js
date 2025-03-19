export async function parsePodcastFeed(url) {
    try {
        console.log('Fetching feed:', url);
        
        // Try up to 3 times
        let response;
        let attempts = 0;
        const maxAttempts = 3;
        
        while (attempts < maxAttempts) {
            try {
                // Use the full Netlify function URL
                response = await fetch(`/.netlify/functions/rss-proxy?url=${encodeURIComponent(url)}`, {
                    headers: {
                        'Accept': 'application/xml, text/xml, application/rss+xml'
                    }
                });
                
                if (response.ok) break;
                
                attempts++;
                if (attempts === maxAttempts) {
                    throw new Error(`Failed to fetch podcast feed after ${maxAttempts} attempts`);
                }
                
                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
                console.warn(`Attempt ${attempts + 1} failed:`, error);
                attempts++;
                if (attempts === maxAttempts) throw error;
            }
        }

        const text = await response.text();
        
        // Quick validation check
        if (!text.includes('<rss') && !text.includes('<feed')) {
            console.error('Invalid feed content:', text.substring(0, 500));
            throw new Error('Invalid RSS feed format: Not a valid RSS/Atom feed');
        }

        console.log('Received feed content:', text.substring(0, 200) + '...');
        
        const parser = new DOMParser();
        const xml = parser.parseFromString(text, 'text/xml');

        // Check for parse errors
        const parseError = xml.querySelector('parsererror');
        if (parseError) {
            console.error('XML Parse Error:', parseError.textContent);
            throw new Error('Invalid RSS feed format: Parse error');
        }

        // Try different possible selectors for RSS/Atom feeds
        const title = xml.querySelector('channel > title, feed > title')?.textContent?.trim() || 'Untitled Podcast';
        const description = xml.querySelector('channel > description, feed > subtitle, feed > description')?.textContent?.trim() || '';
        const image = xml.querySelector('channel > image > url, feed > logo, channel > *[href]')?.textContent || 
                     xml.querySelector('channel > itunes\\:image, feed > itunes\\:image')?.getAttribute('href') ||
                     'https://d2zcpib8duehag.cloudfront.net/xmdiscover-default-podcast.png';

        // Handle both RSS and Atom item formats
        const items = xml.querySelectorAll('item, entry');
        console.log('Found episodes:', items.length);
        
        const episodes = Array.from(items).map((item, index) => ({
            title: item.querySelector('title')?.textContent?.trim() || `Episode ${index + 1}`,
            description: item.querySelector('description, summary, content')?.textContent?.trim() || '',
            pubDate: item.querySelector('pubDate, published')?.textContent || new Date().toISOString(),
            duration: item.querySelector('itunes\\:duration')?.textContent || '00:00',
            audioUrl: item.querySelector('enclosure')?.getAttribute('url') || 
                     item.querySelector('link[type="audio/mpeg"], link[type="audio/mp3"]')?.getAttribute('href') || '',
            episodeNumber: item.querySelector('itunes\\:episode')?.textContent || (index + 1).toString()
        })).filter(episode => episode.audioUrl); // Only include episodes with audio URLs

        return {
            title,
            description,
            image,
            episodes
        };
    } catch (error) {
        console.error('Failed to parse podcast feed:', error);
        throw new Error(`RSS Feed Error: ${error.message}`);
    }
}
