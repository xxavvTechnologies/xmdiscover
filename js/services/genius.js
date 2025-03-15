const GENIUS_API_URL = 'https://api.genius.com';
const PROXY_URL = 'https://corsproxy.io/?'; // CORS proxy for scraping

export async function searchSong(title, artist) {
    try {
        const response = await fetch(`/.netlify/functions/genius-proxy?search=${encodeURIComponent(`${title} ${artist}`)}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const text = await response.text();
        try {
            const data = JSON.parse(text);
            const hits = data.response?.hits;
            if (hits?.length > 0) {
                return hits[0].result.url;
            }
        } catch (parseError) {
            console.error('Failed to parse Genius response:', parseError);
            console.log('Response text:', text);
        }
        return null;
    } catch (error) {
        console.error('Failed to search Genius:', error);
        return null;
    }
}

export async function getLyrics(url) {
    if (!url) return null;
    
    try {
        const response = await fetch(`/.netlify/functions/genius-proxy?url=${encodeURIComponent(url)}`);
        const data = await response.json();
        return data.lyrics;
    } catch (error) {
        console.error('Failed to fetch lyrics:', error);
        return null;
    }
}
