const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL = 'claude-sonnet-5';

function buildPrompt(question, context) {
    return `You are answering a shopkeeper's question about their sales data, in Hinglish (Hindi written in Latin/Roman script, mixed naturally with English — not pure Hindi script, not pure English).

Here is a summary of their sales data for the period "${context.period}":
${JSON.stringify(context, null, 2)}

Rules:
- Answer ONLY using the numbers in the JSON above. Never invent or guess figures not present there.
- Respond in Hinglish, written in Roman/Latin script.
- Keep the answer to 1-2 sentences — short and direct, not a report.
- If the question cannot be answered from the data above (asks about something outside this summary), say so honestly in Hinglish rather than guessing.

Question: ${question}

Respond with ONLY the answer text, no preamble, no markdown formatting.`;
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

    const { question, context } = req.body || {};

    if (typeof question !== 'string' || !question.trim()) {
        res.status(400).json({ error: 'Request body must include a non-empty "question" string.' });
        return;
    }
    if (!context || typeof context !== 'object' || Array.isArray(context)) {
        res.status(400).json({ error: 'Request body must include a "context" object.' });
        return;
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
                max_tokens: 512,
                messages: [{ role: 'user', content: buildPrompt(question, context) }]
            })
        });

        const json = await response.json();

        if (!response.ok) {
            console.error('❌ Anthropic API error:', json);
            res.status(502).json({ error: 'Could not get an answer from the AI service.' });
            return;
        }

        const textBlock = Array.isArray(json.content) ? json.content.find(block => block && block.type === 'text') : null;
        const answer = textBlock && textBlock.text ? textBlock.text.trim() : '';

        if (!answer) {
            res.status(502).json({ error: 'AI service returned no answer text.' });
            return;
        }

        res.status(200).json({ answer });
    } catch (err) {
        console.error('❌ Error calling Anthropic API:', err);
        res.status(502).json({ error: 'Could not reach the AI service.' });
    }
};
