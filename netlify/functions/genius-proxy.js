const axios = require('axios');
const cheerio = require('cheerio');

exports.handler = async (event) => {
  try {
    const { search, url } = event.queryStringParameters;
    const headers = {
      'Accept': 'application/json',
      'Authorization': `Bearer ${process.env.GENIUS_ACCESS_TOKEN}`
    };

    // Handle search request
    if (search) {
      const searchUrl = `https://api.genius.com/search?q=${encodeURIComponent(search)}`;
      const { data } = await axios.get(searchUrl, { headers });
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify(data)
      };
    }

    // Handle lyrics scraping request
    if (url) {
      const { data: html } = await axios.get(url);
      const $ = cheerio.load(html);
      
      // Try multiple selectors to find lyrics
      const selectors = [
        '[data-lyrics-container="true"]',
        '.lyrics',
        '.Lyrics__Container-sc-1ynbvzw-6',
        '.song_body-lyrics'
      ];

      let lyrics = '';
      for (const selector of selectors) {
        const element = $(selector);
        if (element.length) {
          lyrics = element.text().trim();
          break;
        }
      }

      if (!lyrics) {
        throw new Error('Could not find lyrics in page');
      }

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=86400' // Cache for 24 hours
        },
        body: JSON.stringify({ lyrics })
      };
    }

    return {
      statusCode: 400,
      body: 'Missing search or url parameter'
    };

  } catch (error) {
    console.error('Genius proxy error:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: error.message })
    };
  }
};
