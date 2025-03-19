const GENIUS_API_URL = '/.netlify/functions/genius-proxy';

export async function searchSong(title, artist) {
  try {
    const searchQuery = `${title} ${artist}`.trim();
    const response = await fetch(`${GENIUS_API_URL}?search=${encodeURIComponent(searchQuery)}`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    const hit = data.response?.hits?.[0]?.result;
    
    if (!hit) {
      return null;
    }

    return hit.url;
  } catch (error) {
    console.error('Failed to search Genius:', error);
    return null;
  }
}

export async function getLyrics(url) {
  if (!url) return null;
  
  try {
    const response = await fetch(`${GENIUS_API_URL}?url=${encodeURIComponent(url)}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.lyrics || null;
  } catch (error) {
    console.error('Failed to fetch lyrics:', error);
    return null;
  }
}
