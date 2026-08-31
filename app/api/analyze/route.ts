import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { word } = await req.json();

    if (!word) {
      return NextResponse.json({ error: 'Word is required' }, { status: 400 });
    }

    // Try OPENROUTER_API_KEY first, fallback to NEXT_PUBLIC_OPENROUTER_API_KEY if they only set that
    const apiKey = process.env.OPENROUTER_API_KEY || process.env.NEXT_PUBLIC_OPENROUTER_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'OpenRouter API Key is missing. Please configure OPENROUTER_API_KEY in your environment.' },
        { status: 500 }
      );
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://ai-studio-applet.local', // Required by OpenRouter
        'X-OpenRouter-Title': 'Pronunciation Coach', // Required by OpenRouter
      },
      body: JSON.stringify({
        model: 'z-ai/glm-5.3-flash',
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are an expert phonetician. Analyze the English word provided by the user.
            Return ONLY a valid JSON object matching this schema:
            {
              "symbol": "string (the IPA symbol of the PRIMARY stressed vowel, e.g. iː, æ, ʌ)",
              "f1": "number (the estimated F1 frequency in Hz for that vowel, e.g. 300 to 800)",
              "f2": "number (the estimated F2 frequency in Hz for that vowel, e.g. 800 to 2200)",
              "description": "string (brief physical description of the tongue/jaw position)",
              "somatosensoryCue": "string (a 'Feel it Here' cue describing the physical sensation, tension, or contact points)",
              "syllables": ["array of strings", "breaking", "the", "word", "down"],
              "intonation": "string (a musical representation like 'da-DA-da' where caps is the stressed syllable)"
            }`
          },
          {
            role: 'user',
            content: word
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenRouter API error:", errorText);
      return NextResponse.json({ error: 'Failed to fetch from AI service' }, { status: response.status });
    }

    const data = await response.json();
    if (data.choices && data.choices[0] && data.choices[0].message) {
      const result = JSON.parse(data.choices[0].message.content);
      return NextResponse.json(result);
    } else {
      return NextResponse.json({ error: 'Invalid response from AI' }, { status: 500 });
    }
  } catch (error) {
    console.error("Error in analyze route:", error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}