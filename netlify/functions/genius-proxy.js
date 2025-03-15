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
            // Handle lyrics scraping
            const response = await axios.get(url);
            const $ = cheerio.load(response.data);
            const lyrics = $('[class*="Lyrics__Container"]').text();
            return {
                statusCode: 200,
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
