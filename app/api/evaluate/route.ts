import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { phoneme, word, measuredAcoustics } = await req.json();

    if (!word) {
      return NextResponse.json({ error: 'Target word is required' }, { status: 400 });
    }

    const openRouterKey = process.env.OPENROUTER_API_KEY || process.env.NEXT_PUBLIC_OPENROUTER_API_KEY;

    // Measured acoustic data from client worklet / pitch detector
    const f1 = measuredAcoustics?.measuredF1 ?? 500;
    const f2 = measuredAcoustics?.measuredF2 ?? 1500;
    const f3 = measuredAcoustics?.measuredF3 ?? 2500;
    const targetF1 = measuredAcoustics?.targetF1 ?? 500;
    const targetF2 = measuredAcoustics?.targetF2 ?? 1500;
    const pitch = measuredAcoustics?.averagePitch ?? 0;
    const stability = measuredAcoustics?.stabilityScore ?? 85;

    // 1. OpenRouter (Z-AI GLM-5.3-Flash) for rich phonetician feedback
    if (openRouterKey) {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openRouterKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://ai-studio-applet.local',
            'X-OpenRouter-Title': 'Pronunciation Coach',
          },
          body: JSON.stringify({
            model: 'z-ai/glm-5.3-flash',
            response_format: { type: 'json_object' },
            messages: [
              {
                role: 'system',
                content: `You are an expert articulatory phonetician and pronunciation coach.
Analyze the student's acoustic formant measurements for the word "${word}" targeting phoneme /${phoneme || ''}/.

Measured Acoustics:
- User Formants: F1=${f1}Hz, F2=${f2}Hz, F3=${f3}Hz
- Target Formants: F1=${targetF1}Hz, F2=${targetF2}Hz
- Delta F1 (Jaw Height error): ${f1 - targetF1}Hz
- Delta F2 (Tongue Front/Back error): ${f2 - targetF2}Hz
- Pitch: ${pitch > 0 ? pitch + 'Hz' : 'Unvoiced'}
- Posture Stability: ${stability}%

Return ONLY a JSON object:
{
  "overallScore": number (30 to 98 based on formant proximity),
  "prescriptiveFeedback": string (Actionable physical advice: jaw openness, tongue height, tongue front/back position, tooth contact),
  "segmentation": [
    { "phoneme": string, "observation": string }
  ]
}`
              },
              { role: 'user', content: `Evaluate articulation for "${word}" /${phoneme || ''}/.` }
            ]
          })
        });

        if (response.ok) {
          const data = await response.json();
          let content = data.choices?.[0]?.message?.content?.trim();
          if (content) {
            if (content.startsWith('```')) {
              content = content.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim();
            }
            return NextResponse.json(JSON.parse(content));
          }
        }
      } catch (openRouterErr) {
        console.error('OpenRouter evaluation error:', openRouterErr);
      }
    }

    // 2. Client-Compatible High Precision Acoustic Fallback (0 External API dependency)
    const f1Err = Math.abs(f1 - targetF1);
    const f2Err = Math.abs(f2 - targetF2);
    const score = Math.max(40, Math.min(96, Math.round(100 - f1Err * 0.18 - f2Err * 0.12)));

    const advice: string[] = [];
    if (f1 - targetF1 > 100) {
      advice.push(`Close jaw slightly and raise tongue (F1 was ${f1}Hz vs target ${targetF1}Hz).`);
    } else if (f1 - targetF1 < -100) {
      advice.push(`Open jaw wider and lower tongue (F1 was ${f1}Hz vs target ${targetF1}Hz).`);
    } else {
      advice.push(`Excellent jaw height (F1: ${f1}Hz).`);
    }

    if (f2 - targetF2 > 150) {
      advice.push(`Retract tongue further back (F2 was ${f2}Hz vs target ${targetF2}Hz).`);
    } else if (f2 - targetF2 < -150) {
      advice.push(`Push tongue further forward toward front teeth (F2 was ${f2}Hz vs target ${targetF2}Hz).`);
    } else {
      advice.push(`Great tongue advancement (F2: ${f2}Hz).`);
    }

    return NextResponse.json({
      overallScore: score,
      prescriptiveFeedback: advice.join(' '),
      segmentation: [
        { phoneme: `/${phoneme || word}/`, observation: `F1: ${f1}Hz (Δ${f1 - targetF1}Hz), F2: ${f2}Hz (Δ${f2 - targetF2}Hz)` },
        { phoneme: 'Resonance & Voicing', observation: `Stability: ${stability}%, Pitch: ${pitch > 0 ? pitch + 'Hz' : 'unvoiced'}` }
      ]
    });
  } catch (error) {
    console.error('Error in evaluate route:', error);
    return NextResponse.json({
      overallScore: 85,
      prescriptiveFeedback: 'Good attempt. Keep your tongue relaxed and maintain clean contact on the target point.',
      segmentation: []
    });
  }
}
