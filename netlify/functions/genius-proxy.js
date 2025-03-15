const axios = require('axios');
const cheerio = require('cheerio');

exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const { url, search } = event.queryStringParameters;

    try {
        if (search) {
            // Handle Genius API search
            const response = await axios.get(`https://api.genius.com/search?q=${search}`, {
                headers: {
                    'Authorization': `Bearer ${process.env.GENIUS_ACCESS_TOKEN}`
                }
            });
            return {
                statusCode: 200,
                body: JSON.stringify(response.data)
            };
        } else if (url) {
            // Update lyrics scraping logic
            const response = await axios.get(url);
            const $ = cheerio.load(response.data);
            
            // Try multiple possible selectors and methods
            const lyricsSelectors = [
                '[class*="Lyrics__Container"]',
                '[class*="lyrics"]',
                '.lyrics',
                '.song_body-lyrics',
                'div[class^="Lyrics"]',
                'div[class*="Lyrics"]'
            ];
            
            let lyrics = '';
            
            // Method 1: Direct selector
            for (const selector of lyricsSelectors) {
                const element = $(selector);
                if (element.length) {
                    lyrics = element.text().trim();
                    break;
                }
            }
            
            // Method 2: Search by data attributes if Method 1 failed
            if (!lyrics) {
                $('[data-lyrics-container="true"]').each((i, el) => {
                    lyrics += $(el).text().trim() + '\n';
                });
            }

            // Method 3: Find lyrics in structured data if both methods failed
            if (!lyrics) {
                const scriptTags = $('script[type="application/ld+json"]');
                scriptTags.each((i, el) => {
                    try {
                        const data = JSON.parse($(el).html());
                        if (data.lyrics) {
                            lyrics = data.lyrics;
                        }
                    } catch (e) {
                        console.error('JSON parse failed:', e);
                    }
                });
            }

            if (!lyrics) {
                throw new Error('Could not locate lyrics content');
            }

            // Clean up the lyrics
            lyrics = lyrics
                .replace(/\[.+?\]/g, '') // Remove [] annotations
                .replace(/\n{3,}/g, '\n\n') // Normalize line breaks
                .replace(/\s{2,}/g, ' ') // Normalize spaces
                .trim();

            // Add caching headers
            const headers = {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
                'Vary': 'Accept-Encoding'
            };

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ lyrics })
            };
        }

        return {
            statusCode: 400,
            body: 'Missing url or search parameter'
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
