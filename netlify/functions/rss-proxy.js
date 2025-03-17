const fetch = require('node-fetch');

exports.handler = async (event) => {
    // Only allow GET requests
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const { url } = event.queryStringParameters;
    
    if (!url) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Missing feed URL parameter' })
        };
    }

    try {
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const feedContent = await response.text();

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/xml',
                'Cache-Control': 'public, max-age=3600' // Cache for 1 hour
            },
            body: feedContent
        };
    } catch (error) {
        console.error('RSS proxy error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch RSS feed' })
        };
    }
};
