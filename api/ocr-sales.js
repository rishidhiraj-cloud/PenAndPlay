const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL = 'claude-sonnet-5';

const EXTRACTION_PROMPT = `You are reading a photo of a handwritten page from a small retail shop's sales diary. Each line typically records one item that was sold and the sale amount in Indian Rupees.

Extract every sale line you can confidently read from this image.

Respond with ONLY a JSON array (no markdown code fences, no explanation, no other text) in exactly this format:
[{"item": "<item name as written>", "amount": <number>}]

Rules:
- If a line is illegible or you are not confident about the item name or amount, omit that line entirely rather than guessing.
- If you cannot identify any sale lines at all in this image, respond with exactly: []
- amount must be a plain number (e.g. 150 or 150.5), not a string, with no currency symbol or commas.`;

function parseDataUrl(dataUrl) {
    const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl || '');
    if (!match) return null;
    return { mediaType: match[1], base64Data: match[2] };
}

function parseExtractedLines(text) {
    const cleaned = String(text || '')
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/```\s*$/, '')
        .trim();

    let parsed;
    try {
        parsed = JSON.parse(cleaned);
    } catch (err) {
        return [];
    }

    if (!Array.isArray(parsed)) return [];

    return parsed
        .filter(row => row && typeof row.item === 'string' && row.item.trim() && Number.isFinite(Number(row.amount)) && Number(row.amount) > 0)
        .map(row => ({ item: row.item.trim(), amount: Number(row.amount) }));
}

async function extractLinesFromImage(dataUrl) {
    const parsedImage = parseDataUrl(dataUrl);
    if (!parsedImage) {
        console.error('❌ Invalid image data URL received');
        return [];
    }

    try {
        const response = await fetch(ANTHROPIC_API_URL, {
            method: 'POST',
            headers: {
                'x-api-key': process.env.ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                model: ANTHROPIC_MODEL,
                max_tokens: 2048,
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'image', source: { type: 'base64', media_type: parsedImage.mediaType, data: parsedImage.base64Data } },
                        { type: 'text', text: EXTRACTION_PROMPT }
                    ]
                }]
            })
        });

        const json = await response.json();

        if (!response.ok) {
            console.error('❌ Anthropic API error:', json);
            return [];
        }

        const text = json.content && json.content[0] && json.content[0].text;
        return parseExtractedLines(text);
    } catch (err) {
        console.error('❌ Error calling Anthropic API:', err);
        return [];
    }
}

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    if (!process.env.ANTHROPIC_API_KEY) {
        res.status(500).json({ error: 'Server is not configured with an Anthropic API key.' });
        return;
    }

    const { images } = req.body || {};

    if (!Array.isArray(images) || images.length === 0) {
        res.status(400).json({ error: 'Request body must include a non-empty "images" array.' });
        return;
    }

    const results = await Promise.all(images.map(extractLinesFromImage));
    const lines = results.flat();

    res.status(200).json({ lines });
};

module.exports.parseExtractedLines = parseExtractedLines;
