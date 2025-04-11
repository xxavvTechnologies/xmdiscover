const GENIUS_API_URL = '/.netlify/functions/genius-proxy';
const MAX_RETRIES = 2;

export async function searchSong(title, artist, retryCount = 0) {
    try {
        const searchQuery = `${title} ${artist}`.trim();
        const response = await fetch(`${GENIUS_API_URL}?search=${encodeURIComponent(searchQuery)}`);
        
        if (!response.ok) {
            if (retryCount < MAX_RETRIES) {
                await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
                return searchSong(title, artist, retryCount + 1);
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        const hit = data.response?.hits?.[0]?.result;
        
        return hit?.url || null;
    } catch (error) {
        console.error('Failed to search Genius:', error);
        return null;
    }
}

export async function getLyrics(title, artist, retryCount = 0) {
    try {
        // First search for the song
        const songUrl = await searchSong(title, artist);
        if (!songUrl) {
            return null;
        }

        // Then fetch lyrics using the song URL
        const response = await fetch(`${GENIUS_API_URL}?url=${encodeURIComponent(songUrl)}`);
        if (!response.ok) {
            if (retryCount < MAX_RETRIES) {
                await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
                return getLyrics(title, artist, retryCount + 1);
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data.lyrics || null;
    } catch (error) {
        console.error('Failed to fetch lyrics:', error);
        return `Unable to load lyrics for ${title} by ${artist}.\nPlease try again later.`;
    }
}
